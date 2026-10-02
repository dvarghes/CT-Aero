import { useState } from 'react';
import { Button, Select, SelectItem, Tag, TextInput, Tile } from '@carbon/react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.jsx';
import { useOperation } from '../data/OperationContext.jsx';
import { personName } from '../data/roster.js';
import { useSlice } from '../hooks/useSlice.js';
import { diffSnapshots, windowMinutes } from '../plan/engine.js';
import { usePlan } from '../plan/PlanContext.jsx';
import { useSlicerHref } from '../slicers/SlicerContext.jsx';

const STATE_FILTERS = [
  ['unread', 'Unread'],
  ['acknowledged', 'Acknowledged'],
  ['resolved', 'Resolved'],
];

function names(people, ids) {
  if (!ids?.length) return 'No people named';
  return ids.map((id) => personName(people, id)).join(', ');
}

function comparison(before, after, people) {
  const lines = diffSnapshots(before, after);
  const peopleLines = [];
  for (const task of after || []) {
    const prior = (before || []).find((item) => item.id === task.id);
    if (!prior) continue;
    const previous = prior.assignees.join(',');
    const next = task.assignees.join(',');
    if (previous === next) continue;
    peopleLines.push(`${task.title}: ${names(people, prior.assignees)} → ${names(people, task.assignees)}.`);
  }
  return [...lines, ...peopleLines];
}

function releaseLine(visit, proposal) {
  if (!proposal) return '';
  if (!proposal.ok) return proposal.reason;
  const windowMin = windowMinutes(visit);
  const end = (proposal.after || [])
    .filter((task) => task.startMin != null && task.status !== 'na' && task.status !== 'deferred')
    .reduce((max, task) => Math.max(max, task.startMin + task.durationMin), 0);
  if (end > windowMin) return `Release is missed by ${end - windowMin} min.`;
  return `Release holds. Work finishes at minute ${end} of a ${windowMin} minute window.`;
}

