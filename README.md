# CT-Aero

Line-maintenance production planning for airline and MRO stations. Planners open a Control tower, slice the operation, and see which turnarounds need action.

This repository is the first UI pass: a Carbon shell and the landing dashboard, filled with mock data. Product requirements are in [PRD-Line-Maintenance-Assignment.md](PRD-Line-Maintenance-Assignment.md). Layout and components are in [layouts/00-ui-shell.md](layouts/00-ui-shell.md). Where those two disagree, the shell spec decides layout and the PRD decides behavior.

## What is implemented

- Carbon v11 shell, theme Gray 90: 48px header and a 256px vertical SideNav
- Routes: Control tower, Planner, Workforce, Alerts, Horizon, Reports, Admin
- Global slicers in the SideNav: station, time window, fleet, shift, status
- Landing dashboard at `/`: KPIs, status mix, capacity, attention table, and a compact window list
- Mock turnarounds, alerts, and source ages so every slicer changes the dashboard

Planner Gantt, workforce assignment, the alert inbox, horizon, reports, admin configuration, mobile, and live M&E / Flight Ops / HR integrations are not in this pass. Those routes keep the shell and show the active slice only.

The desktop targets are Chrome at 1440×900 and 1280×800, 100% zoom, with no horizontal page scroll. Below 1280px the SideNav overlays the page.

## Run

Requires Node.js 20.12 or newer (22 is fine). Vite 8 uses `node:util` `styleText`, which older Node builds do not export.

```bash
npm install
npm run dev
```

Open http://localhost:5173/.

If an older `node` is first on `PATH` and a new enough Node is also installed, `scripts/run.cjs` runs Vite with the newer one. `npm run dev`, `npm run build`, and `npm run preview` all go through that script.

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build in `dist/` |
| `npm run preview` | Serve the production build |

## Using the dashboard

Slicers live in the left nav, under the routes. A change applies immediately to the dashboard and is kept for the browser session. Non-default slicers also appear as closable tags under the page title and in the URL, for example `?station=HEL&window=24h`. **Reset slicers** returns the defaults: all stations, Now–12h, all fleets, all shifts, all statuses.

On `/`:

- **Turnarounds in window**, **At risk / delayed**, **Staff fill**, and **Open alerts** summarize the slice. At risk scrolls to the attention table. Staff fill opens Workforce. Open alerts opens Alerts.
- **Status mix** and **Capacity** are Carbon Charts on the g90 theme.
- **Attention** lists turnarounds that need action (At risk, Delayed, Blocked), unless a status slicer names other statuses. Search matches tail, flight, or work order. A row opens `/planner/:id`.
- At 1280px the table drops Type and Staff fill so the page does not scroll sideways. KPI tiles wrap 2×2 and the two charts stack.

Ground times are shown in station local time. Hover a time for the UTC range. The subtitle ages are how long ago the mock M&E, Flight Ops, and HR feeds last synced.

## Mock data

There is no backend. `src/data/mock.js` builds the operation when the page loads, relative to that moment, so the default 12-hour window always has visits. A fixed seed keeps durations and staff-fill ratios stable across refreshes.

- **168 turnarounds** across HEL, FRA, and MUC, from 14 days ago through 14 days ahead, so every time-window slicer changes the counts
- Fleets A320 family, A330, and B737; shifts taken from the start time in the station time zone (HEL `Europe/Helsinki`, FRA and MUC `Europe/Berlin`)
- The next 12 hours use a fixed status mix. **OH-LWP** is At risk at 50% fill and **D-AIGX** is Delayed at 78% fill
- Alerts hang off At risk, Delayed, and Blocked visits. One unread alert per station in the next 12 hours drives the header badge
- Crew headcount per station and shift supplies the capacity chart. Fleet and status filters change demand; station and shift filters change supply as well

`src/data/slice.js` applies the slicers and computes the KPI deltas against the previous window of the same length.

## Stack

React 19, React Router 7, Vite 8, IBM Carbon React v11 (`@carbon/react`, `@carbon/styles`, `@carbon/icons-react`) and `@carbon/charts-react`. Theme `g90`, default IBM Blue interactive color. No custom brand palette.
