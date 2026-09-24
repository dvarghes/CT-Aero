import { useState } from 'react';
import { windowMinutes } from '../plan/engine.js';
import { personName } from '../data/roster.js';

export function GanttBoard({ visit, tasks, people, onMove, onReorder, onAssign }) {
  const [activeId, setActiveId] = useState(null);
  const windowMin = windowMinutes(visit);
  const open = tasks.filter((task) => task.status !== 'deferred' && task.status !== 'na');

  function dragStart(event, task) {
    const track = event.currentTarget.closest('.gantt-track');
    const width = track.getBoundingClientRect().width || 1;
    const originX = event.clientX;
    const origin = task.startMin ?? 0;
    setActiveId(task.id);
    const move = (ev) => {
      const delta = ((ev.clientX - originX) / width) * windowMin;
      const next = Math.max(0, Math.round((origin + delta) / 5) * 5);
      onMove(task.id, Math.min(next, Math.max(0, windowMin - 5)));
    };
    const up = () => {
      setActiveId(null);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  return (
    <div className="gantt" aria-label="Task timeline inside the ground window">
      <div className="gantt-scale">
        <span>Release window</span>
        <span className="gantt-ticks">
          <span>0</span>
          <span>{Math.round(windowMin / 2)} min</span>
          <span>{windowMin} min</span>
        </span>
      </div>
      {open.map((task) => {
        const start = task.startMin ?? 0;
        const left = Math.min(100, (start / windowMin) * 100);
        const width = Math.max(2, Math.min(100 - left, (task.durationMin / windowMin) * 100));
        const overrun = start + task.durationMin > windowMin;
        return (
          <div
            key={task.id}
            id={`task-${task.id}`}
            className="gantt-row"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const personId = event.dataTransfer.getData('text/person');
              const fromId = event.dataTransfer.getData('text/task');
              if (personId) onAssign(task.id, personId);
              if (fromId) onReorder(fromId, task.id);
            }}
          >
            <button
              type="button"
              className="gantt-label"
              draggable
              title="Drag to reorder"
              onDragStart={(event) => {
                event.dataTransfer.setData('text/task', task.id);
                event.dataTransfer.effectAllowed = 'move';
              }}
            >
              {task.title}
            </button>
            <div className="gantt-track">
              <button
                type="button"
                className={[
                  'gantt-bar',
                  task.critical ? 'is-critical' : '',
                  overrun ? 'is-over' : '',
                  activeId === task.id ? 'is-active' : '',
                ].filter(Boolean).join(' ')}
                style={{ left: `${left}%`, width: `${width}%` }}
                onPointerDown={(event) => dragStart(event, task)}
                title={`${task.title}, ${task.durationMin} min${task.assignees.length ? `, ${task.assignees.map((id) => personName(people, id)).join(', ')}` : ''}`}
              >
                <span>{task.durationMin}m</span>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
