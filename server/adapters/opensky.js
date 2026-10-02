// Flight-ops adapter. Anonymous access uses live state vectors around each
// station. OPENSKY_CLIENT_ID and OPENSKY_CLIENT_SECRET also load yesterday's
// arrival and departure lists. A refresh upserts flights and leaves task
// assignments and plan state alone.

import { syncDisruptions } from '../ops/live-actions.js';
import { ensureAircraftCatalog } from './aircraft-catalog.js';

const STATIONS = [
  { code: 'HEL', icao: 'EFHK', timeZone: 'Europe/Helsinki', box: [60.28, 24.90, 60.35, 25.02] },
  { code: 'FRA', icao: 'EDDF', timeZone: 'Europe/Berlin', box: [50.01, 8.48, 50.08, 8.65] },
  { code: 'MUC', icao: 'EDDM', timeZone: 'Europe/Berlin', box: [48.33, 11.74, 48.39, 11.84] },
];

const LINE_CARDS = [
  ['Visual walkaround', 25, 'structures', 'B1', 'External', 0, 0],
  ['Service engine oil', 30, 'engine', 'B1', 'Engine', 1, 1],
  ['Cabin security check', 20, 'cabin', 'A', 'Cabin', 0, 0],
  ['Avionics bite test', 35, 'avionics', 'B1', 'Avionics', 0, 1],
];

const LINE_MINUTES = LINE_CARDS.reduce((total, card) => total + card[1], 0);
const GROUND_PLACEHOLDER_MS = 90 * 60 * 1000;
const EXTEND_WITHIN_MS = 15 * 60 * 1000;
const EXTEND_BY_MS = 60 * 60 * 1000;

const TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';

function shiftFor(date, timeZone) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', {
    hour: 'numeric',
    hourCycle: 'h23',
    timeZone,
  }).format(date));
  if (hour >= 6 && hour < 14) return 'Day';
  if (hour >= 14 && hour < 22) return 'Evening';
  return 'Night';
}

function fleetOf(typeCode) {
  const code = String(typeCode || '').toUpperCase();
  if (/^A3(18|19|20|21|2N|1N)|A20N|A21N/.test(code)) return 'A320 family';
  if (/^A33[2389]|^A339/.test(code)) return 'A330';
  if (/^B73[3-9]|^B3[78]M|^B38M|^B39M|^B37M/.test(code)) return 'B737';
  return 'Other';
}

function airlineCallsign(raw) {
  const callsign = String(raw || '').trim().toUpperCase();
  if (callsign.length < 4) return '';
  if (!/^[A-Z]{2,3}[A-Z0-9]*\d[A-Z0-9]*$/.test(callsign)) return '';
  return callsign;
}

function recordError(db, error) {
  db.prepare('UPDATE source_feed SET last_error = ? WHERE code = ?').run(String(error.message || error), 'flight_ops');
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(20000) });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${response.status} ${url} ${detail.slice(0, 180)}`);
  }
  return response.json();
}

async function liveOnGround() {
  const seen = [];
  for (const station of STATIONS) {
    const [lamin, lomin, lamax, lomax] = station.box;
    const url = `https://opensky-network.org/api/states/all?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}&extended=1`;
    const body = await fetchJson(url);
    for (const state of body.states || []) {
      const onGround = state[8] === true;
      const category = state[17];
      if (!onGround) continue;
      if (category === 16 || category === 17 || category === 18 || category === 19 || category === 20) continue;
      const callsign = airlineCallsign(state[1]);
      if (!callsign) continue;
      seen.push({
        station,
        icao24: String(state[0]).toLowerCase(),
        callsign,
      });
    }
  }
  return seen;
}

async function resolveIdentity(db, icao24) {
  const existing = db.prepare('SELECT registration, type_code, fleet_id, operator, icao24 FROM aircraft WHERE icao24 = ?').get(icao24);
  if (existing && existing.type_code !== 'unknown') return existing;
  const catalog = db.prepare('SELECT registration, typecode, operator FROM aircraft_catalog WHERE icao24 = ?').get(icao24);
  if (catalog?.registration) {
    return {
      registration: catalog.registration,
      type_code: catalog.typecode || 'unknown',
      fleet_id: fleetOf(catalog.typecode),
      operator: catalog.operator || '',
      icao24,
    };
  }
  try {
    const body = await fetchJson(`https://api.adsbdb.com/v0/aircraft/${icao24}`);
    const aircraft = body.response?.aircraft;
    if (!aircraft?.registration) throw new Error('no registration');
    return {
      registration: aircraft.registration,
      type_code: aircraft.icao_type || 'unknown',
      fleet_id: fleetOf(aircraft.icao_type),
      operator: aircraft.registered_owner_operator_flag_code || aircraft.registered_owner || '',
      icao24,
    };
  } catch {
    return {
      registration: `ICAO-${icao24.toUpperCase()}`,
      type_code: 'unknown',
      fleet_id: 'Other',
      operator: '',
      icao24,
    };
  }
}

