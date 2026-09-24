# Product Requirements Document

**Product:** Line Maintenance Assignment  
**Working title:** Assignment  
**Document type:** Product Requirements Document (PRD)  
**Version:** 1.1  
**Status:** Draft  
**Date:** 24 September 2026  
**Owner:** Product  
**Inspired by:** QOCO Assignment (line-maintenance production planning)  
**Design system:** IBM Carbon v11, theme Gray 90 (`g90`)  
**Layout spec:** `layouts/00-ui-shell.md`

---

## 1. Summary

Assignment is a SaaS product for airline and MRO **line maintenance production planning and execution**. It replaces the current practice of jumping between an M&E system, a Flight Ops system, an HR/roster tool, and spreadsheets.

Planners land on a **bird’s-eye dashboard** (Control tower) that summarises the current slice of the operation: volume, risk, staffing fill, and alerts. From there they open a turnaround and work the plan. An optimisation engine (and later agentic AI) drafts task sequences and technician assignments. Supervisors review and override. Technicians receive a personal schedule on mobile or tablet and report progress from the apron.

The desktop UI is a **vertical operations console**: left SideNav for destinations and slicers, stacked dashboard bands on `/`, no horizontal primary navigation. It must be fully usable in **Chrome on a MacBook** at 1440×900 and 1280×800 with no horizontal page scroll. Visual system is Carbon **g90** with default IBM Blue interactive tokens.

---

## 2. Problem

Line maintenance planning is still largely manual even when the airline is otherwise digital.

| Today | Consequence |
| --- | --- |
| Work packages live in M&E | Planner copies tasks into a spreadsheet or another tool |
| Ground times live in Flight Ops | Delays, diversions, and cancellations are seen late |
| Skills, licenses, and shifts live in HR | Wrong person assigned, or qualified people left idle |
| Tooling/parts status is elsewhere | Plan is published that cannot be executed |
| Replanning is manual | A single delayed inbound creates hours of reshuffle |
| Technicians get paper, radio, or chat | Ambiguous task list, stale plan after a change |

This causes low wrench time, maintenance-driven delays, supervisor overload, and unfair or unsafe allocations.

---

## 3. Goals

### 3.1 Product goals

1. Give planners a **bird’s-eye landing dashboard** plus **one visual plan** that already combines Flight Ops, M&E work packages, and workforce data.
2. Cut routine planning time by generating a feasible schedule automatically.
3. Make disruption replanning a one-action flow, not a rebuild from scratch.
4. Put a personal, current schedule in every technician’s hand.
5. Expose constraints (skills, rest, ground time, parts/tools) in the UI so overrides stay legal and executable.
6. Create a feedback loop from actuals back into estimates and future plans.
7. Let users **slice** the whole desktop UI from a vertical menu (station, window, fleet, shift, status) without a horizontal filter bar.
8. Keep the desktop chrome and landing view readable **end-to-end in MacBook Chrome** without sideways scrolling.

### 3.2 Success metrics (targets to validate in design partners)

| Metric | Target (12 months after EIS) |
| --- | --- |
| Routine plan creation time | Down 50–80% vs baseline |
| Supervisor time spent on allocation | Down 30–60% |
| Frontline wrench time / productivity | +10% |
| Maintenance-driven delays / AOG from planning errors | −20–30% |
| Share of tasks auto-assigned without edit | Track; improve quarter over quarter |
| Technician schedule adoption (opened / completed in app) | >80% of assigned tasks |
| Plan staleness (published plan vs executed plan after disruption) | Replan published in <5 minutes for a single delayed turnaround |

### 3.3 Non-goals (v1)

- Full M&E / CAMO system replacement (work packages originate elsewhere).
- Payroll, union bidding, or full HRIS.
- Deep tooling inventory (integrate; do not rebuild a tool crib).
- Base-maintenance hangar project management as the primary workflow (supported later if the same engine fits).
- Fully autonomous planning with no human publish step.

---

## 4. Users and jobs

### 4.1 Personas

**Production planner**  
Builds the shift and the next 24–72 hours. Needs speed, constraint visibility, and a publishable plan.

