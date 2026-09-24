import { useMemo, useState } from 'react';
import { Button, ProgressBar, Select, SelectItem, Tag, TextInput, Tile } from '@carbon/react';
import { PageHeader } from '../components/PageHeader.jsx';
import { personName } from '../data/roster.js';
import { useSlice } from '../hooks/useSlice.js';
import { coverageGap, doubleBookedPeople, fairnessHints, filterRoster, personLoad } from '../plan/engine.js';
import { usePlan } from '../plan/PlanContext.jsx';
import { useSlicers } from '../slicers/SlicerContext.jsx';

const RATINGS = ['A320 family', 'A330', 'B737'];
const LICENSES = ['B1', 'B2', 'A'];
const SKILLS = ['structures', 'engine', 'cabin', 'avionics'];
const TEAMS = ['Line 1', 'Line 2'];
const AVAILABILITY = [
  ['on shift', 'On shift'],
  ['off', 'Off'],
  ['absent', 'Absent'],
  ['assigned', 'Already assigned'],
];

function toggle(list, value) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function WorkforcePage() {
  const { slicers } = useSlicers();
  const slice = useSlice();
  const plan = usePlan();
  const [ratings, setRatings] = useState([]);
  const [licenses, setLicenses] = useState([]);
  const [skills, setSkills] = useState([]);
  const [teams, setTeams] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [leadId, setLeadId] = useState('');

  const loadById = useMemo(() => {
    const map = new Map();
    for (const person of plan.people) map.set(person.id, personLoad(person, plan.tasksByVisit, plan.visitsById));
    return map;
  }, [plan.people, plan.tasksByVisit, plan.visitsById]);

  const roster = useMemo(() => {
    const lead = plan.people.find((person) => person.id === leadId);
    return filterRoster(plan.people, {
      station: slicers.station,
      shift: slicers.shift,
      ratings: [...ratings, ...slicers.fleet],
      licenses,
      skills,
      teams: lead ? [lead.team] : teams,
      availability,
    }, loadById).filter((person) => (lead ? person.station === lead.station : true));
  }, [plan.people, slicers, ratings, licenses, skills, teams, availability, leadId, loadById]);

  const hints = useMemo(() => fairnessHints(plan.people, plan.tasksByVisit), [plan.people, plan.tasksByVisit]);
  const clashes = useMemo(() => doubleBookedPeople(plan.tasksByVisit, plan.visitsById), [plan.tasksByVisit, plan.visitsById]);
  const coverage = useMemo(() => coverageGap(plan.shifts, plan.people, slicers.station), [plan.shifts, plan.people, slicers.station]);
  const visitIds = slice.current.map((visit) => visit.id);
  const tasks = slice.current.flatMap((visit) => (plan.tasksByVisit[visit.id] ?? []).map((task) => ({ ...task, visit })));

  const byTail = new Map();
  if (leadId) {
    for (const task of tasks) {
      if (!task.assignees.some((personId) => roster.some((person) => person.id === personId))) continue;
      const key = `${task.visit.tail} · ${task.visit.station}`;
      if (!byTail.has(key)) byTail.set(key, []);
      byTail.get(key).push(task);
    }
  }

  return (
    <div className="tower">
      <PageHeader title="Workforce" subtitle={`${roster.length} people in this roster.`} />
      <div className="plan-actions">
        <Button size="sm" kind="primary" onClick={() => plan.allocateSlice(visitIds)}>Auto-allocate</Button>
        <Button size="sm" kind="secondary" onClick={() => plan.balanceSlice(visitIds)}>Balance workload</Button>
      </div>
      <div className="chip-row" aria-label="Roster filters">
        {RATINGS.map((value) => (
          <Button key={value} size="sm" kind={ratings.includes(value) ? 'primary' : 'ghost'} onClick={() => setRatings((current) => toggle(current, value))}>{value}</Button>
        ))}
        {LICENSES.map((value) => (
          <Button key={value} size="sm" kind={licenses.includes(value) ? 'primary' : 'ghost'} onClick={() => setLicenses((current) => toggle(current, value))}>{value}</Button>
        ))}
        {SKILLS.map((value) => (
          <Button key={value} size="sm" kind={skills.includes(value) ? 'primary' : 'ghost'} onClick={() => setSkills((current) => toggle(current, value))}>{value}</Button>
        ))}
        {TEAMS.map((value) => (
          <Button key={value} size="sm" kind={teams.includes(value) ? 'primary' : 'ghost'} onClick={() => setTeams((current) => toggle(current, value))}>{value}</Button>
        ))}
        {AVAILABILITY.map(([value, label]) => (
          <Button key={value} size="sm" kind={availability.includes(value) ? 'primary' : 'ghost'} onClick={() => setAvailability((current) => toggle(current, value))}>{label}</Button>
        ))}
      </div>
      <div className="roster-grid">
        {roster.map((person) => {
          const load = loadById.get(person.id);
          const hint = hints.find((item) => item.personId === person.id);
          return (
            <article
              key={person.id}
              className="person-card"
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData('text/person', person.id);
                event.dataTransfer.effectAllowed = 'copy';
              }}
            >
              <h2 className="person-name">{person.name}</h2>
              <p className="cell-meta">{person.team} · {person.shift} · {person.availability}</p>
              <p className="cell-meta">{person.ratings.join(', ')} · {person.licenses.join('/')}</p>
              <ProgressBar
                label={`${load.hours}h`}
                value={Math.min(100, Math.round((load.hours / person.maxHours) * 100))}
                max={100}
                size="small"
                status="active"
                type="inline"
              />
              <p className="cell-meta">{load.count} tasks · {load.bayChanges} bay change{load.bayChanges === 1 ? '' : 's'}</p>
              {load.warnings.map((warning) => <Tag key={warning} size="sm" type="magenta">{warning}</Tag>)}
              {clashes.get(person.id) ? <Tag size="sm" type="red">{clashes.get(person.id)}</Tag> : null}
              {hint ? <Tag size="sm" type="purple">{hint.text}</Tag> : null}
            </article>
          );
        })}
      </div>

      <section aria-labelledby="assign-heading">
        <h2 id="assign-heading" className="section-title">Assignments in this slice</h2>
        <p className="module-note">Drop a person onto a task. Overlapping assignments stay visible as double-bookings.</p>
        <ul className="assign-list">
          {tasks.filter((task) => task.status !== 'na' && task.status !== 'deferred').map((task) => (
            <li
              key={task.id}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const personId = event.dataTransfer.getData('text/person');
                if (personId) plan.assign(task.visit.id, task.id, personId);
              }}
            >
              <span>{task.visit.tail} · {task.title}</span>
              <span className="cell-meta">{task.assignees.map((personId) => personName(plan.people, personId)).join(', ') || 'Unassigned'}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="lead-heading">
        <h2 id="lead-heading" className="section-title">Team lead</h2>
        <Select id="team-lead" labelText="Show my crew" value={leadId} onChange={(event) => setLeadId(event.target.value)}>
          <SelectItem value="" text="All crews" />
          {plan.people.filter((person) => slicers.station === 'All stations' || person.station === slicers.station).map((person) => (
            <SelectItem key={person.id} value={person.id} text={`${person.name} · ${person.team}`} />
          ))}
        </Select>
        {[...byTail.entries()].map(([tail, tailTasks]) => (
          <Tile key={tail} className="plan-card">
            <h3 className="section-title">{tail}</h3>
            <ul className="conflict-list">
              {tailTasks.map((task) => (
                <li key={task.id}>{task.title} · {task.assignees.map((personId) => personName(plan.people, personId)).join(', ') || 'Unassigned'}</li>
              ))}
            </ul>
          </Tile>
        ))}
      </section>

      <section aria-labelledby="shift-heading">
        <h2 id="shift-heading" className="section-title">Shifts and coverage</h2>
        <div className="shift-grid">
          {coverage.map((shift) => (
            <Tile key={shift.id}>
              <h3 className="section-title">{shift.id}</h3>
              <p className={shift.short ? 'plan-alert' : 'module-note'}>
                {shift.count} on shift with {shift.role}. Minimum {shift.minimum}.
              </p>
              <TextInput id={`${shift.id}-start`} labelText="Start" size="sm" value={shift.start} onChange={(event) => plan.updateShift(shift.id, { start: event.target.value })} />
              <TextInput id={`${shift.id}-end`} labelText="End" size="sm" value={shift.end} onChange={(event) => plan.updateShift(shift.id, { end: event.target.value })} />
              <TextInput id={`${shift.id}-role`} labelText="Role" size="sm" value={shift.role} onChange={(event) => plan.updateShift(shift.id, { role: event.target.value })} />
              <TextInput id={`${shift.id}-min`} labelText="Coverage minimum" size="sm" type="number" value={String(shift.minimum)} onChange={(event) => plan.updateShift(shift.id, { minimum: Number(event.target.value) })} />
            </Tile>
          ))}
        </div>
      </section>
    </div>
  );
}
