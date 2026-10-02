import { useState } from 'react';
import { Button, ProgressBar, Select, SelectItem, Tag, Tile } from '@carbon/react';
import { PageHeader } from '../components/PageHeader.jsx';
import { useOperation } from '../data/OperationContext.jsx';
import { personName } from '../data/roster.js';
import { useSlice } from '../hooks/useSlice.js';

const STATES = [
  ['not_started', 'Not started'],
  ['started', 'Started'],
  ['paused', 'Paused'],
  ['blocked', 'Blocked'],
  ['done', 'Done'],
];
const BLOCK_REASONS = ['Missing part', 'Missing tool', 'No access', 'Waiting on crew'];

function emptyExecution() {
  return { state: 'not_started', blockedReason: '', actualStart: null, actualEnd: null, actualDurationMin: null };
}

function floorTasks(visitId, operation) {
  const plan = operation.plans[visitId];
  const working = operation.tasksByVisit[visitId] || [];
  const live = new Map(working.map((task) => [task.id, task]));
  let planned = working;
  if (plan && plan.state !== 'Published' && plan.state !== 'Locked' && plan.state !== 'Completed') {
    const published = [...(plan.versions || [])].reverse().find((version) => Array.isArray(version.tasks) && version.tasks.length);
    if (published) planned = published.tasks;
  }
  return planned
    .filter((task) => task.status !== 'na')
    .map((task) => {
      const current = live.get(task.id);
      return { ...task, execution: current?.execution || task.execution || emptyExecution() };
    });
}

function counted(tasks) {
  return tasks.filter((task) => task.status !== 'deferred');
}

function clock(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
}

function releaseSentence(visit, tasks) {
  const open = counted(tasks);
  const done = open.filter((task) => task.execution.state === 'done').length;
  const remaining = open
    .filter((task) => task.execution.state !== 'done')
    .reduce((total, task) => total + task.durationMin, 0);
  const left = Math.round((new Date(visit.windowEnd) - Date.now()) / 60000);
  const makes = remaining <= Math.max(0, left);
  const text = makes
    ? `${visit.tail} makes STD. ${remaining} min of work remains and ${Math.max(0, left)} min of ground time is left.`
    : `${visit.tail} misses STD by ${remaining - Math.max(0, left)} min. ${remaining} min of work remains and ${Math.max(0, left)} min of ground time is left.`;
  return { done, total: open.length, remaining, makes, text };
}

export function ExecutionPage() {
  const operation = useOperation();
  const slice = useSlice();
  const [reasons, setReasons] = useState({});
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function setState(taskId, state, blockedReason) {
    setError('');
    setPending(true);
    try {
      await operation.mutate('/api/execution', { taskId, state, blockedReason });
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  }

  const cards = slice.current.map((visit) => {
    const tasks = floorTasks(visit.id, operation);
    return { visit, tasks, release: releaseSentence(visit, tasks) };
  });

  const efficiency = new Map();
  for (const card of cards) {
    for (const task of card.tasks) {
      if (task.execution.state !== 'done' || task.execution.actualDurationMin == null) continue;
      const personId = task.assignees[0] || 'unassigned';
      if (!efficiency.has(personId)) efficiency.set(personId, { planned: 0, actual: 0, count: 0 });
      const row = efficiency.get(personId);
      row.planned += task.durationMin;
      row.actual += task.execution.actualDurationMin;
      row.count += 1;
    }
  }

  const repeats = new Map();
  for (const card of cards) {
    for (const task of card.tasks) {
      if (task.execution.state !== 'done' || task.execution.actualDurationMin == null) continue;
      if (!repeats.has(task.title)) repeats.set(task.title, []);
      repeats.get(task.title).push(task.execution.actualDurationMin / task.durationMin);
    }
  }
  const training = [...repeats.entries()].filter(([, ratios]) => ratios.length >= 2 && ratios.every((ratio) => ratio > 1.25));

  return (
    <div className="tower">
      <PageHeader
        title="Execution"
        subtitle={`${cards.length} live visits in this slice. The floor follows the published task list once a plan is published.`}
      />
      {error ? <p className="plan-alert" role="alert">{error}</p> : null}
      <div className="roster-grid">
        {cards.map(({ visit, tasks, release }) => {
          const percent = release.total === 0 ? 0 : Math.round((release.done / release.total) * 100);
          const bottleneck = tasks
            .filter((task) => task.status !== 'deferred' && task.execution.state !== 'done')
            .sort((a, b) => b.durationMin - a.durationMin)[0];
          return (
            <Tile key={visit.id} className="floor-card">
              <h2 className="section-title">{visit.tail} · {visit.station}</h2>
              <p className="cell-meta">{visit.flight} · {visit.type} · {visit.stand || 'stand unknown'}</p>
              <p className={release.makes ? 'module-note' : 'plan-alert'}>{release.text}</p>
              <ProgressBar
                label={`${release.done} of ${release.total} done`}
                value={percent}
                max={100}
                size="small"
                status="active"
              />
              <ul className="assign-list">
                {tasks.filter((task) => task.status !== 'deferred').map((task) => (
                  <li key={task.id}>
                    <span>
                      {task.title}
                      {bottleneck?.id === task.id && !release.makes ? <Tag size="sm" type="red">Holding release</Tag> : null}
                      <span className="cell-meta">
                        {STATES.find((item) => item[0] === task.execution.state)?.[1]}
                        {' · '}
                        {task.assignees.map((id) => personName(operation.people, id)).join(', ') || 'Unassigned'}
                        {' · '}
                        {task.durationMin} min planned
                        {task.execution.actualDurationMin != null ? ` · ${task.execution.actualDurationMin} min actual` : ''}
                        {' · '}
                        {clock(task.execution.actualStart)}–{clock(task.execution.actualEnd)}
                      </span>
                    </span>
                    <span className="plan-actions">
                      {STATES.filter(([value]) => value !== 'blocked').map(([value, label]) => (
                        <Button key={value} size="sm" kind={task.execution.state === value ? 'primary' : 'ghost'} disabled={pending} onClick={() => setState(task.id, value)}>
                          {label}
                        </Button>
                      ))}
                      <Select
                        id={`block-${task.id}`}
                        labelText="Blocked reason"
                        size="sm"
                        value={reasons[task.id] || task.execution.blockedReason || BLOCK_REASONS[0]}
                        onChange={(event) => setReasons((current) => ({ ...current, [task.id]: event.target.value }))}
                      >
                        {BLOCK_REASONS.map((reason) => <SelectItem key={reason} value={reason} text={reason} />)}
                      </Select>
                      <Button
                        size="sm"
                        kind="danger"
                        disabled={pending}
                        onClick={() => setState(task.id, 'blocked', reasons[task.id] || task.execution.blockedReason || BLOCK_REASONS[0])}
                      >
                        Blocked
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            </Tile>
          );
        })}
      </div>

      <section aria-labelledby="efficiency-heading">
        <h2 id="efficiency-heading" className="section-title">Planned versus actual</h2>
        {efficiency.size === 0 ? <p className="module-note">Actual durations appear here after a task is marked done.</p> : (
          <ul className="conflict-list">
            {[...efficiency.entries()].map(([personId, row]) => (
              <li key={personId}>
                <span>{personName(operation.people, personId)}</span>
                <span className="cell-meta">{row.planned} min planned · {row.actual} min actual · {row.count} task{row.count === 1 ? '' : 's'}</span>
              </li>
            ))}
          </ul>
        )}
        {training.map(([title]) => (
          <p key={title} className="module-note">Actuals for “{title}” are running long. Review the estimate with the team.</p>
        ))}
      </section>
    </div>
  );
}