**Supervisor / team lead**  
Owns a station or crew for a shift. Needs “who is on what aircraft,” late tasks, and fast reassignment.

**Technician / mechanic**  
Needs only: where to go, what to do, who else is on the job, and when the plan changed.

**CAMO / maintenance control (read + exception)**  
Needs fleet-level risk: visits that will miss ground time, unstaffed checks, deferred work.

**Admin**  
Stations, skills, rules, roles, integrations.

### 4.2 Primary jobs to be done

- “In one screen, show me whether this shift is healthy: volume, risk, fill, alerts.”
- “Show me every turnaround at this station in the next 12 hours and which ones are already broken.”
- “Turn this work package into a sequenced, staffed plan that fits the ground time.”
- “The inbound is 40 minutes late — rebuild the plan without starting over.”
- “Give each mechanic a list they can trust.”
- “Tell me who is over-allocated and who is idle with the right ticket.”

---

## 5. Scope

### 5.1 In scope (MVP through v1.2)

- Control-tower **landing dashboard** (KPIs, analysis charts, attention list)
- Global **vertical slicers** (station, time window, fleet, shift, status)
- Control-tower attention list of turnarounds
- Work-package → task breakdown and sequencing
- Workforce board and assignment
- Publish / lock plans
- Disruption alerts and replanning
- Live progress and time capture
- Technician mobile/tablet app
- Mid-term capacity view (at least 14 days)
- Reports for planning quality and execution
- Configuration of stations, skills, shifts, and rules
- Integrations: M&E, Flight Ops, HR/roster; optional tooling

### 5.2 Out of scope

- Authoring official approved maintenance data / AMP
- Digital signature / CRS as system of record (can display status from M&E)
- Financial costing of visits
- Engine shop-visit planning
- Multi-tenant OEM data exchange (separate platform concern)

---

## 6. Product principles

1. **One plan, many roles.** Planner, supervisor, and technician see the same objects, different density.
2. **AI drafts, humans publish.** No silent change to a live shift without a visible proposal.
3. **Constraints are first-class UI**, not hidden validation errors after save.
4. **Disruption is the default path**, not an edge case.
5. **Apron-ready.** Mobile must work with poor connectivity and gloves-off-but-dirty hands.
6. **Integrate, don’t duplicate** systems of record for flights, work cards, and people.
7. **Vertical first.** Destinations and slicers live in a left column. Do not put primary IA or primary filters in the header.
8. **One MacBook window.** If a widget needs horizontal panning on 1280×800 Chrome, it does not belong on the landing page.

---

## 7. Information architecture

```
App (Carbon Theme g90, vertical shell)
├── Header                 (product name + alerts/help/account only)
├── SideNav                (vertical routes + slicer menus)
│   ├── Control tower      /          landing dashboard
│   ├── Planner            /planner
│   ├── Workforce          /workforce
│   ├── Alerts             /alerts
│   ├── Horizon            /horizon
│   ├── Reports            /reports
│   ├── Slicers            station | window | fleet | shift | status
│   └── Admin              /admin
├── Control tower dashboard
│   ├── KPI tiles
│   ├── Status mix + capacity
│   └── Attention list
├── Turnaround Planner     (detail + Gantt that fits the remaining canvas)
├── Workforce
├── Alerts
├── Execution
├── Horizon
├── Reports
└── Mobile
    ├── My shift
    ├── Task
    └── Team
```

Global slicer state is shared across all desktop routes. Spec details: `layouts/00-ui-shell.md`.

---

## 8. Functional and UI requirements

Requirements use this priority:

- **P0** — MVP; product is not usable without it  
- **P1** — v1; needed to match the category  
- **P2** — differentiator / shortly after v1  

Acceptance is written so design and engineering can test the UI, not only the backend.

---

### 8.0 Shell, theme, viewport, and slicers

**Purpose:** One vertical Carbon shell that fits a MacBook Chrome window and slices every desktop view.

