# CT-Aero

Line-maintenance production planning for airline and MRO stations. Planners open a Control tower, slice the operation, and see which turnarounds need action.

The screens read and write a local SQLite operation. Flight Ops is a live [OpenSky](https://opensky-network.org/) refresh for Helsinki, Frankfurt, and Munich. Each new visit gets a generated line package, and the technician roster is seeded from `src/data/roster.js`. Product requirements are in [PRD-Line-Maintenance-Assignment.md](PRD-Line-Maintenance-Assignment.md). Layout and components are in [layouts/00-ui-shell.md](layouts/00-ui-shell.md). Where those two disagree, the shell spec decides layout and the PRD decides behavior. Schema migrations are in `server/db/migrations/`.

## What is implemented

- Carbon v11 shell, theme Gray 90: 48px header and a 256px vertical SideNav
- Routes: Control tower, Planner, Workforce, Alerts, Execution, Horizon, Reports
- Global slicers in the SideNav: station, time window, fleet, shift, status
- Landing dashboard at `/`: KPIs, status mix, capacity, attention table, and a compact window list
- Operation API on the Vite dev and preview servers, backed by `server/data/assignment.db`
- OpenSky refresh for aircraft on the ground at HEL, FRA, and MUC, with planner, alert, and execution writes saved back to that database

Horizon and Reports keep the shell and show the active slice only. `/admin` is the same kind of placeholder and is not in the SideNav. Mobile, station administration, and customer M&E and HR feeds are not in this pass.

The desktop targets are Chrome at 1440×900 and 1280×800, 100% zoom, with no horizontal page scroll. Below 1280px the SideNav overlays the page.

## Run

Requires Node.js 22. The database uses `node:sqlite`. Vite 8 also needs `node:util` `styleText`, which needs Node.js 20.12+, 21.7+, or 22+. If an older `node` is first on `PATH` and a current Node is installed, `scripts/run.cjs` and `scripts/run-tool.cjs` re-exec with the newer one.

```bash
npm install
npm run dev
```

Open http://localhost:5173/. The first start creates `server/data/assignment.db` (gitignored), applies migrations, seeds stations and the roster, and refreshes OpenSky. The refresh repeats every 15 minutes while the dev or preview server is running. The browser polls `GET /api/operation` every 20 seconds.

The first refresh downloads the OpenSky aircraft database to `server/data/aircraftDatabase.csv` (gitignored) and imports it for tail and type lookups. Later refreshes reuse that file.

`npm run build` writes the static site to `dist/` with base `/CT-Aero/`. GitHub Pages publishes that build to https://dvarghes.github.io/CT-Aero/. Pages has no database, so that site renders the bundled sample operation: stations, turnarounds, alerts, and task cards generated in the browser. `npm run dev`, and `npm run preview` at http://localhost:4173/CT-Aero/, read and write `server/data/assignment.db` instead. Preview serves the production build and attaches the same API.

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 5173, with the operation API and OpenSky refresh |
| `npm run build` | Production build in `dist/` |
| `npm run preview` | Production build on port 4173, with the same API and refresh |
| `npm run db:migrate` | Apply SQLite migrations |
| `npm run db:seed` | Seed stations, skills, shifts, and the roster |
| `npm run db:refresh` | Refresh OpenSky once |
| `npm run db:watch` | Refresh OpenSky every 15 minutes |

Set `OPENSKY_CLIENT_ID` and `OPENSKY_CLIENT_SECRET` to also import the previous day's arrivals and departures. Without them, the refresh uses anonymous live state vectors for aircraft on the ground.

## Using the dashboard

Slicers live in the left nav, under the routes. A change applies immediately to the dashboard and is kept for the browser session. Non-default slicers also appear as closable tags under the page title and in the URL, for example `?station=HEL&window=24h`. **Reset slicers** returns the defaults: all stations, Now–12h, all fleets, all shifts, all statuses.

On `/`:

- **Turnarounds in window**, **At risk / delayed**, **Staff fill**, and **Open alerts** summarize the slice. At risk scrolls to the attention table. Staff fill opens Workforce. Open alerts opens Alerts.
- **Status mix** and **Capacity** are Carbon Charts on the g90 theme.
- **Attention** lists turnarounds that need action (At risk, Delayed, Blocked), unless a status slicer names other statuses. Search matches tail, flight, or work order. A row opens `/planner/:id`.
- At 1280px the table drops Type and Staff fill so the page does not scroll sideways. KPI tiles wrap 2×2 and the two charts stack.

Ground times are shown in station local time. Hover a time for the UTC range. The subtitle ages are the last successful M&E, Flight Ops, and HR sync stored on `source_feed`. M&E and HR are stamped when the roster is seeded. Flight Ops advances on each successful OpenSky refresh. The clock in the header is that Flight Ops time in UTC.

Anonymous OpenSky only reports airliners on the ground at HEL, FRA, and MUC at refresh time. Now–12h fills after the first successful refresh. Longer windows stay thin unless the OpenSky credentials import yesterday's movements.

## Operation data

`src/data/OperationContext.jsx` loads `GET /api/operation` when the Vite server is running. On GitHub Pages that request fails, and the screens use the sample from `src/data/mock.js`, `src/data/roster.js`, and `src/data/workpackages.js`. Acknowledge, severity, and execution progress stay in the browser session. Delay, replan, and publish need the local database. Slicers stay in the browser and in the URL. `src/data/slice.js` filters the loaded operation and computes the KPI deltas against the previous window of the same length.

SQLite lives at `server/data/assignment.db`.

- Stations are HEL (`Europe/Helsinki`), FRA, and MUC (`Europe/Berlin`).
- People, skills, licenses, and duties come from `src/data/roster.js`. Duties cover 14 days back through 14 days ahead. Seeding again leaves rows that already exist.
- OpenSky upserts flights, aircraft, and turnarounds. A new visit gets four generated line cards and a Draft plan. A later refresh updates the callsign and can extend a Draft ground window. It leaves task order, start times, assignments, plan state, notes, and license overrides in place.
- `PUT /api/operation` saves a plan. `POST /api/alerts/delay`, `/replan`, `/accept`, `/reject`, `/state`, and `/severity` update alerts. `POST /api/plans/publish` publishes a visit. `POST /api/execution` records task progress.

## Stack

React 19, React Router 7, Vite 8, IBM Carbon React v11 (`@carbon/react`, `@carbon/styles`, `@carbon/icons-react`) and `@carbon/charts-react`. Theme `g90`, default IBM Blue interactive color. No custom brand palette. The operation database is Node.js `node:sqlite`.