async function identitiesFor(db, icao24s) {
  const map = new Map();
  const pending = [];
  for (const icao24 of icao24s) {
    const existing = db.prepare('SELECT registration, type_code, fleet_id, operator, icao24 FROM aircraft WHERE icao24 = ?').get(icao24);
    if (existing && existing.type_code !== 'unknown') map.set(icao24, existing);
    else pending.push(icao24);
  }
  let cursor = 0;
  async function worker() {
    while (cursor < pending.length) {
      const icao24 = pending[cursor];
      cursor += 1;
      map.set(icao24, await resolveIdentity(db, icao24));
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, pending.length) }, worker));
  return map;
}

function registrationFor(db, identity) {
  const taken = db.prepare('SELECT icao24 FROM aircraft WHERE registration = ?').get(identity.registration);
  if (!taken || taken.icao24 === identity.icao24) return identity.registration;
  return `${identity.registration}-${identity.icao24}`;
}

function ensureAircraft(db, identity) {
  const byIcao = db.prepare('SELECT registration, type_code FROM aircraft WHERE icao24 = ?').get(identity.icao24);
  if (byIcao && !(byIcao.registration.startsWith('ICAO-') && identity.type_code !== 'unknown')) {
    return byIcao.registration;
  }
  const registration = registrationFor(db, identity);
  if (!byIcao) {
    db.prepare(`INSERT INTO aircraft (registration, type_code, fleet_id, operator, icao24)
      VALUES (?, ?, ?, ?, ?)`).run(registration, identity.type_code, identity.fleet_id, identity.operator, identity.icao24);
    return registration;
  }
  db.prepare(`INSERT INTO aircraft (registration, type_code, fleet_id, operator, icao24)
    VALUES (?, ?, ?, ?, NULL)`).run(registration, identity.type_code, identity.fleet_id, identity.operator);
  db.prepare('UPDATE turnaround SET aircraft_registration = ? WHERE aircraft_registration = ?').run(registration, byIcao.registration);
  db.prepare('UPDATE aircraft SET icao24 = NULL WHERE registration = ?').run(byIcao.registration);
  db.prepare('UPDATE aircraft SET icao24 = ? WHERE registration = ?').run(identity.icao24, registration);
  db.prepare('DELETE FROM aircraft WHERE registration = ? AND registration != ?').run(byIcao.registration, registration);
  return registration;
}

function createVisit(db, { station, registration, callsign, icao24, start, end, status }) {
  const startIso = new Date(start).toISOString();
  const endIso = new Date(end).toISOString();
  const turnaroundId = `os-${station.code.toLowerCase()}-${icao24}-${Math.floor(start / 1000)}`;
  const flightId = `fl-${turnaroundId}`;
  db.prepare(`INSERT INTO flight
    (id, flight_number, window_start, window_end, estimated_start, estimated_end, source_key, observed_at)
    VALUES (?, ?, ?, ?, NULL, NULL, ?, ?)`).run(
    flightId,
    callsign,
    startIso,
    endIso,
    `opensky:${station.code}:${icao24}:${Math.floor(start / 1000)}`,
    new Date().toISOString(),
  );
  db.prepare(`INSERT INTO turnaround
    (id, station_code, aircraft_registration, flight_id, stand_id, shift_code, status, blocked_reason, required_hours, assigned_hours)
    VALUES (?, ?, ?, ?, NULL, ?, ?, NULL, ?, 0)`).run(
    turnaroundId,
    station.code,
    registration,
    flightId,
    shiftFor(new Date(start), station.timeZone),
    status,
    Math.round((LINE_MINUTES / 60) * 10) / 10,
  );
  const packageId = `WP-${turnaroundId}`;
  db.prepare(`INSERT INTO work_package (id, turnaround_id, source, source_key, package_type)
    VALUES (?, ?, 'generated', ?, 'line')`).run(packageId, turnaroundId, packageId);
  const insertTask = db.prepare(`INSERT INTO task
    (id, work_package_id, title, sort_order, duration_min, skill_id, license_id, zone,
     needs_parts, needs_tools, parts_ready, tools_ready, plan_status, start_min, ad_hoc, card_source, notes, source_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, 0, 'AMP', '', ?)`);
  LINE_CARDS.forEach((card, index) => {
    const [title, duration, skill, license, zone, needsParts, needsTools] = card;
    insertTask.run(
      `${turnaroundId}-t${index + 1}`,
      packageId,
      title,
      index,
      duration,
      skill,
      license,
      zone,
      needsParts,
      needsTools,
      needsParts ? 0 : 1,
      1,
      `${packageId}:t${index + 1}`,
    );
  });
  db.prepare(`INSERT INTO plan
    (turnaround_id, state, block_on_conflicts, license_override, visit_notes, last_generate_ok, last_generate_reason)
    VALUES (?, 'Draft', 1, '', '', NULL, '')`).run(turnaroundId);
  return turnaroundId;
}