| ID | Priority | Requirement |
| --- | --- | --- |
| SH-01 | P0 | Implement IBM Carbon v11 UI Shell: `Header` + left `SideNav`. No `HeaderNavigation`. |
| SH-02 | P0 | Theme is Carbon `g90` (Gray 90) with default IBM Blue interactive tokens. Do not introduce a custom palette. |
| SH-03 | P0 | SideNav is a persistent **256px vertical** column on viewports ≥1280px (`isFixedNav`, `defaultExpanded`, `isRail=false`). |
| SH-04 | P0 | Header is 48px and contains only `HeaderName` (`Tech Ops` / `Assignment`) plus Alerts, Help, and Account actions. |
| SH-05 | P0 | Primary target frame is Chrome on macOS at **1440×900**. Minimum desktop is **1280×800**. No horizontal page scrollbar at either size at 100% zoom. |
| SH-06 | P0 | Vertical slicer menus in the SideNav: Station, Time window, Fleet, Shift, Status. Changing a slicer reslices dashboard, planner lists, workforce, alerts, horizon, and reports. |
| SH-07 | P0 | Applied slicers appear as closable Carbon `Tag`s under the page title. Reset slicers returns defaults. |
| SH-08 | P0 | Slicer defaults: All stations, Now–12h, All fleets, All shifts, All statuses. |
| SH-09 | P1 | Slicers persist for the session and may be reflected in query params. |
| SH-10 | P0 | Below 1280px, SideNav may overlay. The MacBook default must not use overlay. |

**Acceptance**

- A reviewer on a 13–14" MacBook in Chrome sees header, full SideNav labels, slicer menus, and the landing dashboard without panning sideways.
- There are no top-of-page nav links besides the product name.

---

### 8.1 Control tower (landing dashboard)

**Purpose:** Bird’s-eye analysis of the current slice so a planner or supervisor can judge shift health in seconds, then drill into visits that need work.

Landing route is `/`. Layout is **vertical bands**, not a horizontal board. Full widget list: `layouts/00-ui-shell.md` §9.

| ID | Priority | Requirement |
| --- | --- | --- |
| CT-01 | P0 | `/` renders the dashboard (KPIs, analysis, attention list), not a full-width Gantt. |
| CT-02 | P0 | Band B shows four KPI tiles for the active slice: turnarounds in window; at risk / delayed; staff fill %; open alerts. |
| CT-03 | P0 | Band C shows a status-mix chart and a capacity required-vs-available chart using `@carbon/charts-react` with the g90 chart theme. |
| CT-04 | P0 | Band D is an attention `DataTable` of turnarounds that need action (At risk, Delayed, Blocked first). |
| CT-05 | P0 | Attention row fields: tail, type, ground window, status `Tag`, staff fill. Drop columns at 1280px rather than scroll sideways. |
| CT-06 | P0 | Status values: Draft, Published, In progress, On track, At risk, Delayed, Cancelled, Blocked (parts/tools/staff), Completed. |
| CT-07 | P0 | Click KPI “At risk / delayed” scrolls to Band D. Click a row opens `/planner/:id`. Open-alerts KPI routes to `/alerts`. Staff fill KPI routes to `/workforce`. |
| CT-08 | P0 | Page subtitle shows active station, window, and source sync ages (M&E, Flight Ops, HR). |
| CT-09 | P0 | Search on the attention table only (tail, flight, work order). Do not add a second horizontal slicer bar. |
| CT-10 | P1 | Capacity view can expand to a heatmap of required vs available hours by hour. |
| CT-11 | P1 | Multi-station when slicer = All stations. |
| CT-12 | P2 | Saved dashboard views per role (e.g. “Night shift HEL line”). |
| CT-13 | P2 | Optional compact timeline **below the fold**. Omit from `/` if it cannot fit the remaining canvas without horizontal pan. |

**Acceptance**

- A planner can answer “is this slice healthy?” from Band B + C in under 10 seconds.
- A planner can list every at-risk visit in the slice from Band D without opening another system.
- At 1280×800 and 1440×900 Chrome, Bands A–D are usable with vertical scroll only.
- Stale source data is visible (timestamp + source name), not silent.

---

### 8.2 Turnaround / work-package planner

