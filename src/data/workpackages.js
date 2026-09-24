import { now, turnarounds } from './mock.js';

const SHORT = [
  ['Visual walkaround', 25, 'structures', 'B1', 'External', false, false],
  ['Service engine oil', 30, 'engine', 'B1', 'Engine', true, true],
  ['Cabin security check', 20, 'cabin', 'A', 'Cabin', false, false],
  ['Avionics bite test', 35, 'avionics', 'B1', 'Avionics', false, true],
];

const TRANSIT = [
  ['Open access panels', 25, 'structures', 'B1', 'Cabin', false, true],
  ['Visual walkaround', 30, 'structures', 'B1', 'External', false, false],
  ['Service engine oil', 20, 'engine', 'B1', 'Engine', true, true],
  ['Inspect fan blades', 35, 'engine', 'B1', 'Engine', false, true],
  ['Cabin emergency equipment', 25, 'cabin', 'A', 'Cabin', false, false],
  ['Lavatory and water service', 30, 'cabin', 'A', 'Cabin', true, false],
  ['Avionics bite test', 40, 'avionics', 'B1', 'Avionics', false, true],
  ['Landing gear inspection', 20, 'structures', 'B1', 'Gear', false, true],
  ['Brake wear check', 25, 'structures', 'B1', 'Gear', true, true],
  ['Close access panels', 30, 'structures', 'B1', 'Cabin', false, true],
  ['Independent inspection', 20, 'structures', 'B1', 'External', false, false],
  ['Release paperwork', 35, 'cabin', 'B1', 'Cockpit', false, false],
];

function inNext12Hours(visit) {
  const start = new Date(visit.windowStart).getTime();
  const end = new Date(visit.windowEnd).getTime();
  return start < now.getTime() + 12 * 3600000 && end > now.getTime();
}

function card(visit, index, spec, extras = {}) {
  const [title, durationMin, skill, cert, zone, needsParts, needsTools] = spec;
  return {
    id: `${visit.id}-t${index + 1}`,
    visitId: visit.id,
    title,
    durationMin,
    skill,
    cert,
    zone,
    needsParts,
    needsTools,
    partsReady: extras.partsReady ?? !needsParts,
    toolsReady: extras.toolsReady ?? true,
    status: 'pending',
    assignees: [],
    startMin: null,
    order: index,
    adHoc: false,
    source: 'AMP',
    critical: false,
    notes: '',
  };
}

function packageFor(visit) {
  const hero = visit.tail === 'OH-LWP' && inNext12Hours(visit);
  const blocked = visit.tail === 'D-AIGX' && inNext12Hours(visit);
  if (hero) return TRANSIT.map((spec, index) => card(visit, index, spec, { partsReady: true, toolsReady: true }));
  const tasks = SHORT.map((spec, index) => card(visit, index, spec, {
    partsReady: visit.status !== 'Blocked',
  }));
  if (blocked) {
    tasks.push(card(visit, tasks.length, ['Structural repair', 360, 'structures', 'B1', 'Fuselage', true, true], {
      partsReady: false,
      toolsReady: false,
    }));
  }
  return tasks;
}

export function buildTasksByVisit() {
  const tasksByVisit = {};
  for (const visit of turnarounds) tasksByVisit[visit.id] = packageFor(visit);
  const sample = turnarounds.find((visit) => visit.station === 'HEL' && visit.tail === 'OH-LXK' && inNext12Hours(visit));
  if (sample && tasksByVisit[sample.id]?.length >= 2) {
    const [first, second] = tasksByVisit[sample.id];
    const personId = `HEL-${sample.shift}-0`;
    first.startMin = 0;
    first.durationMin = 40;
    first.assignees = [personId];
    first.status = 'scheduled';
    second.startMin = 15;
    second.durationMin = 40;
    second.assignees = [personId];
    second.status = 'scheduled';
  }
  return tasksByVisit;
}

export function emptyPlan() {
  return {
    state: 'Draft',
    blockOnConflicts: true,
    licenseOverride: '',
    publishOverride: '',
    visitNotes: '',
    versions: [],
    lastGenerateOk: null,
    lastGenerateReason: '',
  };
}