export function AlertsPage() {
  const operation = useOperation();
  const slice = useSlice();
  const plan = usePlan();
  const toHref = useSlicerHref();
  const [states, setStates] = useState(['unread', 'acknowledged']);
  const [selectedId, setSelectedId] = useState('');
  const [visitId, setVisitId] = useState('');
  const [minutes, setMinutes] = useState('40');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const alerts = slice.alerts.filter((alert) => states.includes(alert.state));
  const selected = slice.alerts.find((alert) => alert.id === selectedId) || alerts[0] || null;
  const visit = selected ? plan.visitsById.get(selected.turnaroundId) : null;
  const delayVisit = visitId || slice.current[0]?.id || '';

  async function run(path, body) {
    setError('');
    setPending(true);
    try {
      await operation.mutate(path, body);
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  }

  const proposal = selected?.proposal;
  const lines = proposal ? comparison(proposal.before, proposal.after, operation.people) : [];
  const blocking = selected ? plan.blocking(selected.turnaroundId) : [];
  const planState = selected ? plan.plans[selected.turnaroundId]?.state : '';

  return (
    <div className="tower">
      <PageHeader
        title="Alerts"
        subtitle={`${slice.alerts.filter((alert) => alert.unread).length} unread of ${slice.alerts.length} in this slice.`}
      />
      {error ? <p className="plan-alert" role="alert">{error}</p> : null}
      <section className="plan-card" aria-label="Record an inbound delay">
        <h2 className="section-title">Inbound delay</h2>
        <p className="module-note">A delay shortens the ground window and opens a replan. 40 minutes is the line-maintenance case.</p>
        <div className="plan-actions">
          <Select id="delay-visit" labelText="Turnaround" size="sm" value={delayVisit} onChange={(event) => setVisitId(event.target.value)}>
            {slice.current.map((item) => (
              <SelectItem key={item.id} value={item.id} text={`${item.tail} · ${item.flight} · ${item.station}`} />
            ))}
          </Select>
          <TextInput id="delay-minutes" labelText="Minutes" size="sm" type="number" value={minutes} onChange={(event) => setMinutes(event.target.value)} />
          <Button size="sm" kind="primary" disabled={pending || !delayVisit} onClick={() => run('/api/alerts/delay', { visitId: delayVisit, minutes: Number(minutes) })}>
            Record delay
          </Button>
        </div>
      </section>

      <div className="chip-row" aria-label="Alert state">
        {STATE_FILTERS.map(([value, label]) => (
          <Button
            key={value}
            size="sm"
            kind={states.includes(value) ? 'primary' : 'ghost'}
            onClick={() => setStates((current) => (
              current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
            ))}
          >
            {label}
          </Button>
        ))}
      </div>

      <div className="ops-layout">
        <div className="ops-list" role="list">
          {alerts.length === 0 ? <p className="module-note">No alerts in this view.</p> : alerts.map((alert) => {
            const rowVisit = plan.visitsById.get(alert.turnaroundId);
            return (
              <Button
                key={alert.id}
                size="sm"
                kind={selected?.id === alert.id ? 'secondary' : 'ghost'}
                onClick={() => setSelectedId(alert.id)}
              >
                {rowVisit?.tail || alert.turnaroundId} · {alert.type} · {alert.state}
              </Button>
            );
          })}
        </div>

        {selected ? (
          <Tile className="floor-card">
            <h2 className="section-title">{visit ? `${visit.tail} · ${visit.flight}` : selected.turnaroundId}</h2>
            <p className="cell-meta">{selected.type} · {selected.severity} · {selected.state}</p>
            <p>{selected.detail}</p>
            <p className="cell-meta">People: {names(operation.people, selected.people)}</p>
            <div className="plan-actions">
              <Button size="sm" kind="secondary" disabled={pending || selected.state === 'acknowledged'} onClick={() => run('/api/alerts/state', { alertId: selected.id, state: 'acknowledged' })}>Acknowledge</Button>
              <Button size="sm" kind="ghost" disabled={pending || selected.state === 'resolved'} onClick={() => run('/api/alerts/state', { alertId: selected.id, state: 'resolved' })}>Resolve</Button>
              <Select id="alert-severity" labelText="Severity" size="sm" value={selected.severity} onChange={(event) => run('/api/alerts/severity', { alertId: selected.id, severity: event.target.value })}>
                <SelectItem value="low" text="Low" />
                <SelectItem value="medium" text="Medium" />
                <SelectItem value="high" text="High" />
              </Select>
            </div>
            <div className="plan-actions">
              <Button size="sm" kind="primary" disabled={pending} onClick={() => run('/api/alerts/replan', { alertId: selected.id })}>Replan</Button>
              <Button size="sm" kind="secondary" disabled={pending || !proposal?.ok} onClick={() => run('/api/alerts/accept', { alertId: selected.id })}>Accept proposal</Button>
              <Button size="sm" kind="ghost" disabled={pending || !proposal} onClick={() => run('/api/alerts/reject', { alertId: selected.id })}>Reject</Button>
              <Button size="sm" kind="primary" disabled={pending || planState !== 'Ready'} onClick={() => run('/api/plans/publish', { visitId: selected.turnaroundId })}>Publish</Button>
              {visit ? <Link className="cds--link" to={toHref(`/planner/${visit.id}`)}>Edit in planner</Link> : null}
            </div>
            {proposal ? (
              <>
                <p className={proposal.ok ? 'module-note' : 'plan-alert'}>{releaseLine(visit, proposal)}</p>
                <p className="cell-meta">Plan is {planState || 'Draft'}{proposal.accepted ? ' · proposal accepted' : ''}.</p>
                {lines.length === 0 ? <p className="module-note">The proposal does not move any tasks.</p> : (
                  <ul className="conflict-list">
                    {lines.map((line) => <li key={line}>{line}</li>)}
                  </ul>
                )}
              </>
            ) : <p className="module-note">Replan builds a draft under the current window. The working plan stays put until you accept it.</p>}
            {blocking.length > 0 ? (
              <ul className="conflict-list">
                {blocking.map((conflict) => <li key={conflict.id}>{conflict.severity} · {conflict.text}</li>)}
              </ul>
            ) : null}
            <Tag size="sm" type={selected.severity === 'high' ? 'red' : 'gray'}>{selected.severity}</Tag>
          </Tile>
        ) : <p className="module-note">Select an alert to replan it.</p>}
      </div>
    </div>
  );
}