**Purpose:** Turn a work package into a sequenced, constrained schedule.

| ID | Priority | Requirement |
| --- | --- | --- |
| PL-01 | P0 | Load work-package header and job cards/tasks from M&E (or file/API stub in MVP). |
| PL-02 | P0 | Show task table: id, title, estimated duration, required skills/certs, zone/area, parts flag, tools flag, status, assignees. |
| PL-03 | P0 | Timeline/Gantt of tasks inside the ground-time window. |
| PL-04 | P0 | Drag-and-drop to change task start, order, and assignment. |
| PL-05 | P0 | Critical path highlighted; overrun past STD/release shown as a hard conflict. |
| PL-06 | P0 | Constraint chips on the canvas: ground time, shift end, qualification miss, double-booked person, missing parts/tools. |
| PL-07 | P0 | Generate schedule action produces a draft sequence + assignment. |
| PL-08 | P0 | User can edit the draft at work-order or task level (sequence, timing, duration, people). |
| PL-09 | P0 | Split, defer, mark N/A, and add ad-hoc task (ad-hoc flagged as local, not AMP). |
| PL-10 | P1 | Parts and tools readiness check before publish. |
| PL-11 | P0 | Conflict list with jump-to-task. Cannot publish while P0 conflicts remain (configurable). |
| PL-12 | P0 | Plan states: Draft → Ready → Published → Locked (shift started) → Completed. |
| PL-13 | P1 | Version history and diff between published versions. |
| PL-14 | P1 | Comments / notes on visit and task. |
| PL-15 | P1 | “Improve work instructions” panel to split or enrich cards (AI or rules). |
| PL-16 | P2 | Apply to multi-day base visit (more tasks, more crews) using the same canvas. |

**Acceptance**

- Given a 12-task transit check and 4 qualified technicians, Generate produces a plan that fits the ground window or explains why it cannot.
- An override that breaks a license rule is blocked or requires an explicit documented override role.

---

### 8.3 Workforce assignment board

**Purpose:** Allocate people, not only tasks.

| ID | Priority | Requirement |
| --- | --- | --- |
| WF-01 | P0 | Roster for the selected window: on shift, off, absent, already assigned. |
| WF-02 | P0 | Filter/filter chips: station, team, aircraft type rating, license, skill, availability. |
| WF-03 | P0 | Per-person workload bar (assigned hours, task count, travel/bay changes). |
| WF-04 | P0 | Assign by drag-and-drop or pick-list from task. |
| WF-05 | P0 | Auto-allocate + balance workload actions. |
| WF-06 | P0 | Warn on rest, max hours, overtime, and qualification mismatch. |
| WF-07 | P1 | Team-lead view: my crew, who works with whom on each tail. |
| WF-08 | P1 | Shift editor: create/edit shifts, roles, coverage minimums. |
| WF-09 | P2 | Fairness hints (same people always getting the heavy checks). |

**Acceptance**

- Filtering to “A320 + B1 + on shift now” returns only matching people.
- Double-booking the same technician on overlapping tasks is visible before publish.

---

### 8.4 Disruption and alerts

**Purpose:** Replanning is a product feature, not a chat message.

| ID | Priority | Requirement |
| --- | --- | --- |
| AL-01 | P0 | Alert types: delayed / diverted / cancelled flight, ground-time shrink, sick call / absence, missing part, missing tool, task overrun, integration failure. |
| AL-02 | P0 | Alert is tied to affected turnaround(s) and people. |
| AL-03 | P0 | Inbox: unread, acknowledged, resolved. |
| AL-04 | P0 | One-click Replan creates a new draft under current constraints. |
| AL-05 | P0 | Before/after comparison: tasks moved, people changed, risk to release. |
| AL-06 | P0 | Accept / reject / edit proposal, then publish. |
| AL-07 | P1 | Auto-notify assigned technicians when a published plan changes. |
| AL-08 | P1 | Configurable severity and routing (station lead vs planner). |
| AL-09 | P2 | Batch replan for a bank of delayed arrivals. |

**Acceptance**

