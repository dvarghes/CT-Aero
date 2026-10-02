function bit(value) {
  return value ? 1 : 0;
}

function ensurePackage(db, visitId) {
  const existing = db.prepare('SELECT id FROM work_package WHERE turnaround_id = ?').get(visitId);
  if (existing) return existing.id;
  const id = `WP-${visitId}`;
  db.prepare(`INSERT INTO work_package (id, turnaround_id, source, source_key, package_type)
    VALUES (?, ?, 'generated', ?, 'line')`).run(id, visitId, id);
  return id;
}

function assignedHours(tasks) {
  const minutes = (tasks || []).reduce((total, task) => {
    if (!task.assignees?.length) return total;
    if (task.status === 'na' || task.status === 'deferred') return total;
    return total + (Number(task.durationMin) || 0);
  }, 0);
  return Math.round((minutes / 60) * 10) / 10;
}

function keepExecution(db, packageId) {
  return db.prepare(`
    SELECT e.task_id, e.execution_state, e.blocked_reason, e.actual_start, e.actual_end, e.actual_duration_min
    FROM task_execution e
    JOIN task t ON t.id = e.task_id
    WHERE t.work_package_id = ?
  `).all(packageId);
}

function restoreExecution(db, rows) {
  const insert = db.prepare(`INSERT INTO task_execution
    (task_id, execution_state, blocked_reason, actual_start, actual_end, actual_duration_min)
    VALUES (?, ?, ?, ?, ?, ?)`);
  for (const row of rows) {
    const task = db.prepare('SELECT id FROM task WHERE id = ?').get(row.task_id);
    if (!task) continue;
    insert.run(
      row.task_id,
      row.execution_state,
      row.blocked_reason,
      row.actual_start,
      row.actual_end,
      row.actual_duration_min,
    );
  }
}

// Replaces the working cards for one visit. Execution rows for the same task ids are kept.
export function saveVisitTasks(db, visitId, tasks) {
  const visit = db.prepare('SELECT id FROM turnaround WHERE id = ?').get(visitId);
  if (!visit) return;
  const packageId = ensurePackage(db, visitId);
  const execution = keepExecution(db, packageId);
  db.prepare('DELETE FROM task WHERE work_package_id = ?').run(packageId);
  const insertTask = db.prepare(`INSERT INTO task
    (id, work_package_id, title, sort_order, duration_min, skill_id, license_id, zone,
     needs_parts, needs_tools, parts_ready, tools_ready, plan_status, start_min, ad_hoc, card_source, notes, source_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertAssignment = db.prepare('INSERT OR IGNORE INTO assignment (id, task_id, person_id) VALUES (?, ?, ?)');
  tasks.forEach((task, index) => {
    const duration = Math.max(1, Number(task.durationMin) || 1);
    insertTask.run(
      task.id,
      packageId,
      task.title || 'Task',
      Number.isFinite(task.order) ? task.order : index,
      duration,
      task.skill || 'structures',
      task.cert || 'B1',
      task.zone || 'Cabin',
      bit(task.needsParts),
      bit(task.needsTools),
      bit(task.partsReady),
      bit(task.toolsReady),
      task.status || 'pending',
      task.startMin == null ? null : Number(task.startMin),
      bit(task.adHoc),
      task.source || 'AMP',
      task.notes || '',
      task.id,
    );
    for (const personId of task.assignees || []) {
      const person = db.prepare('SELECT id FROM person WHERE id = ?').get(personId);
      if (!person) continue;
      insertAssignment.run(`${task.id}:${personId}`, task.id, personId);
    }
  });
  restoreExecution(db, execution);
  db.prepare('UPDATE turnaround SET assigned_hours = ? WHERE id = ?').run(assignedHours(tasks), visitId);
}

export function writePlan(db, payload) {
  const tasksByVisit = payload.tasksByVisit || {};
  const plans = payload.plans || {};
  const shifts = payload.shifts || [];
  const knownLicenses = new Set(db.prepare('SELECT id FROM license').all().map((row) => row.id));

  db.exec('BEGIN');
  try {
    for (const [visitId, tasks] of Object.entries(tasksByVisit)) {
      const visit = db.prepare('SELECT id FROM turnaround WHERE id = ?').get(visitId);
      if (!visit) continue;
      const prior = db.prepare('SELECT state FROM plan WHERE turnaround_id = ?').get(visitId);
      saveVisitTasks(db, visitId, tasks);

      const plan = plans[visitId];
      if (!plan) continue;
      db.prepare(`INSERT INTO plan
        (turnaround_id, state, block_on_conflicts, license_override, visit_notes, last_generate_ok, last_generate_reason)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(turnaround_id) DO UPDATE SET
          state = excluded.state,
          block_on_conflicts = excluded.block_on_conflicts,
          license_override = excluded.license_override,
          visit_notes = excluded.visit_notes,
          last_generate_ok = excluded.last_generate_ok,
          last_generate_reason = excluded.last_generate_reason
      `).run(
        visitId,
        plan.state || 'Draft',
        bit(plan.blockOnConflicts),
        plan.licenseOverride || '',
        plan.visitNotes || '',
        plan.lastGenerateOk == null ? null : bit(plan.lastGenerateOk),
        plan.lastGenerateReason || '',
      );

      const insertVersion = db.prepare(`INSERT OR IGNORE INTO plan_version
        (id, turnaround_id, version_no, published_at, snapshot) VALUES (?, ?, ?, ?, ?)`);
      (plan.versions || []).forEach((version, index) => {
        insertVersion.run(
          `${visitId}:${version.id}`,
          visitId,
          index + 1,
          version.at || new Date().toISOString(),
          JSON.stringify(version.tasks || []),
        );
      });
      if (plan.state === 'Published' && prior?.state !== 'Published') {
        const assignees = [...new Set(tasks.flatMap((task) => task.assignees || []))];
        db.prepare(`INSERT INTO audit_event
          (id, at, actor_user_id, action, entity_type, entity_id, payload)
          VALUES (?, ?, NULL, 'plan.notify', 'turnaround', ?, ?)`).run(
          `audit-${visitId}-${Date.now()}`,
          new Date().toISOString(),
          visitId,
          JSON.stringify({
            assignees,
            message: 'Published plan is the live task list for assigned technicians.',
          }),
        );
      }
    }

    const updateShift = db.prepare(`UPDATE shift_template
      SET start_local = ?, end_local = ?, coverage_license_id = ?, minimum_count = ?
      WHERE code = ?`);
    const updateShiftHours = db.prepare(`UPDATE shift_template
      SET start_local = ?, end_local = ?, minimum_count = ?
      WHERE code = ?`);
    for (const shift of shifts) {
      const minimum = Number(shift.minimum);
      if (knownLicenses.has(shift.role)) {
        updateShift.run(shift.start, shift.end, shift.role, Number.isFinite(minimum) ? minimum : 0, shift.id);
      } else {
        updateShiftHours.run(shift.start, shift.end, Number.isFinite(minimum) ? minimum : 0, shift.id);
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
