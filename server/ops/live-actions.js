// Disruption inbox and floor execution. Derived alerts refresh in place.
// A recorded delay locks the ground window so the flight feed does not stretch it back.

import { blockingConflicts, conflictsForVisit, generateSchedule } from '../../src/plan/engine.js';
import { readOperation } from '../read-model.js';
import { saveVisitTasks } from '../write-model.js';

const DERIVED_PREFIXES = ['parts:', 'tools:', 'absence:', 'overrun:', 'ground:', 'late:', 'feed:'];
const EXECUTION_STATES = ['not_started', 'started', 'paused', 'blocked', 'done'];
const ALERT_STATES = ['unread', 'acknowledged', 'resolved'];
const SEVERITIES = ['low', 'medium', 'high'];

function isDerived(sourceKey) {
  return DERIVED_PREFIXES.some((prefix) => sourceKey.startsWith(prefix));
}

function openPlan(task) {
  return task.plan_status !== 'deferred' && task.plan_status !== 'na';
}

function upsertAlert(db, item, nowIso) {
  const existing = db.prepare('SELECT id, state FROM alert WHERE source_key = ?').get(item.sourceKey);
  let alertId = existing?.id;
  if (!existing) {
    alertId = `al-${item.sourceKey.replace(/[^a-zA-Z0-9]+/g, '-')}`;
    db.prepare(`INSERT INTO alert
      (id, turnaround_id, alert_type, severity, state, created_at, detail, delay_min, source_key)
      VALUES (?, ?, ?, ?, 'unread', ?, ?, ?, ?)`).run(
      alertId,
      item.turnaroundId,
      item.alertType,
      item.severity,
      nowIso,
      item.detail,
      item.delayMin ?? null,
      item.sourceKey,
    );
  } else if (existing.state !== 'resolved') {
    db.prepare(`UPDATE alert
      SET detail = ?, severity = ?, delay_min = ?, turnaround_id = ?
      WHERE id = ?`).run(item.detail, item.severity, item.delayMin ?? null, item.turnaroundId, alertId);
  } else {
    return;
  }
  db.prepare('DELETE FROM alert_person WHERE alert_id = ?').run(alertId);
  const link = db.prepare('INSERT OR IGNORE INTO alert_person (alert_id, person_id) VALUES (?, ?)');
  for (const personId of item.people || []) {
    const person = db.prepare('SELECT id FROM person WHERE id = ?').get(personId);
    if (person) link.run(alertId, personId);
  }
}