- A 40-minute inbound delay generates an alert, a replan proposal, and a publish path without leaving the product.
- Technicians see the new task list after publish, not the old one.

---

### 8.5 Execution and progress

**Purpose:** The plan is only useful if the floor can run it.

| ID | Priority | Requirement |
| --- | --- | --- |
| EX-01 | P0 | Visit progress: % complete, tasks done/remaining, ETA vs remaining ground time. |
| EX-02 | P0 | Task states: Not started, Started, Paused, Blocked (reason), Done. |
| EX-03 | P0 | Time capture: start/stop or actual duration. |
| EX-04 | P1 | Station floor view of all live visits. |
| EX-05 | P1 | Bottleneck task highlighted (holding RTS). |
| EX-06 | P1 | Efficiency view: planned vs actual by team and person. |
| EX-07 | P2 | Suggest training when actuals consistently miss estimate on a task type. |

**Acceptance**

- Supervisor can answer “will this tail make STD?” from the floor view without calling the bay.

---

### 8.6 Technician mobile / tablet

**Purpose:** Personal schedule that survives the apron.

| ID | Priority | Requirement |
| --- | --- | --- |
| MB-01 | P0 | My shift: time-ordered tasks with tail, stand/bay, window, teammates. |
| MB-02 | P0 | Task detail: title, instructions/summary, zone, estimate, status actions. |
| MB-03 | P0 | Start / complete / blocked (pick reason). |
| MB-04 | P0 | Push notification when assignment changes. |
| MB-05 | P0 | Team roster for the current job. |
| MB-06 | P1 | Visit-level on-track / late indicator. |
| MB-07 | P0 | Usable with one thumb; large tap targets; readable in bright light. |
| MB-08 | P0 | Offline queue: status changes sync when connectivity returns. Conflict policy: server published plan wins for assignments; local completion timestamps are kept. |
| MB-09 | P2 | Optional barcode/NFC hook for tail or tool confirmation. |

**Acceptance**

- A technician can find the next task and mark it started in under 5 seconds after unlock.
- After a replan, the old task is no longer presented as current.

---

### 8.7 Mid-term horizon

| ID | Priority | Requirement |
| --- | --- | --- |
| HZ-01 | P1 | Calendar of known work packages 14–90 days out. |
| HZ-02 | P1 | Demand vs qualified capacity by day and station. |
| HZ-03 | P1 | Alert when a future visit is unstaffable under current roster rules. |
| HZ-04 | P2 | Simple what-if: remove a shift, add a check, change ground time. |

---

### 8.8 AI / optimisation surfaces

The optimiser can start rule-based. The UI must not assume a black box.

| ID | Priority | Requirement |
| --- | --- | --- |
| AI-01 | P0 | Generate / Replan actions with a visible run state. |
| AI-02 | P0 | Explainability: why a person was or was not assigned (skill, rest, overlap, preference rule). |
| AI-03 | P1 | Impact summary: critical path minutes saved, unassigned tasks, overtime created. |
| AI-04 | P1 | Learn from actual durations to suggest estimate changes (opt-in). |
| AI-05 | P2 | Agent panel to rewrite/split job-card text for execution clarity. |
| AI-06 | P2 | Station playbooks: tunable weights (minimise delay vs minimise overtime vs keep teams stable). |

**Guardrail:** A generated plan never auto-publishes to a live shift in v1.

---

### 8.9 Reports

| ID | Priority | Requirement |
| --- | --- | --- |
| RP-01 | P1 | Planning: cycle time, % auto-assigned, replan count, conflict rate. |
| RP-02 | P1 | Operations: wrench time, delay minutes attributed to maintenance, on-time release. |
| RP-03 | P1 | People: utilisation, overtime, skill-gap list. |
| RP-04 | P1 | Export CSV and scheduled email snapshot. |
| RP-05 | P2 | Station heatmaps and trend lines. |

---

### 8.10 Admin, roles, and configuration