function applyLive(db, seen, identities) {
  const now = Date.now();
  const seenKeys = new Set(seen.map((item) => `${item.station.code}:${item.icao24}`));
  let created = 0;
  let stillHere = 0;
  for (const item of seen) {
    const registration = ensureAircraft(db, identities.get(item.icao24));
    const open = db.prepare(`SELECT t.id, f.id AS flight_id, f.window_end, f.window_locked, p.state AS plan_state
      FROM turnaround t
      JOIN flight f ON f.id = t.flight_id
      JOIN aircraft a ON a.registration = t.aircraft_registration
      JOIN plan p ON p.turnaround_id = t.id
      WHERE t.station_code = ? AND a.icao24 = ? AND t.status IN ('In progress', 'Delayed', 'At risk')`).get(item.station.code, item.icao24);
    if (open) {
      stillHere += 1;
      db.prepare('UPDATE flight SET flight_number = ?, observed_at = ? WHERE id = ?').run(item.callsign, new Date(now).toISOString(), open.flight_id);
      const end = new Date(open.window_end).getTime();
      if (open.plan_state === 'Draft' && !open.window_locked && now > end - EXTEND_WITHIN_MS) {
        db.prepare('UPDATE flight SET window_end = ? WHERE id = ?').run(new Date(now + EXTEND_BY_MS).toISOString(), open.flight_id);
      }
      continue;
    }
    createVisit(db, {
      station: item.station,
      registration,
      callsign: item.callsign,
      icao24: item.icao24,
      start: now,
      end: now + GROUND_PLACEHOLDER_MS,
      status: 'In progress',
    });
    created += 1;
  }

  const openVisits = db.prepare(`SELECT t.id, t.station_code, f.id AS flight_id, f.window_end, a.icao24, p.state AS plan_state
    FROM turnaround t
    JOIN flight f ON f.id = t.flight_id
    JOIN aircraft a ON a.registration = t.aircraft_registration
    JOIN plan p ON p.turnaround_id = t.id
    WHERE t.status IN ('In progress', 'Delayed', 'At risk') AND f.source_key LIKE 'opensky:%'`).all();
  let completed = 0;
  for (const visit of openVisits) {
    if (seenKeys.has(`${visit.station_code}:${visit.icao24}`)) continue;
    if (now < new Date(visit.window_end).getTime()) continue;
    db.prepare(`UPDATE turnaround SET status = 'Completed' WHERE id = ?`).run(visit.id);
    if (visit.plan_state === 'Draft') {
      db.prepare('UPDATE flight SET window_end = ?, observed_at = ? WHERE id = ?').run(new Date(now).toISOString(), new Date(now).toISOString(), visit.flight_id);
    }
    completed += 1;
  }
  return { created, stillHere, completed };
}

let cachedToken = null;
let tokenExpires = 0;

async function accessToken() {
  if (cachedToken && Date.now() < tokenExpires) return cachedToken;
  const clientId = process.env.OPENSKY_CLIENT_ID;
  const clientSecret = process.env.OPENSKY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });
  const payload = await fetchJson(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  cachedToken = payload.access_token;
  tokenExpires = Date.now() + ((payload.expires_in || 1800) - 30) * 1000;
  return cachedToken;
}

