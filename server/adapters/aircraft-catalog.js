import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const catalogUrl = 'https://s3.opensky-network.org/data-samples/metadata/aircraftDatabase.csv';
const catalogFile = path.resolve('server/data/aircraftDatabase.csv');

function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

async function downloadCatalog() {
  const response = await fetch(catalogUrl, { signal: AbortSignal.timeout(180000) });
  if (!response.ok || !response.body) throw new Error(`Aircraft catalog download failed (${response.status})`);
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(catalogFile));
}

function importCatalog(db) {
  const insert = db.prepare(`INSERT OR REPLACE INTO aircraft_catalog (icao24, registration, typecode, operator)
    VALUES (?, ?, ?, ?)`);
  return new Promise((resolve, reject) => {
    const lines = readline.createInterface({ input: fs.createReadStream(catalogFile), crlfDelay: Infinity });
    let header = true;
    let imported = 0;
    db.exec('BEGIN');
    lines.on('line', (line) => {
      if (header) {
        header = false;
        return;
      }
      const fields = parseCsvLine(line);
      const icao24 = (fields[0] || '').trim().toLowerCase();
      const registration = (fields[1] || '').trim();
      if (!icao24 || !registration) return;
      insert.run(icao24, registration, (fields[5] || '').trim(), (fields[11] || '').trim());
      imported += 1;
    });
    lines.on('close', () => {
      db.exec('COMMIT');
      resolve(imported);
    });
    lines.on('error', (error) => {
      try { db.exec('ROLLBACK'); } catch { /* already closed */ }
      reject(error);
    });
  });
}

export async function ensureAircraftCatalog(db) {
  const ready = db.prepare('SELECT COUNT(*) AS n FROM aircraft_catalog').get().n;
  if (ready > 0) return ready;
  if (!fs.existsSync(catalogFile)) await downloadCatalog();
  return importCatalog(db);
}
