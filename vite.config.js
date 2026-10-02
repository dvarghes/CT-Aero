import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { refreshFlights } from './server/adapters/opensky.js';
import { migrate } from './server/db/migrate.js';
import { openDb } from './server/db/open.js';
import { seed } from './server/db/seed.js';
import {
  acceptProposal,
  publishVisit,
  recordDelay,
  rejectProposal,
  replanAlert,
  setAlertSeverity,
  setAlertState,
  setExecution,
  syncDisruptions,
} from './server/ops/live-actions.js';
import { readOperation } from './server/read-model.js';
import { writePlan } from './server/write-model.js';

const pagesBase = '/CT-Aero/';
const refreshMs = 15 * 60 * 1000;

function prepareDb() {
  const db = openDb();
  migrate(db);
  seed(db);
  db.close();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function runAction(db, pathname, body) {
  if (pathname === '/api/alerts/delay') {
    recordDelay(db, body.visitId, body.minutes);
    return;
  }
  if (pathname === '/api/alerts/replan') {
    replanAlert(db, body.alertId);
    return;
  }
  if (pathname === '/api/alerts/accept') {
    acceptProposal(db, body.alertId);
    return;
  }
  if (pathname === '/api/alerts/reject') {
    rejectProposal(db, body.alertId);
    return;
  }
  if (pathname === '/api/alerts/state') {
    setAlertState(db, body.alertId, body.state);
    return;
  }
  if (pathname === '/api/alerts/severity') {
    setAlertSeverity(db, body.alertId, body.severity);
    return;
  }
  if (pathname === '/api/plans/publish') {
    publishVisit(db, body.visitId);
    return;
  }
  if (pathname === '/api/execution') {
    setExecution(db, body.taskId, body);
    return;
  }
  const error = new Error('Unknown API route.');
  error.status = 404;
  throw error;
}

function attachOperationApi(middlewares) {
  middlewares.use(async (req, res, next) => {
    const pathname = (req.url || '').split('?')[0];
    if (pathname !== '/api/operation' && !pathname.startsWith('/api/alerts/') && pathname !== '/api/plans/publish' && pathname !== '/api/execution') {
      next();
      return;
    }
    let db;
    try {
      db = openDb();
      if (pathname === '/api/operation' && req.method === 'GET') {
        syncDisruptions(db);
        sendJson(res, 200, readOperation(db));
        return;
      }
      if (pathname === '/api/operation' && req.method === 'PUT') {
        const payload = JSON.parse(await readBody(req));
        writePlan(db, payload);
        syncDisruptions(db);
        sendJson(res, 200, readOperation(db));
        return;
      }
      if (req.method === 'POST') {
        const payload = JSON.parse((await readBody(req)) || '{}');
        runAction(db, pathname, payload);
        syncDisruptions(db);
        sendJson(res, 200, readOperation(db));
        return;
      }
      sendJson(res, 405, { error: 'Method not allowed' });
    } catch (error) {
      sendJson(res, error.status || 400, { error: error.message });
    } finally {
      db?.close();
    }
  });
}

function operationApi() {
  let timer;
  let refreshing = false;

  function refreshSoon() {
    if (refreshing) return;
    refreshing = true;
    const db = openDb();
    refreshFlights(db)
      .then((result) => {
        console.log(`OpenSky refresh: ${result.onGround} on ground, ${result.created} new, ${result.stillHere} still here`);
      })
      .catch((error) => {
        console.error(`OpenSky refresh failed: ${error.message}`);
      })
      .finally(() => {
        db.close();
        refreshing = false;
      });
  }

  function start() {
    prepareDb();
    refreshSoon();
    timer = setInterval(refreshSoon, refreshMs);
  }

  function stop() {
    clearInterval(timer);
  }

  return {
    name: 'operation-api',
    configureServer(server) {
      attachOperationApi(server.middlewares);
      start();
      return stop;
    },
    configurePreviewServer(server) {
      attachOperationApi(server.middlewares);
      start();
      return stop;
    },
  };
}

export default defineConfig(({ command }) => ({
  base: command === 'build' ? pagesBase : '/',
  plugins: [
    react(),
    operationApi(),
    {
      name: 'github-pages-spa',
      apply: 'build',
      closeBundle() {
        const dist = path.resolve('dist');
        fs.copyFileSync(path.join(dist, 'index.html'), path.join(dist, '404.html'));
        fs.writeFileSync(path.join(dist, '.nojekyll'), '');
      },
    },
  ],
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'charts',
              test: /node_modules[\\/](@carbon[\\/]charts|d3-|d3$)/,
              priority: 30,
            },
            {
              name: 'react',
              test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/,
              priority: 20,
            },
          ],
        },
      },
    },
  },
}));
