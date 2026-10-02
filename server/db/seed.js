import { defaultShifts, people } from '../../src/data/roster.js';
import { openDb } from './open.js';
import { migrate } from './migrate.js';

const STATIONS = [
  ['HEL', 'Europe/Helsinki', 'Helsinki'],
  ['FRA', 'Europe/Berlin', 'Frankfurt'],
  ['MUC', 'Europe/Berlin', 'Munich'],
];

const FLEETS = ['A320 family', 'A330', 'B737', 'Other'];
const SKILLS = ['structures', 'engine', 'cabin', 'avionics'];
const LICENSES = ['B1', 'A', 'B2'];
const ROLES = ['admin', 'planner', 'supervisor', 'technician', 'viewer'];

function ymdInZone(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 86400000);
}

function utcFromLocal(ymd, hm, timeZone) {
  const [year, month, day] = ymd.split('-').map(Number);
  const [hour, minute] = hm.split(':').map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  let utc = desired;
  const format = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(format.formatToParts(new Date(utc)).map((part) => [part.type, part.value]));
    const shown = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
    const delta = desired - shown;
    if (delta === 0) break;
    utc += delta;
  }
  return new Date(utc).toISOString();
}

export function seed(db) {
  const insertStation = db.prepare('INSERT OR IGNORE INTO station (code, time_zone, name) VALUES (?, ?, ?)');
  const insertFleet = db.prepare('INSERT OR IGNORE INTO fleet (id) VALUES (?)');
  const insertSkill = db.prepare('INSERT OR IGNORE INTO skill (id, name) VALUES (?, ?)');
  const insertLicense = db.prepare('INSERT OR IGNORE INTO license (id, name) VALUES (?, ?)');
  const insertRole = db.prepare('INSERT OR IGNORE INTO role (id) VALUES (?)');
  const insertShift = db.prepare(`INSERT OR IGNORE INTO shift_template
    (code, start_local, end_local, coverage_license_id, minimum_count) VALUES (?, ?, ?, ?, ?)`);
  const insertFeed = db.prepare('INSERT OR IGNORE INTO source_feed (code, last_success_at, last_error) VALUES (?, ?, NULL)');
  const insertPerson = db.prepare(`INSERT OR IGNORE INTO person
    (id, name, home_station, team, max_hours, hours_already_worked, source_key) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const insertRating = db.prepare('INSERT OR IGNORE INTO person_rating (person_id, fleet_id) VALUES (?, ?)');
  const insertPersonLicense = db.prepare('INSERT OR IGNORE INTO person_license (person_id, license_id) VALUES (?, ?)');
  const insertPersonSkill = db.prepare('INSERT OR IGNORE INTO person_skill (person_id, skill_id) VALUES (?, ?)');
  const insertDuty = db.prepare(`INSERT OR IGNORE INTO duty
    (id, person_id, station_code, shift_code, availability, starts_at, ends_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);

  const now = new Date().toISOString();
  db.exec('BEGIN');
  try {
    for (const station of STATIONS) insertStation.run(...station);
    for (const fleet of FLEETS) insertFleet.run(fleet);
    for (const skill of SKILLS) insertSkill.run(skill, skill);
    for (const license of LICENSES) insertLicense.run(license, license);
    for (const role of ROLES) insertRole.run(role);
    for (const shift of defaultShifts) {
      insertShift.run(shift.id, shift.start, shift.end, shift.role, shift.minimum);
    }
    insertFeed.run('me', now);
    insertFeed.run('hr', now);
    insertFeed.run('flight_ops', null);

    const zones = Object.fromEntries(STATIONS.map(([code, timeZone]) => [code, timeZone]));
    for (const person of people) {
      insertPerson.run(
        person.id,
        person.name,
        person.station,
        person.team,
        person.maxHours,
        person.hoursAlreadyWorked,
        person.id,
      );
      for (const fleet of person.ratings) insertRating.run(person.id, fleet);
      for (const license of person.licenses) insertPersonLicense.run(person.id, license);
      for (const skill of person.skills) insertPersonSkill.run(person.id, skill);

      const timeZone = zones[person.station];
      const shift = defaultShifts.find((item) => item.id === person.shift);
      for (let offset = -14; offset <= 14; offset += 1) {
        const day = ymdInZone(addDays(new Date(), offset), timeZone);
        const starts = utcFromLocal(day, shift.start, timeZone);
        let ends = utcFromLocal(day, shift.end, timeZone);
        if (ends <= starts) ends = utcFromLocal(ymdInZone(addDays(new Date(`${day}T12:00:00Z`), 1), timeZone), shift.end, timeZone);
        insertDuty.run(
          `${person.id}:${starts}`,
          person.id,
          person.station,
          person.shift,
          person.availability,
          starts,
          ends,
        );
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  const db = openDb();
  migrate(db);
  seed(db);
  const peopleCount = db.prepare('SELECT COUNT(*) AS n FROM person').get().n;
  const dutyCount = db.prepare('SELECT COUNT(*) AS n FROM duty').get().n;
  console.log(`Seeded ${peopleCount} people and ${dutyCount} duties.`);
  db.close();
}
