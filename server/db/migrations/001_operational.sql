-- Local SQLite form of docs/operational-data-model.md.
-- Timestamps are UTC ISO-8601 text. Booleans are 0/1.
-- Adapter columns beyond the logical model: aircraft.icao24, flight.source_key, flight.observed_at,
-- task.source_key, person.source_key.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migration (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS station (
  code TEXT PRIMARY KEY,
  time_zone TEXT NOT NULL,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fleet (
  id TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS skill (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS license (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stand (
  id TEXT PRIMARY KEY,
  station_code TEXT NOT NULL REFERENCES station(code),
  code TEXT NOT NULL,
  UNIQUE (station_code, code)
);

CREATE TABLE IF NOT EXISTS aircraft (
  registration TEXT PRIMARY KEY,
  type_code TEXT NOT NULL,
  fleet_id TEXT NOT NULL REFERENCES fleet(id),
  operator TEXT NOT NULL DEFAULT '',
  icao24 TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS flight (
  id TEXT PRIMARY KEY,
  flight_number TEXT NOT NULL,
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  estimated_start TEXT,
  estimated_end TEXT,
  source_key TEXT NOT NULL UNIQUE,
  observed_at TEXT
);

CREATE TABLE IF NOT EXISTS turnaround (
  id TEXT PRIMARY KEY,
  station_code TEXT NOT NULL REFERENCES station(code),
  aircraft_registration TEXT NOT NULL REFERENCES aircraft(registration),
  flight_id TEXT NOT NULL UNIQUE REFERENCES flight(id),
  stand_id TEXT REFERENCES stand(id),
  shift_code TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'On track', 'In progress', 'Published', 'Draft', 'Completed',
    'At risk', 'Delayed', 'Blocked', 'Cancelled'
  )),
  blocked_reason TEXT,
  required_hours REAL NOT NULL,
  assigned_hours REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS turnaround_station_status ON turnaround(station_code, status);

CREATE TABLE IF NOT EXISTS work_package (
  id TEXT PRIMARY KEY,
  turnaround_id TEXT NOT NULL UNIQUE REFERENCES turnaround(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  source_key TEXT NOT NULL,
  package_type TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task (
  id TEXT PRIMARY KEY,
  work_package_id TEXT NOT NULL REFERENCES work_package(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  duration_min INTEGER NOT NULL CHECK (duration_min > 0),
  skill_id TEXT NOT NULL REFERENCES skill(id),
  license_id TEXT NOT NULL REFERENCES license(id),
  zone TEXT NOT NULL,
  needs_parts INTEGER NOT NULL,
  needs_tools INTEGER NOT NULL,
  parts_ready INTEGER NOT NULL,
  tools_ready INTEGER NOT NULL,
  plan_status TEXT NOT NULL CHECK (plan_status IN ('pending', 'scheduled', 'deferred', 'na')),
  start_min INTEGER,
  ad_hoc INTEGER NOT NULL,
  card_source TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  source_key TEXT
);

CREATE TABLE IF NOT EXISTS plan (
  turnaround_id TEXT PRIMARY KEY REFERENCES turnaround(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('Draft', 'Ready', 'Published', 'Locked', 'Completed')),
  block_on_conflicts INTEGER NOT NULL DEFAULT 1,
  license_override TEXT NOT NULL DEFAULT '',
  visit_notes TEXT NOT NULL DEFAULT '',
  last_generate_ok INTEGER,
  last_generate_reason TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS plan_version (
  id TEXT PRIMARY KEY,
  turnaround_id TEXT NOT NULL REFERENCES plan(turnaround_id) ON DELETE CASCADE,
  version_no INTEGER NOT NULL,
  published_at TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  UNIQUE (turnaround_id, version_no)
);

CREATE TABLE IF NOT EXISTS person (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  home_station TEXT NOT NULL REFERENCES station(code),
  team TEXT NOT NULL,
  max_hours REAL NOT NULL,
  hours_already_worked REAL NOT NULL,
  source_key TEXT
);

CREATE TABLE IF NOT EXISTS person_rating (
  person_id TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  fleet_id TEXT NOT NULL REFERENCES fleet(id),
  PRIMARY KEY (person_id, fleet_id)
);

CREATE TABLE IF NOT EXISTS person_license (
  person_id TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  license_id TEXT NOT NULL REFERENCES license(id),
  PRIMARY KEY (person_id, license_id)
);

CREATE TABLE IF NOT EXISTS person_skill (
  person_id TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL REFERENCES skill(id),
  PRIMARY KEY (person_id, skill_id)
);

CREATE TABLE IF NOT EXISTS shift_template (
  code TEXT PRIMARY KEY,
  start_local TEXT NOT NULL,
  end_local TEXT NOT NULL,
  coverage_license_id TEXT NOT NULL REFERENCES license(id),
  minimum_count INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS duty (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  station_code TEXT NOT NULL REFERENCES station(code),
  shift_code TEXT NOT NULL REFERENCES shift_template(code),
  availability TEXT NOT NULL CHECK (availability IN ('on shift', 'off', 'absent')),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  UNIQUE (person_id, starts_at)
);

CREATE TABLE IF NOT EXISTS task_execution (
  task_id TEXT PRIMARY KEY REFERENCES task(id) ON DELETE CASCADE,
  execution_state TEXT NOT NULL CHECK (execution_state IN (
    'not_started', 'started', 'paused', 'blocked', 'done'
  )),
  blocked_reason TEXT,
  actual_start TEXT,
  actual_end TEXT,
  actual_duration_min INTEGER
);

CREATE TABLE IF NOT EXISTS alert (
  id TEXT PRIMARY KEY,
  turnaround_id TEXT NOT NULL REFERENCES turnaround(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (alert_type IN (
    'delayed_flight', 'diverted_flight', 'cancelled_flight',
    'ground_time_shrink', 'absence', 'missing_part', 'missing_tool',
    'task_overrun', 'integration_failure'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  state TEXT NOT NULL CHECK (state IN ('unread', 'acknowledged', 'resolved')),
  created_at TEXT NOT NULL,
  acknowledged_at TEXT,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS alert_person (
  alert_id TEXT NOT NULL REFERENCES alert(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES person(id),
  PRIMARY KEY (alert_id, person_id)
);

CREATE TABLE IF NOT EXISTS source_feed (
  code TEXT PRIMARY KEY,
  last_success_at TEXT,
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS role (
  id TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS app_user (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  person_id TEXT UNIQUE REFERENCES person(id)
);

CREATE TABLE IF NOT EXISTS user_role (
  user_id TEXT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES role(id),
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS audit_event (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  actor_user_id TEXT REFERENCES app_user(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS aircraft_catalog (
  icao24 TEXT PRIMARY KEY,
  registration TEXT NOT NULL,
  typecode TEXT NOT NULL DEFAULT '',
  operator TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS assignment (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES person(id),
  UNIQUE (task_id, person_id)
);
