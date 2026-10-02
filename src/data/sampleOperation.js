import { alerts, now, SYNC, turnarounds } from './mock.js';
import { defaultShifts, people } from './roster.js';
import { buildTasksByVisit, emptyPlan } from './workpackages.js';

const ALERT_STATES = new Set(['unread', 'acknowledged', 'resolved']);
const SEVERITIES = new Set(['low', 'medium', 'high']);
const EXECUTION_STATES = new Set(['not_started', 'started', 'paused', 'blocked', 'done']);

function emptyExecution() {
  return { state: 'not_started', blockedReason: '', actualStart: null, actualEnd: null, actualDurationMin: null };
}

function withExecution(tasksByVisit) {
  const next = {};
  for (const [visitId, tasks] of Object.entries(tasksByVisit)) {
    next[visitId] = tasks.map((task) => ({ ...task, execution: task.execution || emptyExecution() }));
  }
  return next;
}

// The published site has no database. This is the operation those screens render.
export function buildSampleOperation() {
  const tasksByVisit = withExecution(buildTasksByVisit());
  const plans = {};
  for (const visit of turnarounds) plans[visit.id] = emptyPlan();
  return {
    mode: 'sample',
    now: now.toISOString(),
    sync: { me: SYNC.me, flightOps: SYNC.flightOps, hr: SYNC.hr },
    turnarounds,
    alerts: alerts.map((alert) => ({
      ...alert,
      state: alert.unread ? 'unread' : 'acknowledged',
      severity: alert.type === 'delayed flight' ? 'high' : 'medium',
      detail: alert.type,
      people: alert.people || [],
      proposal: alert.proposal ?? null,
      delayMin: alert.delayMin ?? null,
    })),
    people,
    shifts: defaultShifts,
    tasksByVisit,
    plans,
  };
}

function replaceAlert(operation, alertId, patch) {
  let found = false;
  const nextAlerts = operation.alerts.map((alert) => {
    if (alert.id !== alertId) return alert;
    found = true;
    const state = patch.state ?? alert.state;
    return {
      ...alert,
      ...patch,
      unread: state === 'unread',
    };
  });
  if (!found) throw new Error('Alert not found.');
  return { ...operation, alerts: nextAlerts };
}

function setAlertState(operation, input) {
  const state = input.state;
  if (!ALERT_STATES.has(state)) throw new Error('Alert state is unread, acknowledged, or resolved.');
  const nowIso = new Date().toISOString();
  if (state === 'acknowledged') {
    return replaceAlert(operation, input.alertId, { state, acknowledgedAt: nowIso });
  }
  if (state === 'resolved') {
    return replaceAlert(operation, input.alertId, { state, resolvedAt: nowIso });
  }
  return replaceAlert(operation, input.alertId, { state, acknowledgedAt: null, resolvedAt: null });
}

function setAlertSeverity(operation, input) {
  if (!SEVERITIES.has(input.severity)) throw new Error('Severity is low, medium, or high.');
  return replaceAlert(operation, input.alertId, { severity: input.severity });
}

function setExecution(operation, input) {
  const state = input?.state;
  if (!EXECUTION_STATES.has(state)) throw new Error('Task state is not started, started, paused, blocked, or done.');
  const reason = String(input.blockedReason || '').trim();
  if (state === 'blocked' && !reason) throw new Error('A blocked task needs a reason.');
  let found = false;
  const tasksByVisit = {};
  for (const [visitId, tasks] of Object.entries(operation.tasksByVisit)) {
    tasksByVisit[visitId] = tasks.map((task) => {
      if (task.id !== input.taskId) return task;
      found = true;
      const existing = task.execution || emptyExecution();
      const nowIso = new Date().toISOString();
      let actualStart = existing.actualStart;
      let actualEnd = existing.actualEnd;
      let actualDurationMin = existing.actualDurationMin;
      if (state === 'not_started') {
        actualStart = null;
        actualEnd = null;
        actualDurationMin = null;
      } else if (state === 'done') {
        if (!actualStart) actualStart = nowIso;
        actualEnd = nowIso;
        actualDurationMin = Math.max(1, Math.round((Date.parse(actualEnd) - Date.parse(actualStart)) / 60000));
      } else {
        if (!actualStart) actualStart = nowIso;
        actualEnd = null;
        if (state !== 'blocked') actualDurationMin = null;
      }
      return {
        ...task,
        execution: {
          state,
          blockedReason: state === 'blocked' ? reason : '',
          actualStart,
          actualEnd,
          actualDurationMin,
        },
      };
    });
  }
  if (!found) throw new Error('Task not found.');
  return { ...operation, tasksByVisit };
}

export function applySampleWrite(operation, path, body) {
  const input = body ?? {};
  if (path === '/api/alerts/state') return setAlertState(operation, input);
  if (path === '/api/alerts/severity') return setAlertSeverity(operation, input);
  if (path === '/api/execution') return setExecution(operation, input);
  throw new Error('Delay, replan, and publish are saved in the local app. This site is showing the sample operation.');
}
