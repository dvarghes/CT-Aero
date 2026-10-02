const ALERT_LABEL = {
  delayed_flight: 'delayed flight',
  diverted_flight: 'diverted flight',
  cancelled_flight: 'cancelled flight',
  ground_time_shrink: 'ground-time risk',
  absence: 'absence',
  missing_part: 'missing parts',
  missing_tool: 'missing tools',
  task_overrun: 'task overrun',
  integration_failure: 'integration failure',
};

function rowsBy(rows, key) {
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row[key])) grouped.set(row[key], []);
    grouped.get(row[key]).push(row);
  }
  return grouped;
}

function bool(value) {
  return value === true || value === 1;
}

function ratio(assigned, required) {
  if (!required) return 0;
  return assigned / required;
}

function executionOf(row) {
  if (!row) {
    return {
      state: 'not_started',
      blockedReason: '',
      actualStart: null,
      actualEnd: null,
      actualDurationMin: null,
    };
  }
  return {
    state: row.execution_state,
    blockedReason: row.blocked_reason || '',
    actualStart: row.actual_start,
    actualEnd: row.actual_end,
    actualDurationMin: row.actual_duration_min,
  };
}

function proposalOf(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function readOperation(db) {
  const now = new Date();
  const nowIso = now.toISOString();
  const visits = db.prepare(`
    SELECT t.id, t.station_code, t.shift_code, t.status, t.blocked_reason,
           t.required_hours, t.assigned_hours,
           a.registration AS tail, a.type_code, a.fleet_id,
           s.time_zone,
           f.flight_number, f.window_start, f.window_end,
           w.id AS work_order,
           st.code AS stand_code
    FROM turnaround t
    JOIN aircraft a ON a.registration = t.aircraft_registration
    JOIN station s ON s.code = t.station_code
    JOIN flight f ON f.id = t.flight_id
    LEFT JOIN work_package w ON w.turnaround_id = t.id
    LEFT JOIN stand st ON st.id = t.stand_id
  `).all();

  const turnarounds = visits.map((visit) => {
    const requiredHours = visit.required_hours;
    const assignedHours = visit.assigned_hours;
    return {
      id: visit.id,
      tail: visit.tail,
      type: visit.type_code,
      fleet: visit.fleet_id,
      station: visit.station_code,
      timeZone: visit.time_zone,
      flight: visit.flight_number,
      workOrder: visit.work_order || '',
      stand: visit.stand_code || '',
      windowStart: visit.window_start,
      windowEnd: visit.window_end,
      status: visit.status,
      blockedReason: visit.blocked_reason,
      shift: visit.shift_code,
      requiredHours,
      assignedHours,
      staffFill: ratio(assignedHours, requiredHours),
    };
  });

  const ratingRows = db.prepare('SELECT person_id, fleet_id FROM person_rating').all();
  const licenseRows = db.prepare('SELECT person_id, license_id FROM person_license').all();
  const skillRows = db.prepare('SELECT person_id, skill_id FROM person_skill').all();
  const ratings = rowsBy(ratingRows, 'person_id');
  const licenses = rowsBy(licenseRows, 'person_id');
  const skills = rowsBy(skillRows, 'person_id');
  const dutyRows = db.prepare(`
    SELECT person_id, shift_code, availability
    FROM duty
    WHERE starts_at <= ? AND ends_at > ?
  `).all(nowIso, nowIso);
  const dutyByPerson = new Map(dutyRows.map((duty) => [duty.person_id, duty]));
  const people = db.prepare(`
    SELECT id, name, home_station, team, max_hours, hours_already_worked
    FROM person
  `).all().map((person) => {
    const duty = dutyByPerson.get(person.id);
    return {
      id: person.id,
      name: person.name,
      station: person.home_station,
      team: person.team,
      shift: duty?.shift_code || 'Day',
      ratings: (ratings.get(person.id) || []).map((row) => row.fleet_id),
      licenses: (licenses.get(person.id) || []).map((row) => row.license_id),
      skills: (skills.get(person.id) || []).map((row) => row.skill_id),
      availability: duty?.availability || 'off',
      maxHours: person.max_hours,
      hoursAlreadyWorked: person.hours_already_worked,
    };
  });

  const shifts = db.prepare(`
    SELECT code, start_local, end_local, coverage_license_id, minimum_count
    FROM shift_template
    ORDER BY start_local
  `).all().map((shift) => ({
    id: shift.code,
    start: shift.start_local,
    end: shift.end_local,
    role: shift.coverage_license_id,
    minimum: shift.minimum_count,
  }));

  const assignmentRows = db.prepare('SELECT task_id, person_id FROM assignment').all();
  const assignees = rowsBy(assignmentRows, 'task_id');
  const executionByTask = new Map(db.prepare(`
    SELECT task_id, execution_state, blocked_reason, actual_start, actual_end, actual_duration_min
    FROM task_execution
  `).all().map((row) => [row.task_id, row]));
  const taskRows = db.prepare(`
    SELECT task.*, work_package.turnaround_id
    FROM task
    JOIN work_package ON work_package.id = task.work_package_id
    ORDER BY task.sort_order
  `).all();
  const tasksByVisit = {};
  for (const task of taskRows) {
    if (!tasksByVisit[task.turnaround_id]) tasksByVisit[task.turnaround_id] = [];
    tasksByVisit[task.turnaround_id].push({
      id: task.id,
      visitId: task.turnaround_id,
      title: task.title,
      durationMin: task.duration_min,
      skill: task.skill_id,
      cert: task.license_id,
      zone: task.zone,
      needsParts: bool(task.needs_parts),
      needsTools: bool(task.needs_tools),
      partsReady: bool(task.parts_ready),
      toolsReady: bool(task.tools_ready),
      status: task.plan_status,
      assignees: (assignees.get(task.id) || []).map((row) => row.person_id),
      startMin: task.start_min,
      order: task.sort_order,
      adHoc: bool(task.ad_hoc),
      source: task.card_source,
      critical: false,
      notes: task.notes || '',
      execution: executionOf(executionByTask.get(task.id)),
    });
  }

  const versionRows = db.prepare(`
    SELECT id, turnaround_id, version_no, published_at, snapshot
    FROM plan_version
    ORDER BY version_no
  `).all();
  const versionsByVisit = rowsBy(versionRows, 'turnaround_id');
  const plans = {};
  for (const visit of turnarounds) {
    plans[visit.id] = {
      state: 'Draft',
      blockOnConflicts: true,
      licenseOverride: '',
      publishOverride: '',
      visitNotes: '',
      versions: [],
      lastGenerateOk: null,
      lastGenerateReason: '',
    };
  }
  for (const plan of db.prepare('SELECT * FROM plan').all()) {
    plans[plan.turnaround_id] = {
      state: plan.state,
      blockOnConflicts: bool(plan.block_on_conflicts),
      licenseOverride: plan.license_override || '',
      publishOverride: '',
      visitNotes: plan.visit_notes || '',
      versions: (versionsByVisit.get(plan.turnaround_id) || []).map((version) => ({
        id: version.id,
        at: version.published_at,
        state: 'Published',
        tasks: JSON.parse(version.snapshot),
      })),
      lastGenerateOk: plan.last_generate_ok == null ? null : bool(plan.last_generate_ok),
      lastGenerateReason: plan.last_generate_reason || '',
    };
  }

  const alertPeople = rowsBy(db.prepare('SELECT alert_id, person_id FROM alert_person').all(), 'alert_id');
  const alerts = db.prepare(`
    SELECT id, turnaround_id, alert_type, severity, state, created_at,
           acknowledged_at, resolved_at, detail, delay_min, proposal, source_key
    FROM alert
    ORDER BY created_at DESC
  `).all().map((alert) => ({
    id: alert.id,
    unread: alert.state === 'unread',
    turnaroundId: alert.turnaround_id,
    createdAt: alert.created_at,
    acknowledgedAt: alert.acknowledged_at,
    resolvedAt: alert.resolved_at,
    type: ALERT_LABEL[alert.alert_type] || alert.alert_type,
    alertType: alert.alert_type,
    severity: alert.severity,
    state: alert.state,
    detail: alert.detail || '',
    delayMin: alert.delay_min,
    people: (alertPeople.get(alert.id) || []).map((row) => row.person_id),
    proposal: proposalOf(alert.proposal),
    sourceKey: alert.source_key,
  }));

  const feeds = Object.fromEntries(db.prepare('SELECT code, last_success_at FROM source_feed').all()
    .map((feed) => [feed.code, feed.last_success_at ? Date.parse(feed.last_success_at) : null]));

  return {
    now: nowIso,
    sync: {
      me: feeds.me ?? null,
      flightOps: feeds.flight_ops ?? null,
      hr: feeds.hr ?? null,
    },
    turnarounds,
    alerts,
    people,
    shifts,
    tasksByVisit,
    plans,
  };
}
