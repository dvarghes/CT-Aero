import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Button,
  OverflowMenu,
  OverflowMenuItem,
  Tag,
  TextArea,
  TextInput,
  Tile,
} from '@carbon/react';
import { PageHeader } from '../components/PageHeader.jsx';
import { StatusTag } from '../components/StatusTag.jsx';
import { personName } from '../data/roster.js';
import { getTurnaround } from '../data/mock.js';
import { formatGroundWindow, formatHours, formatUtcRange } from '../format.js';
import { useMinWidth } from '../hooks/useMinWidth.js';
import { instructionSuggestions, windowMinutes } from '../plan/engine.js';
import { usePlan } from '../plan/PlanContext.jsx';
import { GanttBoard } from '../planner/GanttBoard.jsx';
import { useSlicers } from '../slicers/SlicerContext.jsx';

const STATES = ['Draft', 'Ready', 'Published', 'Locked', 'Completed'];
const STATE_TYPE = { Draft: 'gray', Ready: 'cyan', Published: 'green', Locked: 'purple', Completed: 'teal' };
const CHIP = {
  overrun: 'Past release',
  qualification: 'Qualification',
  shift: 'Shift end',
  'double-book': 'Double-booked',
  parts: 'Missing parts',
  tools: 'Missing tools',
};