| ID | Priority | Requirement |
| --- | --- | --- |
| AD-01 | P0 | Stations, bays/stands, work areas. |
| AD-02 | P0 | Skill and license catalog; map to people and tasks. |
| AD-03 | P0 | Shift templates and calendars. |
| AD-04 | P0 | Business rules: rest, max duty, task concurrency, publish policy. |
| AD-05 | P0 | Roles: Admin, Planner, Supervisor, Technician, Viewer. |
| AD-06 | P0 | SSO (SAML/OIDC) and local fallback for design partners. |
| AD-07 | P1 | Field mapping UI for inbound M&E work-package fields. |
| AD-08 | P1 | Integration health dashboard (last success, error, payload sample). |
| AD-09 | P0 | Audit log: who changed plan, assignment, rule, or override. |
| AD-10 | P1 | Notification rules (push, email). |

---

## 9. Shared UI components

These are required across desktop screens:

- Carbon UI Shell: 48px `Header` + 256px vertical `SideNav` (see `layouts/00-ui-shell.md`)
- Theme `g90` with IBM Blue 60 interactive tokens
- Vertical slicer menus + applied `Tag`s (not a horizontal filter bar)
- Source-sync badges (M&E / Flight Ops / HR / Tools) with age
- Constraint violation toasts and inline chips
- Compact `DataTable` that sheds columns before introducing horizontal scroll
- Status via Carbon `Tag` + support tokens
- Gantt only on planner detail, and only if it fits the remaining canvas
- Command palette later (P2): “replan LH123”, “find free B1”

Visual direction: professional Carbon operations console (`g90`), vertical IA, bird’s-eye landing dashboard. Technician mobile may use high-contrast light or auto.

---

## 10. Domain objects (minimum model)

| Object | Key fields |
| --- | --- |
| Station | code, timezone, areas/bays |
| Aircraft / tail | type, operator |
| Flight / ground window | STA, STD, stand, status |
| Work package | source id, type, tasks |
| Task | estimate, skills, zone, parts/tools flags, actuals |
| Person | skills, licenses, home station |
| Shift / absence | start, end, type |
| Assignment | person, task, planned start/end |
| Plan version | state, author, timestamp |
| Alert | type, entity, severity, state |
| Constraint violation | code, blocking vs warning |
| Slicer state | station, window, fleet[], shift, status[] |

---

## 11. Integrations

| System | Direction | MVP need |
| --- | --- | --- |
| M&E (AMOS, AMOS-like, TRAX, AMES, etc.) | In: work packages, tasks, closures. Out: progress optional | P0 inbound |
| Flight Ops / OCC | In: flights, delays, stands, cancellations | P0 |
| HR / roster | In: people, skills, shifts, absences | P0 |
| Tooling (optional) | In: tool/kit readiness | P1 |
| IdP | Auth | P0 |
| Push gateway | Mobile notifications | P0 |

v1 architecture: adapter per source, normalised into Assignment’s model. Do not require the customer to abandon their M&E.

Failure behaviour: show last good data + banner; do not wipe the working plan.

---

## 12. Non-functional requirements

| Area | Requirement |
| --- | --- |
| Viewport | Desktop chrome and landing dashboard usable in Chrome at 1440×900 and 1280×800 (100% zoom) with **no horizontal page scroll**. |
| Performance | Control tower dashboard and attention list of 200 turnarounds load in <2s after first paint; drag on Gantt (planner only) stays at 60fps on a MacBook. |
| Freshness | Flight delay visible in UI within 60 seconds of source update (or source poll interval, whichever is greater). |
| Availability | 99.9% for planning hours at customer stations. |
| Offline | Mobile queues status changes; desktop does not claim offline editing of published plans. |
| Security | Encryption in transit and at rest; RBAC; audit; customer-region data residency option. |
| Compliance | Treat maintenance records as sensitive operational data. Assignment is not the official technical log unless a later phase says so. |
| Accessibility | WCAG 2.2 AA on desktop forms; mobile targets ≥44px. |
| i18n | English first; datetime always in station local with UTC on hover. |
| Audit | Immutable log of publishes, overrides, and rule changes. |

---

## 13. Release plan

### Phase 0 — Design partner slice (6–8 weeks)

