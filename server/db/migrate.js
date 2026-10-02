import fs from 'node:fs';
import path from 'node:path';
import { openDb } from './open.js';

export function migrate(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migration (
    id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);
  const dir = path.resolve('server/db/migrations');
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.sql')).sort();
  const applied = db.prepare('SELECT id FROM schema_migration WHERE id = ?');
  const mark = db.prepare('INSERT INTO schema_migration (id, applied_at) VALUES (?, ?)');
  for (const file of files) {
    const id = file.replace(/\.sql$/, '');
    if (applied.get(id)) continue;
    db.exec(fs.readFileSync(path.join(dir, file), 'utf8'));
    mark.run(id, new Date().toISOString());
  }
}

if (process.argv[1] && process.argv[1].endsWith('migrate.js')) {
  const db = openDb();
  migrate(db);
  console.log('Applied operational schema.');
  db.close();
}