export function PlannerPage() {
  const { id } = useParams();
  const { slicers } = useSlicers();
  const planApi = usePlan();
  const wide = useMinWidth(1440);
  const visit = getTurnaround(id);
  const [editing, setEditing] = useState(null);
  const [adHoc, setAdHoc] = useState({ title: '', durationMin: 30 });
  const [focusId, setFocusId] = useState(null);

  const tasks = planApi.tasksByVisit[id] ?? [];
  const plan = planApi.plans[id];
  const conflicts = planApi.conflicts(id);
  const blocking = plan ? planApi.blocking(id) : [];
  const suggestions = useMemo(() => instructionSuggestions(tasks), [tasks]);
  const crew = useMemo(() => {
    if (!visit) return [];
    return planApi.people.filter((person) => (
      person.station === visit.station && person.shift === visit.shift && person.availability === 'on shift'
    ));
  }, [planApi.people, visit]);

  if (!visit || !plan) {
    return (
      <div className="tower">
        <PageHeader title="Planner" subtitle="This turnaround is not in the mock data." />
      </div>
    );
  }

  const windowMin = windowMinutes(visit);
  const scheduledMinutes = tasks.filter((task) => task.startMin != null).reduce((sum, task) => sum + task.durationMin, 0);
  const versions = plan.versions ?? [];
  const diff = planApi.versionDiff(id);

  function jump(taskId) {
    setFocusId(taskId);
    document.getElementById(`task-${taskId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return (
    <div className="tower">
      <PageHeader
        title={visit.tail}
        subtitle={`${visit.station} · ${visit.type} · ${visit.flight} · ${visit.workOrder}`}
      />
      <Tile className="plan-card">
        <div className="plan-heading">
          <StatusTag status={visit.status} reason={visit.blockedReason} />
          <Tag size="sm" type={STATE_TYPE[plan.state]}>{plan.state}</Tag>
          <span className="cell-meta" title={formatUtcRange(visit.windowStart, visit.windowEnd)}>
            {formatGroundWindow(visit.windowStart, visit.windowEnd, visit.timeZone, slicers.window)}
            {' · '}{windowMin} min · {formatHours(scheduledMinutes / 60)}h scheduled
          </span>
        </div>
        <div className="state-path" aria-label="Plan states">
          {STATES.map((state) => (
            <Tag key={state} size="sm" type={state === plan.state ? STATE_TYPE[state] : 'outline'}>{state}</Tag>
          ))}
        </div>
        <div className="plan-actions">
          <Button size="sm" kind="primary" onClick={() => planApi.generate(id)}>Generate schedule</Button>
          <Button size="sm" kind="secondary" disabled={plan.state !== 'Draft' || blocking.length > 0} onClick={() => planApi.markReady(id)}>Mark ready</Button>
          <Button size="sm" kind="secondary" disabled={plan.state !== 'Ready' || blocking.length > 0} onClick={() => planApi.publish(id)}>Publish</Button>
          <Button size="sm" kind="tertiary" disabled={plan.state !== 'Published'} onClick={() => planApi.lock(id)}>Lock shift</Button>
          <Button size="sm" kind="tertiary" disabled={plan.state !== 'Locked'} onClick={() => planApi.complete(id)}>Complete</Button>
          <Button size="sm" kind={plan.blockOnConflicts ? 'danger--tertiary' : 'ghost'} onClick={() => planApi.setBlock(id, !plan.blockOnConflicts)}>
            {plan.blockOnConflicts ? 'P0 conflicts block publish' : 'Publish allowed with P0 conflicts'}
          </Button>
        </div>
        {plan.lastGenerateReason ? (
          <p className={plan.lastGenerateOk ? 'module-note' : 'plan-alert'} role="status">{plan.lastGenerateReason}</p>
        ) : null}
        {blocking.length > 0 ? (
          <p className="plan-alert">Publish stays blocked until {blocking.length} P0 conflict{blocking.length === 1 ? '' : 's'} are cleared{plan.blockOnConflicts ? '' : ' or the publish block is turned off'}.</p>
        ) : null}
        <div className="chip-row" aria-label="Constraints">
          {Object.keys(CHIP).map((type) => {
            const count = conflicts.filter((conflict) => conflict.type === type).length;
            if (count === 0) return null;
            return <Tag key={type} size="sm" type="red">{CHIP[type]} · {count}</Tag>;
          })}
          {conflicts.length === 0 ? <span className="cell-meta">No constraint chips on this canvas.</span> : null}
        </div>
        <div className="override-row">
          <TextInput
            id="license-override"
            labelText="License override reason"
            size="sm"
            value={plan.licenseOverride}
            onChange={(event) => planApi.setLicenseOverride(id, event.target.value)}
            placeholder="Required before a qualification break can publish"
          />
        </div>
      </Tile>

      <section aria-labelledby="crew-heading">
        <h2 id="crew-heading" className="section-title">On-shift crew</h2>
        <p className="module-note">Drag a person onto a task row to assign them.</p>
        <div className="crew-strip">
          {crew.map((person) => (
            <button
              key={person.id}
              type="button"
              className="crew-chip"
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData('text/person', person.id);
                event.dataTransfer.effectAllowed = 'copy';
              }}
            >
              {person.name}
              <span className="cell-meta">{person.licenses.join('/')} · {person.ratings.includes(visit.fleet) ? visit.fleet : 'no rating'}</span>
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="gantt-heading">
        <h2 id="gantt-heading" className="section-title">Ground window</h2>
        <GanttBoard
          visit={visit}
          tasks={tasks}
          people={planApi.people}
          onMove={(taskId, startMin) => planApi.move(id, taskId, startMin)}
          onReorder={(fromId, toId) => planApi.reorder(id, fromId, toId)}
          onAssign={(taskId, personId) => planApi.assign(id, taskId, personId)}
        />
      </section>

      <section aria-labelledby="tasks-heading" className={focusId ? 'task-focus' : ''}>
        <h2 id="tasks-heading" className="section-title">Tasks</h2>
        <div className="attention">
          <table className="plain-table">
            <thead>
              <tr>
                {wide ? <th>Id</th> : null}
                <th>Title</th>
                <th>Duration</th>
                {wide ? <th>Skills</th> : null}
                {wide ? <th>Zone</th> : null}
                {wide ? <th>Parts</th> : null}
                {wide ? <th>Tools</th> : null}
                <th>Status</th>
                <th>Assignees</th>
                <th><span className="cds--visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id} className={focusId === task.id ? 'is-focus' : ''}>
                  {wide ? <td>{task.source === 'local' ? 'Local' : task.id.split('-').pop()}</td> : null}
                  <td>
                    {task.title}
                    {task.adHoc || task.source === 'local' ? <div className="cell-meta">Local, not AMP</div> : null}
                  </td>
                  <td>{task.durationMin} min</td>
                  {wide ? <td>{task.cert} · {task.skill}</td> : null}
                  {wide ? <td>{task.zone}</td> : null}
                  {wide ? <td>{task.needsParts ? (task.partsReady ? 'Ready' : 'Missing') : '—'}</td> : null}
                  {wide ? <td>{task.needsTools ? (task.toolsReady ? 'Ready' : 'Missing') : '—'}</td> : null}
                  <td>{task.status}</td>
                  <td>{task.assignees.map((personId) => personName(planApi.people, personId)).join(', ') || '—'}</td>
                  <td>
                    <OverflowMenu size="sm" flipped aria-label={`Actions for ${task.title}`} iconDescription="Task actions">
                      <OverflowMenuItem itemText="Edit" onClick={() => setEditing(task)} />
                      <OverflowMenuItem itemText="Split" onClick={() => planApi.split(id, task.id)} />
                      <OverflowMenuItem itemText="Defer" onClick={() => planApi.defer(id, task.id)} />
                      <OverflowMenuItem itemText="Mark N/A" onClick={() => planApi.markNa(id, task.id)} />
                    </OverflowMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form
          className="adhoc-form"
          onSubmit={(event) => {
            event.preventDefault();
            planApi.addAdHoc(id, adHoc);
            setAdHoc({ title: '', durationMin: 30 });
          }}
        >
          <TextInput
            id="adhoc-title"
            labelText="Ad-hoc task"
            size="sm"
            value={adHoc.title}
            onChange={(event) => setAdHoc((current) => ({ ...current, title: event.target.value }))}
            placeholder="Local card, not from the AMP"
          />
          <TextInput
            id="adhoc-duration"
            labelText="Minutes"
            size="sm"
            type="number"
            value={String(adHoc.durationMin)}
            onChange={(event) => setAdHoc((current) => ({ ...current, durationMin: Number(event.target.value) }))}
          />
          <Button size="sm" kind="tertiary" type="submit">Add local task</Button>
        </form>
      </section>

      <section aria-labelledby="conflict-heading">
        <h2 id="conflict-heading" className="section-title">Conflicts</h2>
        {conflicts.length === 0 ? <p className="module-note">No conflicts.</p> : (
          <ul className="conflict-list">
            {conflicts.map((conflict) => (
              <li key={conflict.id}>
                <button type="button" className="cds--link" onClick={() => jump(conflict.taskId)}>
                  {conflict.severity} · {conflict.text}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="split-notes" aria-label="Notes, history, and instructions">
        <Tile>
          <h2 className="section-title">Visit notes</h2>
          <TextArea
            labelText="Notes"
            value={plan.visitNotes}
            onChange={(event) => planApi.setNotes(id, event.target.value)}
            rows={3}
          />
        </Tile>
        <Tile>
          <h2 className="section-title">Published versions</h2>
          {versions.length === 0 ? <p className="module-note">No published version yet.</p> : (
            <ul className="conflict-list">
              {versions.map((version) => (
                <li key={version.id}>{version.id} · {version.at}</li>
              ))}
            </ul>
          )}
          {diff.length > 0 ? (
            <ul className="conflict-list">
              {diff.map((line) => <li key={line}>{line}</li>)}
            </ul>
          ) : null}
        </Tile>
        <Tile>
          <h2 className="section-title">Work instructions</h2>
          {suggestions.length === 0 ? <p className="module-note">No split or enrichment suggestions.</p> : (
            <ul className="conflict-list">
              {suggestions.map((item) => (
                <li key={`${item.kind}-${item.taskId}`}>
                  <span>{item.text}</span>
                  <Button
                    size="sm"
                    kind="ghost"
                    onClick={() => (item.kind === 'split' ? planApi.split(id, item.taskId) : planApi.enrich(id, item.taskId))}
                  >
                    Apply
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Tile>
      </section>

      {editing ? (
        <TaskEditor
          task={editing}
          people={crew}
          onClose={() => setEditing(null)}
          onSave={(patch) => {
            planApi.patchTask(id, editing.id, patch);
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

function TaskEditor({ task, people, onClose, onSave }) {
  const [draft, setDraft] = useState({
    title: task.title,
    durationMin: task.durationMin,
    startMin: task.startMin ?? 0,
    notes: task.notes ?? '',
    partsReady: task.partsReady,
    toolsReady: task.toolsReady,
    assignees: task.assignees[0] ?? '',
  });
  return (
    <div className="editor-backdrop" role="presentation" onClick={onClose}>
      <form
        className="editor-panel"
        role="dialog"
        aria-labelledby="edit-task-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onSave({
            title: draft.title,
            durationMin: Math.max(5, Number(draft.durationMin) || task.durationMin),
            startMin: Math.max(0, Number(draft.startMin) || 0),
            notes: draft.notes,
            partsReady: draft.partsReady,
            toolsReady: draft.toolsReady,
            assignees: draft.assignees ? [draft.assignees] : [],
            status: draft.assignees ? 'scheduled' : task.status,
          });
        }}
      >
        <h2 id="edit-task-title" className="section-title">Edit {task.title}</h2>
        <TextInput id="task-title" labelText="Title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
        <TextInput id="task-duration" labelText="Duration (minutes)" type="number" value={String(draft.durationMin)} onChange={(event) => setDraft({ ...draft, durationMin: Number(event.target.value) })} />
        <TextInput id="task-start" labelText="Start (minutes from arrival)" type="number" value={String(draft.startMin)} onChange={(event) => setDraft({ ...draft, startMin: Number(event.target.value) })} />
        <label className="editor-field" htmlFor="task-person">
          Assignee
          <select id="task-person" value={draft.assignees} onChange={(event) => setDraft({ ...draft, assignees: event.target.value })}>
            <option value="">Unassigned</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>{person.name} · {person.licenses.join('/')}</option>
            ))}
          </select>
        </label>
        <label className="editor-check"><input type="checkbox" checked={draft.partsReady} onChange={(event) => setDraft({ ...draft, partsReady: event.target.checked })} /> Parts ready</label>
        <label className="editor-check"><input type="checkbox" checked={draft.toolsReady} onChange={(event) => setDraft({ ...draft, toolsReady: event.target.checked })} /> Tools ready</label>
        <TextInput id="task-notes" labelText="Task notes" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
        <div className="plan-actions">
          <Button size="sm" kind="primary" type="submit">Save</Button>
          <Button size="sm" kind="secondary" type="button" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}