- One station, one fleet family
- Carbon g90 vertical shell + slicer menus
- Control tower landing dashboard (KPIs, two charts, attention list)
- Manual assign + publish
- Technician list (web responsive acceptable)
- Simulated Flight Ops + M&E feeds
- Verified in Chrome at 1440×900 and 1280×800

### Phase 1 — MVP

- Real integrations (one M&E, one Flight Ops, one roster)
- Gantt sequencing + conflict engine
- Generate schedule (rules / optimiser, not necessarily LLM)
- Alerts + single-visit replan
- Native-quality mobile PWA or iOS/Android
- Audit + roles

### Phase 2 — v1

- Before/after replan compare
- Capacity heatmap and 14-day horizon
- Parts/tools check
- Reports
- Version history

### Phase 3 — v1.2 differentiators

- Agentic instruction enrichment
- Actuals learning
- Multi-station control tower
- Base-maintenance long-visit mode
- What-if scenarios

---

## 14. Risks

| Risk | Mitigation |
| --- | --- |
| M&E work-card quality is poor (huge cards, no skills) | Instruction-enrichment + customer mapping workshop; do not pretend dirty data is fine |
| Unions / works councils reject digital allocation | Fairness reports, transparent rules, human publish step |
| Optimiser not trusted | Explanations and easy override; start with rules |
| Apron connectivity | Offline mobile queue |
| Scope creep into full M&E | Hard non-goal; deep links out to source system |
| Latency of flight data | SLA with OCC integration; banner when feed is late |

---

## 15. Analytics to instrument

- Funnel: open tower → open visit → generate → edit → publish
- Time-to-publish, edits per generated plan
- Alert-to-replan-to-publish time
- Mobile task completion rate and time-to-start
- Conflict overrides by type
- Integration freshness and error rate

---

## 16. Open questions

1. Is Assignment allowed to write task status back into M&E in v1, or display-only?
2. Which license model is authoritative (EASA Part-66 ratings vs customer custom skills)?
3. Can a supervisor publish a replan without planner approval during live ops?
4. Single airline tenant vs MRO serving many operators in one station view?
5. Must mobile work fully offline for an entire shift?
6. Official time source: Flight Ops STD, local station clock, or M&E?

---

## 17. Launch checklist (EIS)

- [ ] One production station live
- [ ] SSO and role mapping signed off
- [ ] M&E + Flight Ops + roster feeds green for 7 consecutive days
- [ ] Planner training (90 minutes) and technician 10-minute card
- [ ] Fallback SOP if Assignment is down (how they revert to M&E + radio)
- [ ] Success baseline measured for 2 weeks pre-go-live

---

## 18. Appendix A — Screen list for design

1. Login / SSO
2. App shell (Header + vertical SideNav + slicers) — `layouts/00-ui-shell.md`
3. Control tower landing dashboard (KPIs, analysis, attention list)
4. Turnaround side panel
5. Turnaround planner (Gantt + task table)
6. Generate / replan results + explanation
7. Workforce board
8. Shift editor
9. Alert inbox
10. Replan comparison
11. Station floor / execution
12. Horizon / capacity
13. Reports
14. Admin: stations, skills, rules, users, integrations
15. Mobile: my shift
16. Mobile: task
17. Mobile: blocked reason
18. Mobile: team

## 19. Appendix B — MVP user stories (selected)

- As a planner, I can open the app on my MacBook in Chrome and see shift health (volume, risk, fill, alerts) without scrolling sideways.
- As a planner, I can change Station or Time window from the left slicer menu and watch the dashboard KPIs and attention list update.
- As a planner, I can see all of today’s turnarounds at my station with risk badges so I know where to intervene first.
- As a planner, I can generate a staffed sequence for a work package and then change two assignments before publish.
- As a planner, when a flight is delayed I can replan that visit and see who lost or gained tasks.
- As a supervisor, I can see my crew’s current tails and who is blocked.
- As a technician, I can open my phone and see the next aircraft, stand, and task without calling the lead.
- As an admin, I can map an M&E skill code to an Assignment skill and block publish when that skill is missing.

---

*End of PRD v1.1*
