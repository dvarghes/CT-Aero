import { STATIONS, WINDOW_HOURS } from '../slicers/model.js';
import { alerts, now, turnarounds } from './mock.js';

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

const CREW = {
  HEL: { Day: 12, Evening: 9, Night: 6 },
  FRA: { Day: 16, Evening: 12, Night: 7 },
  MUC: { Day: 10, Evening: 8, Night: 5 },
};

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

function availableByStation(slicers, stations) {
  const shifts = slicers.shift === 'All shifts' ? ['Day', 'Evening', 'Night'] : [slicers.shift];
  const scale = (WINDOW_HOURS[slicers.window] ?? 12) / 24;
  return stations.map((station) => {
    const crew = shifts.reduce((total, shift) => total + CREW[station][shift], 0);
    return { station, hours: Math.round(crew * 8 * scale) };
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

function alertsInRange(slicers, start, end) {
  const byId = new Map(turnarounds.map((visit) => [visit.id, visit]));
  return alerts.filter((alert) => {
    const visit = byId.get(alert.turnaroundId);
    if (!visit || !matchesBase(visit, slicers)) return false;
    return overlaps(visit, start, end);
  });
}

export function buildSlice(slicers) {
  const duration = windowMs(slicers.window);
  const currentStart = now.getTime();
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
    alerts: alertsInRange(slicers, currentStart, currentEnd),
    priorAlerts: alertsInRange(slicers, priorStart, currentStart),
    attention: attentionOf(current, slicers),
    stations,
    capacity: {
      available: availableByStation(slicers, stations),
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
