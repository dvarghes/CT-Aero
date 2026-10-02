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

const refreshDateFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const refreshTimeFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Date and clock time of the last successful live refresh, in UTC. */
export function formatRefreshParts(ms) {
  if (ms == null || Number.isNaN(ms)) return null;
  const date = refreshDateFormat.format(ms);
  const time = `${refreshTimeFormat.format(ms)} UTC`;
  return { date, time, text: `${date}, ${time}` };
}

export function formatRefreshStamp(ms) {
  return formatRefreshParts(ms)?.text ?? '—';
}

export function syncTitle(sync) {
  const stamp = (value) => formatRefreshStamp(value);
  return `M&E ${stamp(sync?.me)} · Flight Ops ${stamp(sync?.flightOps)} · HR ${stamp(sync?.hr)}`;
}

export function formatHours(value) {
  if (!Number.isFinite(value)) return '0';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
