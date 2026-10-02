import { flightSummary, refreshFlights } from './adapters/opensky.js';
import { migrate } from './db/migrate.js';
import { openDb } from './db/open.js';
import { seed } from './db/seed.js';

const intervalMs = 15 * 60 * 1000;
const db = openDb();
migrate(db);
seed(db);

async function tick() {
  const started = new Date().toISOString();
  try {
    const result = await refreshFlights(db);
    const summary = flightSummary(db);
    console.log(`${started} on ground ${result.onGround}, new ${result.created}, still here ${result.stillHere}, completed ${result.completed}, open ${summary.counts.inProgress}`);
  } catch (error) {
    console.error(`${started} refresh failed: ${error.message}`);
  }
}

await tick();
setInterval(tick, intervalMs);
console.log('Refreshing OpenSky every 15 minutes. Stop with Ctrl+C.');
