import { SYNC } from './data/mock.js';

const timeOptions = {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
};

export function formatGroundWindow(startIso, endIso, timeZone, windowId) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const startTime = new Intl.DateTimeFormat('en-GB', { ...timeOptions, timeZone }).format(start);
  const endTime = new Intl.DateTimeFormat('en-GB', { ...timeOptions, timeZone }).format(end);
  if (windowId === '72h' || windowId === '14d') {
    const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone }).format(start);
    return `${day} ${startTime}–${endTime}`;
  }
  return `${startTime}–${endTime}`;
}

export function formatUtcRange(startIso, endIso) {
  const format = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  return `${format.format(new Date(startIso))} – ${format.format(new Date(endIso))} UTC`;
}

export function formatAge(fromMs, toMs) {
  const seconds = Math.max(0, Math.round((toMs - fromMs) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}

export function syncTitle() {
  const format = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  return `M&E ${format.format(SYNC.me)} UTC · Flight Ops ${format.format(SYNC.flightOps)} UTC · HR ${format.format(SYNC.hr)} UTC`;
}

export function formatHours(value) {
  if (!Number.isFinite(value)) return '0';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
