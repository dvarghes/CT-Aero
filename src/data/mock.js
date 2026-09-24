const TIME_ZONES = {
  HEL: 'Europe/Helsinki',
  FRA: 'Europe/Berlin',
  MUC: 'Europe/Berlin',
};

const TAILS = {
  HEL: [
    ['OH-LWP', 'A321', 'A320 family'],
    ['OH-LXK', 'A320', 'A320 family'],
    ['OH-LZN', 'A20N', 'A320 family'],
    ['OH-LZP', 'A321', 'A320 family'],
    ['OH-LTT', 'A333', 'A330'],
    ['OH-LTR', 'A332', 'A330'],
    ['OH-LKO', 'B738', 'B737'],
    ['OH-LXL', 'B38M', 'B737'],
  ],
  FRA: [
    ['D-AIGX', 'A20N', 'A320 family'],
    ['D-AIUW', 'A320', 'A320 family'],
    ['D-AIZX', 'A321', 'A320 family'],
    ['D-AIKQ', 'A333', 'A330'],
    ['D-AIKI', 'A332', 'A330'],
    ['D-ABKA', 'B738', 'B737'],
    ['D-ABKM', 'B38M', 'B737'],
    ['D-AIZY', 'A321', 'A320 family'],
  ],
  MUC: [
    ['D-AIND', 'A20N', 'A320 family'],
    ['D-AIWF', 'A321', 'A320 family'],
    ['D-AIKH', 'A333', 'A330'],
    ['D-AIAY', 'A332', 'A330'],
    ['D-ABEJ', 'B738', 'B737'],
    ['D-ABML', 'B38M', 'B737'],
    ['D-AINC', 'A320', 'A320 family'],
    ['D-AIWB', 'A20N', 'A320 family'],
  ],
};

const AIRLINE = { HEL: 'AY', FRA: 'LH', MUC: 'LH' };
const REASONS = ['parts', 'tools', 'staff'];
const STAND = { HEL: 'B', FRA: 'A', MUC: 'C' };

const FILL = {
  'On track': [0.92, 1],
  Completed: [1, 1],
  'In progress': [0.78, 0.96],
  Published: [0.72, 0.94],
  Draft: [0.45, 0.8],
  'At risk': [0.4, 0.68],
  Delayed: [0.55, 0.8],
  Blocked: [0.28, 0.58],
  Cancelled: [0, 0],
};

const BUCKETS = [
  { from: -14 * 24, to: -72, perStation: 8 },
  { from: -72, to: -24, perStation: 6 },
  { from: -24, to: -12, perStation: 4 },
  { from: -12, to: 0, perStation: 6 },
  { from: 0, to: 12, perStation: 8, scripted: true },
  { from: 12, to: 24, perStation: 6 },
  { from: 24, to: 72, perStation: 8 },
  { from: 72, to: 14 * 24, perStation: 10 },
];

const SCRIPTED_12H = [
  'On track',
  'In progress',
  'At risk',
  'Published',
  'Delayed',
  'On track',
  'Blocked',
  'Completed',
];

const STATUS_BAG = [
  'On track', 'On track', 'On track',
  'In progress', 'In progress',
  'Published', 'Draft', 'Completed',
  'At risk', 'Delayed', 'Blocked', 'Cancelled',
];

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260924);

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 3600000);
}

function hourInZone(date, timeZone) {
  const value = new Intl.DateTimeFormat('en-GB', {
    hour: 'numeric',
    hourCycle: 'h23',
    timeZone,
  }).format(date);
  return Number(value);
}

function shiftFor(date, timeZone) {
  const hour = hourInZone(date, timeZone);
  if (hour >= 6 && hour < 14) return 'Day';
  if (hour >= 14 && hour < 22) return 'Evening';
  return 'Night';
}

function pickFill(status) {
  const [min, max] = FILL[status];
  return min + (max - min) * rand();
}

export const now = new Date();

let seq = 1;
let flightSeq = 400;
let wpSeq = 44010;
const turnarounds = [];