export function syncDisruptions(db) {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const visits = db.prepare(`
    SELECT t.id, t.status, f.window_start, f.window_end
    FROM turnaround t
    JOIN flight f ON f.id = t.flight_id
    WHERE t.status IN ('In progress', 'At risk', 'Delayed', 'Blocked', 'On track')
  `).all();
  const visitById = new Map(visits.map((visit) => [visit.id, visit]));
  const tasks = db.prepare(`
    SELECT task.id, task.title, task.duration_min, task.plan_status, task.start_min,
           task.needs_parts, task.needs_tools, task.parts_ready, task.tools_ready,
           work_package.turnaround_id
    FROM task
    JOIN work_package ON work_package.id = task.work_package_id
  `).all().filter((task) => visitById.has(task.turnaround_id));
  const execution = new Map(db.prepare(`
    SELECT task_id, execution_state, actual_start, actual_duration_min FROM task_execution
  `).all().map((row) => [row.task_id, row]));
  const assignees = new Map();
  for (const row of db.prepare('SELECT task_id, person_id FROM assignment').all()) {
    if (!assignees.has(row.task_id)) assignees.set(row.task_id, []);
    assignees.get(row.task_id).push(row.person_id);
  }
  const duty = new Map(db.prepare(`
    SELECT person_id, availability FROM duty WHERE starts_at <= ? AND ends_at > ?
  `).all(nowIso, nowIso).map((row) => [row.person_id, row.availability]));
  const names = new Map(db.prepare('SELECT id, name FROM person').all().map((row) => [row.id, row.name]));

  const desired = [];
  const byVisit = new Map();
  for (const task of tasks) {
    if (!byVisit.has(task.turnaround_id)) byVisit.set(task.turnaround_id, []);
    byVisit.get(task.turnaround_id).push(task);
  }

  for (const visit of visits) {
    const cards = byVisit.get(visit.id) || [];
    const active = cards.filter(openPlan);
    const partCards = active.filter((task) => task.needs_parts && !task.parts_ready && (task.start_min != null || execution.get(task.id)));
    const toolCards = active.filter((task) => task.needs_tools && !task.tools_ready && (task.start_min != null || execution.get(task.id)));
    if (partCards.length) {
      desired.push({
        sourceKey: `parts:${visit.id}`,
        turnaroundId: visit.id,
        alertType: 'missing_part',
        severity: 'high',
        delayMin: null,
        people: [...new Set(partCards.flatMap((task) => assignees.get(task.id) || []))],
        detail: `${partCards.map((task) => task.title).join(', ')} still need parts.`,
      });
    }
    if (toolCards.length) {
      desired.push({
        sourceKey: `tools:${visit.id}`,
        turnaroundId: visit.id,
        alertType: 'missing_tool',
        severity: 'medium',
        delayMin: null,
        people: [...new Set(toolCards.flatMap((task) => assignees.get(task.id) || []))],
        detail: `${toolCards.map((task) => task.title).join(', ')} still need tools.`,
      });
    }

    const absent = new Map();
    for (const task of active) {
      if (execution.get(task.id)?.execution_state === 'done') continue;
      for (const personId of assignees.get(task.id) || []) {
        if (duty.get(personId) !== 'absent') continue;
        if (!absent.has(personId)) absent.set(personId, []);
        absent.get(personId).push(task.title);
      }
    }
    for (const [personId, titles] of absent) {
      desired.push({
        sourceKey: `absence:${visit.id}:${personId}`,
        turnaroundId: visit.id,
        alertType: 'absence',
        severity: 'high',
        delayMin: null,
        people: [personId],
        detail: `${names.get(personId) || personId} is absent and assigned to ${titles.join(', ')}.`,
      });
    }

    for (const task of active) {
      const floor = execution.get(task.id);
      if (!floor) continue;
      const elapsed = floor.actual_start
        ? Math.round((now - Date.parse(floor.actual_start)) / 60000)
        : 0;
      const actual = floor.execution_state === 'done' ? floor.actual_duration_min : elapsed;
      const running = floor.execution_state === 'started' || floor.execution_state === 'paused' || floor.execution_state === 'blocked';
      if (actual != null && actual > task.duration_min + 5 && (running || floor.execution_state === 'done')) {
        desired.push({
          sourceKey: `overrun:${task.id}`,
          turnaroundId: visit.id,
          alertType: 'task_overrun',
          severity: 'high',
          delayMin: actual - task.duration_min,
          people: assignees.get(task.id) || [],
          detail: `${task.title} is ${actual - task.duration_min} min past its ${task.duration_min} min estimate.`,
        });
      }
    }

    const scheduled = active.filter((task) => task.start_min != null && (assignees.get(task.id) || []).length);
    const scheduledEnd = scheduled.reduce((max, task) => Math.max(max, task.start_min + task.duration_min), 0);
    const windowMin = Math.max(1, Math.round((Date.parse(visit.window_end) - Date.parse(visit.window_start)) / 60000));
    if (scheduledEnd > windowMin) {
      desired.push({
        sourceKey: `ground:${visit.id}`,
        turnaroundId: visit.id,
        alertType: 'ground_time_shrink',
        severity: 'high',
        delayMin: scheduledEnd - windowMin,
        people: [...new Set(scheduled.flatMap((task) => assignees.get(task.id) || []))],
        detail: `Scheduled work ends at ${scheduledEnd} min and the ground window is ${windowMin} min.`,
      });
    }

    const recordedDelay = db.prepare(`SELECT id FROM alert WHERE source_key = ?`).get(`delay:${visit.id}`);
    if (!recordedDelay && now > Date.parse(visit.window_end) && (visit.status === 'In progress' || visit.status === 'Delayed')) {
      const late = Math.round((now - Date.parse(visit.window_end)) / 60000);
      desired.push({
        sourceKey: `late:${visit.id}`,
        turnaroundId: visit.id,
        alertType: 'delayed_flight',
        severity: 'high',
        delayMin: late,
        people: [],
        detail: `Aircraft is still in progress ${late} min after the ground window.`,
      });
    }
  }

  const feeds = db.prepare(`SELECT code, last_error FROM source_feed WHERE last_error IS NOT NULL AND last_error != ''`).all();
  const anchor = visits[0];
  for (const feed of feeds) {
    if (!anchor) continue;
    desired.push({
      sourceKey: `feed:${feed.code}`,
      turnaroundId: anchor.id,
      alertType: 'integration_failure',
      severity: 'medium',
      delayMin: null,
      people: [],
      detail: `${feed.code} sync failed: ${feed.last_error}`,
    });
  }

  db.exec('BEGIN');
  try {
    const wanted = new Set(desired.map((item) => item.sourceKey));
    for (const item of desired) upsertAlert(db, item, nowIso);
    const stored = db.prepare(`SELECT id, source_key, state FROM alert WHERE source_key IS NOT NULL`).all();
    for (const row of stored) {
      if (!row.source_key || !isDerived(row.source_key) || wanted.has(row.source_key) || row.state === 'resolved') continue;
      db.prepare(`UPDATE alert SET state = 'resolved', resolved_at = ? WHERE id = ?`).run(nowIso, row.id);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function operationContext(db) {
  const operation = readOperation(db);
  const visitsById = new Map(operation.turnarounds.map((visit) => [visit.id, visit]));
  return { operation, visitsById };
}

export function recordDelay(db, visitId, minutes) {
  const delay = Number(minutes);
  if (!Number.isInteger(delay) || delay < 1 || delay > 180) {
    throw new Error('Delay minutes must be a whole number from 1 to 180.');
  }
  const row = db.prepare(`
    SELECT t.id, t.status, f.id AS flight_id, f.window_start, f.window_end
    FROM turnaround t
    JOIN flight f ON f.id = t.flight_id
    WHERE t.id = ?
  `).get(visitId);
  if (!row) throw new Error('Turnaround not found.');
  if (row.status === 'Completed' || row.status === 'Cancelled') {
    throw new Error('A completed turnaround cannot take an inbound delay.');
  }
  const nextEnd = Date.parse(row.window_end) - delay * 60000;
  if (nextEnd < Date.parse(row.window_start) + 15 * 60000) {
    throw new Error(`A ${delay} minute delay would leave less than 15 minutes of ground time.`);
  }
  const nextIso = new Date(nextEnd).toISOString();
  const nowIso = new Date().toISOString();
  const sourceKey = `delay:${visitId}`;
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE flight SET window_end = ?, window_locked = 1 WHERE id = ?').run(nextIso, row.flight_id);
    db.prepare(`UPDATE turnaround SET status = 'Delayed' WHERE id = ?`).run(visitId);
    const existing = db.prepare('SELECT id FROM alert WHERE source_key = ?').get(sourceKey);
    const detail = `Inbound delay of ${delay} minutes. Ground window now ends ${nextIso}.`;
    if (existing) {
      db.prepare(`UPDATE alert
        SET detail = ?, delay_min = ?, severity = 'high', state = 'unread',
            acknowledged_at = NULL, resolved_at = NULL, proposal = NULL
        WHERE id = ?`).run(detail, delay, existing.id);
    } else {
      db.prepare(`INSERT INTO alert
        (id, turnaround_id, alert_type, severity, state, created_at, detail, delay_min, source_key)
        VALUES (?, ?, 'delayed_flight', 'high', 'unread', ?, ?, ?, ?)`).run(
        `al-delay-${visitId}`,
        visitId,
        nowIso,
        detail,
        delay,
        sourceKey,
      );
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function replanAlert(db, alertId) {
  const alert = db.prepare('SELECT id, turnaround_id FROM alert WHERE id = ?').get(alertId);
  if (!alert) throw new Error('Alert not found.');
  const { operation } = operationContext(db);
  const visit = operation.turnarounds.find((item) => item.id === alert.turnaround_id);
  if (!visit) throw new Error('Turnaround not found.');
  const before = operation.tasksByVisit[visit.id] || [];
  const result = generateSchedule(visit, before, operation.people);
  const proposal = {
    ok: result.ok,
    reason: result.reason,
    before,
    after: result.tasks,
    accepted: false,
  };
  db.prepare('UPDATE alert SET proposal = ? WHERE id = ?').run(JSON.stringify(proposal), alertId);
}

export function acceptProposal(db, alertId) {
  const alert = db.prepare('SELECT id, turnaround_id, proposal FROM alert WHERE id = ?').get(alertId);
  if (!alert) throw new Error('Alert not found.');
  if (!alert.proposal) throw new Error('Replan the alert before accepting a proposal.');
  const proposal = JSON.parse(alert.proposal);
  if (!proposal.ok) throw new Error(proposal.reason || 'The proposal does not fit the ground window.');
  const { operation, visitsById } = operationContext(db);
  const visit = visitsById.get(alert.turnaround_id);
  const plan = operation.plans[visit?.id];
  if (!visit || !plan) throw new Error('Turnaround not found.');
  const tasksByVisit = { ...operation.tasksByVisit, [visit.id]: proposal.after };
  const blocking = blockingConflicts(
    conflictsForVisit(visit, proposal.after, operation.people, tasksByVisit, visitsById),
    plan,
  );
  const nextState = blocking.length ? 'Draft' : 'Ready';
  const nowIso = new Date().toISOString();
  proposal.accepted = true;
  db.exec('BEGIN');
  try {
    saveVisitTasks(db, visit.id, proposal.after);
    db.prepare(`UPDATE plan
      SET state = ?, last_generate_ok = 1, last_generate_reason = ?
      WHERE turnaround_id = ?`).run(nextState, proposal.reason, visit.id);
    db.prepare(`UPDATE alert
      SET proposal = ?, state = 'acknowledged', acknowledged_at = COALESCE(acknowledged_at, ?)
      WHERE id = ?`).run(JSON.stringify(proposal), nowIso, alertId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function rejectProposal(db, alertId) {
  const alert = db.prepare('SELECT id FROM alert WHERE id = ?').get(alertId);
  if (!alert) throw new Error('Alert not found.');
  const nowIso = new Date().toISOString();
  db.prepare(`UPDATE alert
    SET proposal = NULL, state = 'acknowledged', acknowledged_at = COALESCE(acknowledged_at, ?)
    WHERE id = ?`).run(nowIso, alertId);
}

export function setAlertState(db, alertId, state) {
  if (!ALERT_STATES.includes(state)) throw new Error('Alert state is unread, acknowledged, or resolved.');
  const alert = db.prepare('SELECT id FROM alert WHERE id = ?').get(alertId);
  if (!alert) throw new Error('Alert not found.');
  const nowIso = new Date().toISOString();
  if (state === 'acknowledged') {
    db.prepare(`UPDATE alert SET state = 'acknowledged', acknowledged_at = COALESCE(acknowledged_at, ?) WHERE id = ?`).run(nowIso, alertId);
    return;
  }
  if (state === 'resolved') {
    db.prepare(`UPDATE alert SET state = 'resolved', resolved_at = ? WHERE id = ?`).run(nowIso, alertId);
    return;
  }
  db.prepare(`UPDATE alert SET state = 'unread', acknowledged_at = NULL, resolved_at = NULL WHERE id = ?`).run(alertId);
}

export function setAlertSeverity(db, alertId, severity) {
  if (!SEVERITIES.includes(severity)) throw new Error('Severity is low, medium, or high.');
  const alert = db.prepare('SELECT id FROM alert WHERE id = ?').get(alertId);
  if (!alert) throw new Error('Alert not found.');
  db.prepare('UPDATE alert SET severity = ? WHERE id = ?').run(severity, alertId);
}

export function publishVisit(db, visitId) {
  const { operation, visitsById } = operationContext(db);
  const visit = visitsById.get(visitId);
  const plan = operation.plans[visitId];
  const tasks = operation.tasksByVisit[visitId] || [];
  if (!visit || !plan) throw new Error('Turnaround not found.');
  if (plan.state !== 'Ready') throw new Error('Accept a proposal that fits, or mark the plan ready, before publishing.');
  const blocking = blockingConflicts(
    conflictsForVisit(visit, tasks, operation.people, operation.tasksByVisit, visitsById),
    plan,
  );
  if (blocking.length) {
    throw new Error(`Publish stays blocked: ${blocking[0].text}`);
  }
  const nowIso = new Date().toISOString();
  const versionNo = plan.versions.length + 1;
  const assignees = [...new Set(tasks.flatMap((task) => task.assignees || []))];
  db.exec('BEGIN');
  try {
    db.prepare(`UPDATE plan SET state = 'Published' WHERE turnaround_id = ?`).run(visitId);
    db.prepare(`INSERT INTO plan_version
      (id, turnaround_id, version_no, published_at, snapshot)
      VALUES (?, ?, ?, ?, ?)`).run(
      `${visitId}:v${versionNo}`,
      visitId,
      versionNo,
      nowIso,
      JSON.stringify(tasks),
    );
    db.prepare(`INSERT INTO audit_event
      (id, at, actor_user_id, action, entity_type, entity_id, payload)
      VALUES (?, ?, NULL, 'plan.notify', 'turnaround', ?, ?)`).run(
      `audit-${visitId}-${Date.now()}`,
      nowIso,
      visitId,
      JSON.stringify({
        assignees,
        message: 'Published plan is the live task list for assigned technicians.',
      }),
    );
    if (visit.status === 'Delayed') {
      db.prepare(`UPDATE turnaround SET status = 'In progress' WHERE id = ?`).run(visitId);
    }
    db.prepare(`UPDATE alert
      SET state = 'resolved', resolved_at = ?
      WHERE turnaround_id = ? AND state != 'resolved' AND proposal IS NOT NULL`).run(nowIso, visitId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function setExecution(db, taskId, input) {
  const state = input?.state;
  if (!EXECUTION_STATES.includes(state)) throw new Error('Task state is not started, started, paused, blocked, or done.');
  const task = db.prepare('SELECT id, duration_min FROM task WHERE id = ?').get(taskId);
  if (!task) throw new Error('Task not found.');
  const reason = String(input.blockedReason || '').trim();
  if (state === 'blocked' && !reason) throw new Error('A blocked task needs a reason.');
  const existing = db.prepare('SELECT * FROM task_execution WHERE task_id = ?').get(taskId);
  const nowIso = new Date().toISOString();
  let actualStart = existing?.actual_start || null;
  let actualEnd = existing?.actual_end || null;
  let actualDuration = existing?.actual_duration_min ?? null;
  if (state === 'not_started') {
    actualStart = null;
    actualEnd = null;
    actualDuration = null;
  } else if (state === 'done') {
    if (!actualStart) actualStart = nowIso;
    actualEnd = nowIso;
    actualDuration = Math.max(1, Math.round((Date.parse(actualEnd) - Date.parse(actualStart)) / 60000));
  } else {
    if (!actualStart) actualStart = nowIso;
    actualEnd = null;
    if (state !== 'blocked') actualDuration = null;
  }
  db.prepare(`INSERT INTO task_execution
    (task_id, execution_state, blocked_reason, actual_start, actual_end, actual_duration_min)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(task_id) DO UPDATE SET
      execution_state = excluded.execution_state,
      blocked_reason = excluded.blocked_reason,
      actual_start = excluded.actual_start,
      actual_end = excluded.actual_end,
      actual_duration_min = excluded.actual_duration_min
  `).run(taskId, state, state === 'blocked' ? reason : (reason || null), actualStart, actualEnd, actualDuration);
}
