import { STATIONS, WINDOW_HOURS } from '../slicers/model.js';

const NEEDS_ACTION = ['At risk', 'Delayed', 'Blocked'];

const ATTENTION_RANK = {
  'At risk': 0,
  Delayed: 1,
  Blocked: 2,
  'In progress': 3,
  'On track': 4,
  Published: 5,
  Draft: 6,
  Cancelled: 7,
  Completed: 8,
};

// Last status is drawn at the top of the horizontal bar chart.
const STATUS_ORDER = [
  'Completed',
  'Cancelled',
  'Draft',
  'Published',
  'On track',
  'In progress',
  'Blocked',
  'Delayed',
  'At risk',
];

function windowMs(id) {
  return (WINDOW_HOURS[id] ?? 12) * 3600000;
}

function overlaps(visit, start, end) {
  const open = new Date(visit.windowStart).getTime();
  const close = new Date(visit.windowEnd).getTime();
  return open < end && close > start;
}

function matchesBase(visit, slicers) {
  if (slicers.station !== 'All stations' && visit.station !== slicers.station) return false;
  if (slicers.fleet.length && !slicers.fleet.includes(visit.fleet)) return false;
  if (slicers.shift !== 'All shifts' && visit.shift !== slicers.shift) return false;
  if (slicers.status.length && !slicers.status.includes(visit.status)) return false;
  return true;
}

function sum(items, pick) {
  return items.reduce((total, item) => total + pick(item), 0);
}

export function staffFill(visits) {
  const required = sum(visits, (visit) => visit.requiredHours);
  const assigned = sum(visits, (visit) => visit.assignedHours);
  if (required <= 0) return { required: 0, assigned: 0, percent: null };
  return {
    required: Math.round(required),
    assigned: Math.round(assigned),
    percent: Math.round((assigned / required) * 100),
  };
}

export function needsActionCount(visits) {
  return visits.filter((visit) => NEEDS_ACTION.includes(visit.status)).length;
}

export function statusMix(visits) {
  const counts = new Map(STATUS_ORDER.map((status) => [status, 0]));
  for (const visit of visits) {
    counts.set(visit.status, (counts.get(visit.status) ?? 0) + 1);
  }
  return STATUS_ORDER
    .filter((status) => (counts.get(status) ?? 0) > 0)
    .map((status) => ({ group: 'Turnarounds', key: status, value: counts.get(status) }));
}

function availableByStation(slicers, stations, people) {
  const shifts = slicers.shift === 'All shifts' ? ['Day', 'Evening', 'Night'] : [slicers.shift];
  const scale = (WINDOW_HOURS[slicers.window] ?? 12) / 24;
  return stations.map((station) => {
    const hours = people
      .filter((person) => person.station === station && person.availability === 'on shift' && shifts.includes(person.shift))
      .reduce((total, person) => total + person.maxHours, 0);
    return { station, hours: Math.round(hours * scale) };
  });
}

function requiredByStation(visits, stations) {
  return stations.map((station) => ({
    station,
    hours: Math.round(sum(
      visits.filter((visit) => visit.station === station),
      (visit) => visit.requiredHours,
    )),
  }));
}

// Default status keeps the attention list to visits that need action.
// An explicit status slicer shows those statuses instead.
export function attentionOf(visits, slicers) {
  const rows = slicers.status.length
    ? visits
    : visits.filter((visit) => NEEDS_ACTION.includes(visit.status));
  return [...rows].sort((a, b) => {
    const rank = (ATTENTION_RANK[a.status] ?? 9) - (ATTENTION_RANK[b.status] ?? 9);
    if (rank !== 0) return rank;
    return new Date(a.windowStart) - new Date(b.windowStart);
  });
}

function alertsInRange(alerts, turnarounds, slicers, start, end) {
  const byId = new Map(turnarounds.map((visit) => [visit.id, visit]));
  return alerts.filter((alert) => {
    const visit = byId.get(alert.turnaroundId);
    if (!visit || !matchesBase(visit, slicers)) return false;
    return overlaps(visit, start, end);
  });
}

export function buildSlice(slicers, operation) {
  const turnarounds = operation?.turnarounds ?? [];
  const alerts = operation?.alerts ?? [];
  const people = operation?.people ?? [];
  const duration = windowMs(slicers.window);
  const currentStart = Date.now();
  const currentEnd = currentStart + duration;
  const priorStart = currentStart - duration;
  const current = turnarounds.filter((visit) => matchesBase(visit, slicers) && overlaps(visit, currentStart, currentEnd));
  const prior = turnarounds.filter((visit) => {
    if (!matchesBase(visit, slicers)) return false;
    const close = new Date(visit.windowEnd).getTime();
    return overlaps(visit, priorStart, currentStart) && close <= currentStart;
  });
  const stations = slicers.station === 'All stations' ? STATIONS : [slicers.station];
  return {
    current,
    prior,
    alerts: alertsInRange(alerts, turnarounds, slicers, currentStart, currentEnd),
    priorAlerts: alertsInRange(alerts, turnarounds, slicers, priorStart, currentStart),
    attention: attentionOf(current, slicers),
    stations,
    capacity: {
      available: availableByStation(slicers, stations, people),
      required: requiredByStation(current, stations),
    },
  };
}

export function compareCount(current, prior) {
  const delta = current - prior;
  if (delta > 0) return `+${delta} vs prior window`;
  if (delta < 0) return `−${Math.abs(delta)} vs prior window`;
  return '0 vs prior window';
}

export function comparePoints(current, prior) {
  if (current == null || prior == null) return '— vs prior window';
  const delta = current - prior;
  if (delta > 0) return `+${delta} pp vs prior window`;
  if (delta < 0) return `−${Math.abs(delta)} pp vs prior window`;
  return '0 pp vs prior window';
}