function pushVisit(station, tail, type, fleet, start, status) {
  const timeZone = TIME_ZONES[station];
  const end = addHours(start, 1.75 + rand() * 3.25);
  const requiredHours = Math.round((8 + rand() * 16) * 2) / 2;
  const ratio = pickFill(status);
  const id = `ta-${station.toLowerCase()}-${String(seq).padStart(3, '0')}`;
  seq += 1;
  flightSeq += 7;
  wpSeq += 3;
  const visit = {
    id,
    tail,
    type,
    fleet,
    station,
    timeZone,
    flight: `${AIRLINE[station]}${flightSeq}`,
    workOrder: `WP-${wpSeq}`,
    stand: `${STAND[station]}${12 + (seq % 16)}`,
    windowStart: start.toISOString(),
    windowEnd: end.toISOString(),
    status,
    blockedReason: status === 'Blocked' ? REASONS[seq % REASONS.length] : null,
    shift: shiftFor(start, timeZone),
    requiredHours,
    assignedHours: Math.round(requiredHours * ratio * 10) / 10,
    staffFill: ratio,
  };
  turnarounds.push(visit);
  return visit;
}

for (const bucket of BUCKETS) {
  for (const station of ['HEL', 'FRA', 'MUC']) {
    const tails = TAILS[station];
    for (let index = 0; index < bucket.perStation; index += 1) {
      const span = bucket.to - bucket.from;
      const start = addHours(now, bucket.from + ((index + 0.4) * span) / bucket.perStation);
      const [tail, type, fleet] = tails[index % tails.length];
      const status = bucket.scripted
        ? SCRIPTED_12H[index]
        : STATUS_BAG[Math.floor(rand() * STATUS_BAG.length)];
      pushVisit(station, tail, type, fleet, start, status);
    }
  }
}

function retarget(tail, status, ratio) {
  const visit = turnarounds.find((item) => {
    if (item.tail !== tail) return false;
    const start = new Date(item.windowStart).getTime();
    return start >= now.getTime() && start < now.getTime() + 12 * 3600000;
  });
  if (!visit) return;
  visit.status = status;
  visit.blockedReason = null;
  visit.staffFill = ratio;
  visit.assignedHours = Math.round(visit.requiredHours * ratio * 10) / 10;
}

retarget('OH-LWP', 'At risk', 0.5);
retarget('D-AIGX', 'Delayed', 0.78);

function inNext12Hours(visit) {
  const start = new Date(visit.windowStart).getTime();
  const end = new Date(visit.windowEnd).getTime();
  return start < now.getTime() + 12 * 3600000 && end > now.getTime();
}

const alerts = [];
const unreadStations = new Set();

function pushAlert(visit, unread) {
  alerts.push({
    id: `al-${visit.id}`,
    unread,
    station: visit.station,
    fleet: visit.fleet,
    shift: visit.shift,
    turnaroundId: visit.id,
    createdAt: addHours(now, -0.25 - rand() * 5).toISOString(),
    type: visit.status === 'Blocked'
      ? `missing ${visit.blockedReason}`
      : visit.status === 'Delayed'
        ? 'delayed flight'
        : 'ground-time risk',
  });
}

for (const tail of ['OH-LWP', 'D-AIGX']) {
  const visit = turnarounds.find((item) => item.tail === tail && inNext12Hours(item));
  if (!visit) continue;
  unreadStations.add(visit.station);
  pushAlert(visit, true);
}

for (const visit of turnarounds) {
  if (!['At risk', 'Delayed', 'Blocked'].includes(visit.status)) continue;
  if (alerts.some((alert) => alert.turnaroundId === visit.id)) continue;
  if (new Date(visit.windowEnd).getTime() <= now.getTime()) continue;
  const unread = inNext12Hours(visit) && !unreadStations.has(visit.station);
  if (unread) unreadStations.add(visit.station);
  pushAlert(visit, unread);
}

export const SYNC = {
  me: now.getTime() - 12_000,
  flightOps: now.getTime() - 8_000,
  hr: now.getTime() - 21_000,
};

export function getTurnaround(id) {
  return turnarounds.find((item) => item.id === id) ?? null;
}

export { alerts, turnarounds, TIME_ZONES };
