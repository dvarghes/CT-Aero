import { flightSummary, refreshFlights } from './adapters/opensky.js';
import { migrate } from './db/migrate.js';
import { openDb } from './db/open.js';
import { seed } from './db/seed.js';

const db = openDb();
migrate(db);
seed(db);
const result = await refreshFlights(db);
const summary = flightSummary(db);
console.log(JSON.stringify({ result, counts: summary.counts, feed: summary.feed }, null, 2));
for (const row of summary.rows) {
  console.log(`${row.station_code}  ${row.flight_number.padEnd(8)}  ${row.registration.padEnd(10)}  ${row.type_code.padEnd(6)}  ${row.fleet_id}`);
}
db.close();
