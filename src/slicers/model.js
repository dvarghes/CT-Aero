export const STORAGE_KEY = 'assignment-slicers';

export const DEFAULT_SLICERS = {
  station: 'All stations',
  window: '12h',
  fleet: [],
  shift: 'All shifts',
  status: [],
};

export const STATIONS = ['HEL', 'FRA', 'MUC'];

export const WINDOWS = [
  { id: '12h', label: 'Now–12h', hours: 12 },
  { id: '24h', label: '24h', hours: 24 },
  { id: '72h', label: '72h', hours: 72 },
  { id: '14d', label: '14d', hours: 24 * 14 },
];

export const FLEETS = ['A320 family', 'A330', 'B737'];
export const SHIFTS = ['Day', 'Evening', 'Night'];
export const SLICER_STATUSES = ['At risk', 'Delayed', 'Blocked', 'In progress', 'On track'];

export const WINDOW_HOURS = Object.fromEntries(WINDOWS.map((item) => [item.id, item.hours]));
export const WINDOW_LABEL = Object.fromEntries(WINDOWS.map((item) => [item.id, item.label]));

export function windowLabel(id) {
  return WINDOW_LABEL[id] ?? WINDOW_LABEL['12h'];
}

function ordered(values, allowed) {
  return allowed.filter((value) => values.includes(value));
}

export function toggleMulti(current, value, allowed) {
  const next = current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];
  const picked = ordered(next, allowed);
  if (picked.length === 0 || picked.length === allowed.length) return [];
  return picked;
}

export function normalizeSlicers(input) {
  const station = STATIONS.includes(input?.station) ? input.station : DEFAULT_SLICERS.station;
  const windowId = WINDOWS.some((item) => item.id === input?.window) ? input.window : DEFAULT_SLICERS.window;
  const fleet = Array.isArray(input?.fleet) ? ordered(input.fleet, FLEETS) : [];
  const shift = SHIFTS.includes(input?.shift) ? input.shift : DEFAULT_SLICERS.shift;
  const status = Array.isArray(input?.status) ? ordered(input.status, SLICER_STATUSES) : [];
  return {
    station,
    window: windowId,
    fleet: fleet.length === FLEETS.length ? [] : fleet,
    shift,
    status: status.length === SLICER_STATUSES.length ? [] : status,
  };
}

const SLICER_KEYS = ['station', 'window', 'fleet', 'shift', 'status'];

export function hasSlicerParam(params) {
  return SLICER_KEYS.some((key) => params.has(key));
}

export function slicersFromParams(params) {
  return normalizeSlicers({
    station: params.get('station') ?? undefined,
    window: params.get('window') ?? undefined,
    fleet: (params.get('fleet') ?? '').split(',').map((item) => item.trim()).filter(Boolean),
    shift: params.get('shift') ?? undefined,
    status: (params.get('status') ?? '').split(',').map((item) => item.trim()).filter(Boolean),
  });
}

export function slicersToParams(slicers) {
  const params = new URLSearchParams();
  if (slicers.station !== DEFAULT_SLICERS.station) params.set('station', slicers.station);
  if (slicers.window !== DEFAULT_SLICERS.window) params.set('window', slicers.window);
  if (slicers.fleet.length) params.set('fleet', slicers.fleet.join(','));
  if (slicers.shift !== DEFAULT_SLICERS.shift) params.set('shift', slicers.shift);
  if (slicers.status.length) params.set('status', slicers.status.join(','));
  return params;
}

export function appliedTags(slicers) {
  const tags = [];
  if (slicers.station !== DEFAULT_SLICERS.station) {
    tags.push({ id: 'station', text: `Station: ${slicers.station}` });
  }
  if (slicers.window !== DEFAULT_SLICERS.window) {
    tags.push({ id: 'window', text: `Time window: ${windowLabel(slicers.window)}` });
  }
  if (slicers.fleet.length) {
    tags.push({ id: 'fleet', text: `Fleet: ${slicers.fleet.join(', ')}` });
  }
  if (slicers.shift !== DEFAULT_SLICERS.shift) {
    tags.push({ id: 'shift', text: `Shift: ${slicers.shift}` });
  }
  if (slicers.status.length) {
    tags.push({ id: 'status', text: `Status: ${slicers.status.join(', ')}` });
  }
  return tags;
}

export function readStoredSlicers() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalizeSlicers(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function initialSlicers(params) {
  if (hasSlicerParam(params)) return slicersFromParams(params);
  return readStoredSlicers() ?? {
    station: DEFAULT_SLICERS.station,
    window: DEFAULT_SLICERS.window,
    fleet: [],
    shift: DEFAULT_SLICERS.shift,
    status: [],
  };
}