async function importPreviousDay(db) {
  const token = await accessToken();
  if (!token) return { imported: 0 };
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  const begin = new Date(end.getTime() - 86400000);
  const beginSec = Math.floor(begin.getTime() / 1000);
  const endSec = Math.floor(end.getTime() / 1000);
  let imported = 0;
  for (const station of STATIONS) {
    const headers = { Authorization: `Bearer ${token}` };
    const arrivals = await fetchJson(`https://opensky-network.org/api/flights/arrival?airport=${station.icao}&begin=${beginSec}&end=${endSec}`, { headers });
    const departures = await fetchJson(`https://opensky-network.org/api/flights/departure?airport=${station.icao}&begin=${beginSec}&end=${endSec + 86400}`, { headers });
    const deps = new Map();
    for (const flight of departures) {
      const icao24 = String(flight.icao24 || '').toLowerCase();
      if (!deps.has(icao24)) deps.set(icao24, []);
      deps.get(icao24).push(flight);
    }
    for (const list of deps.values()) list.sort((a, b) => a.firstSeen - b.firstSeen);
    for (const arrival of arrivals) {
      const icao24 = String(arrival.icao24 || '').toLowerCase();
      const callsign = airlineCallsign(arrival.callsign);
      if (!icao24 || !callsign || !arrival.lastSeen) continue;
      const sourceKey = `opensky:${station.code}:${icao24}:${arrival.lastSeen}`;
      const exists = db.prepare('SELECT id FROM flight WHERE source_key = ?').get(sourceKey);
      if (exists) continue;
      const dep = (deps.get(icao24) || []).find((item) => item.firstSeen >= arrival.lastSeen - 120 && item.firstSeen - arrival.lastSeen < 18 * 3600);
      const identity = await resolveIdentity(db, icao24);
      const registration = ensureAircraft(db, identity);
      createVisit(db, {
        station,
        registration,
        callsign,
        icao24,
        start: arrival.lastSeen * 1000,
        end: (dep ? dep.firstSeen : arrival.lastSeen + 90 * 60) * 1000,
        status: dep ? 'Completed' : 'In progress',
      });
      imported += 1;
    }
  }
  return { imported };
}

export async function refreshFlights(db) {
  try {
    try {
      await ensureAircraftCatalog(db);
    } catch (error) {
      console.error(`Aircraft catalog unavailable: ${error.message}`);
    }
    const seen = await liveOnGround();
    const identities = await identitiesFor(db, [...new Set(seen.map((item) => item.icao24))]);
    db.exec('BEGIN');
    let live;
    try {
      live = applyLive(db, seen, identities);
      db.prepare(`UPDATE source_feed SET last_success_at = ?, last_error = NULL WHERE code = 'flight_ops'`).run(new Date().toISOString());
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    let historicalImported = 0;
    if (process.env.OPENSKY_CLIENT_ID && process.env.OPENSKY_CLIENT_SECRET) {
      try {
        historicalImported = (await importPreviousDay(db)).imported;
      } catch (error) {
        db.prepare(`UPDATE source_feed SET last_error = ? WHERE code = 'flight_ops'`).run(String(error.message || error));
      }
    }
    try {
      syncDisruptions(db);
    } catch (error) {
      console.error(`Alert sync failed: ${error.message}`);
    }
    return {
      onGround: seen.length,
      ...live,
      historicalImported,
      historical: Boolean(process.env.OPENSKY_CLIENT_ID && process.env.OPENSKY_CLIENT_SECRET),
    };
  } catch (error) {
    recordError(db, error);
    throw error;
  }
}

export function flightSummary(db) {
  const counts = {
    turnarounds: db.prepare('SELECT COUNT(*) AS n FROM turnaround').get().n,
    inProgress: db.prepare(`SELECT COUNT(*) AS n FROM turnaround WHERE status = 'In progress'`).get().n,
    aircraft: db.prepare('SELECT COUNT(*) AS n FROM aircraft').get().n,
    tasks: db.prepare('SELECT COUNT(*) AS n FROM task').get().n,
  };
  const rows = db.prepare(`SELECT t.station_code, a.registration, a.type_code, a.fleet_id, f.flight_number,
      t.status, f.window_start, f.window_end
    FROM turnaround t
    JOIN aircraft a ON a.registration = t.aircraft_registration
    JOIN flight f ON f.id = t.flight_id
    WHERE t.status = 'In progress'
    ORDER BY t.station_code, f.flight_number`).all();
  const feed = db.prepare(`SELECT last_success_at, last_error FROM source_feed WHERE code = 'flight_ops'`).get();
  return { counts, rows, feed };
}
