import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { turnarounds } from '../data/mock.js';
import { defaultShifts, people as seedPeople } from '../data/roster.js';
import { buildTasksByVisit, emptyPlan } from '../data/workpackages.js';
import { blockingConflicts, conflictsForVisit, diffSnapshots, generateSchedule } from './engine.js';

const STORAGE_KEY = 'assignment-plan-v1';
const PlanContext = createContext(null);

function freshState() {
  const tasksByVisit = buildTasksByVisit();
  const plans = {};
  for (const visit of turnarounds) plans[visit.id] = emptyPlan();
  return { people: seedPeople, tasksByVisit, plans, shifts: defaultShifts };
}

function loadState() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return freshState();
    const saved = JSON.parse(raw);
    if (!saved.tasksByVisit || !saved.plans || !saved.people) return freshState();
    return saved;
  } catch {
    return freshState();
  }
}

function renumber(tasks) {
  return tasks.map((task, index) => ({ ...task, order: index }));
}

export function PlanProvider({ children }) {
  const [state, setState] = useState(loadState);
  const visitsById = useMemo(() => new Map(turnarounds.map((visit) => [visit.id, visit])), []);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const updateTasks = useCallback((visitId, tasks, planPatch = {}) => {
    setState((current) => {
      const plan = current.plans[visitId] ?? emptyPlan();
      const nextState = plan.state === 'Draft' ? plan.state : 'Draft';
      return {
        ...current,
        tasksByVisit: { ...current.tasksByVisit, [visitId]: renumber(tasks) },
        plans: {
          ...current.plans,
          [visitId]: { ...plan, ...planPatch, state: planPatch.state ?? nextState },
        },
      };
    });
  }, []);

  const api = useMemo(() => {
    const visitOf = (id) => visitsById.get(id);

    function conflicts(visitId) {
      const visit = visitOf(visitId);
      const tasks = state.tasksByVisit[visitId] ?? [];
      if (!visit) return [];
      return conflictsForVisit(visit, tasks, state.people, state.tasksByVisit, visitsById);
    }

    return {
      people: state.people,
      tasksByVisit: state.tasksByVisit,
      plans: state.plans,
      shifts: state.shifts,
      visitsById,
      conflicts,
      blocking(visitId) {
        const plan = state.plans[visitId] ?? emptyPlan();
        return blockingConflicts(conflicts(visitId), plan);
      },
      generate(visitId) {
        const visit = visitOf(visitId);
        if (!visit) return;
        const result = generateSchedule(visit, state.tasksByVisit[visitId] ?? [], state.people);
        setState((current) => ({
          ...current,
          tasksByVisit: { ...current.tasksByVisit, [visitId]: result.tasks },
          plans: {
            ...current.plans,
            [visitId]: {
              ...(current.plans[visitId] ?? emptyPlan()),
              state: 'Draft',
              lastGenerateOk: result.ok,
              lastGenerateReason: result.reason,
            },
          },
        }));
      },
      patchTask(visitId, taskId, patch) {
        const tasks = (state.tasksByVisit[visitId] ?? []).map((task) => (
          task.id === taskId ? { ...task, ...patch } : task
        ));
        updateTasks(visitId, tasks);
      },
      assign(visitId, taskId, personId) {
        const tasks = (state.tasksByVisit[visitId] ?? []).map((task) => {
          if (task.id !== taskId) return task;
          const startMin = task.startMin ?? 0;
          return { ...task, assignees: [personId], startMin, status: task.status === 'pending' ? 'scheduled' : task.status };
        });
        updateTasks(visitId, tasks);
      },
      move(visitId, taskId, startMin) {
        const tasks = (state.tasksByVisit[visitId] ?? []).map((task) => (
          task.id === taskId ? { ...task, startMin: Math.max(0, startMin), status: 'scheduled' } : task
        ));
        updateTasks(visitId, tasks);
      },
      reorder(visitId, fromId, toId) {
        const tasks = [...(state.tasksByVisit[visitId] ?? [])];
        const from = tasks.findIndex((task) => task.id === fromId);
        const to = tasks.findIndex((task) => task.id === toId);
        if (from < 0 || to < 0 || from === to) return;
        const [item] = tasks.splice(from, 1);
        tasks.splice(to, 0, item);
        updateTasks(visitId, tasks);
      },
      split(visitId, taskId) {
        const tasks = [...(state.tasksByVisit[visitId] ?? [])];
        const index = tasks.findIndex((task) => task.id === taskId);
        if (index < 0) return;
        const task = tasks[index];
        const first = Math.max(10, Math.round(task.durationMin / 2));
        const second = Math.max(10, task.durationMin - first);
        tasks.splice(index, 1, {
          ...task,
          durationMin: first,
          title: `${task.title} (1)`,
          startMin: null,
          assignees: [],
          status: 'pending',
        }, {
          ...task,
          id: `${task.id}-split`,
          durationMin: second,
          title: `${task.title} (2)`,
          startMin: null,
          assignees: [],
          status: 'pending',
          adHoc: task.adHoc,
        });
        updateTasks(visitId, tasks);
      },
      defer(visitId, taskId) {
        const tasks = (state.tasksByVisit[visitId] ?? []).map((task) => (
          task.id === taskId ? { ...task, status: 'deferred', startMin: null, assignees: [] } : task
        ));
        updateTasks(visitId, tasks);
      },
      markNa(visitId, taskId) {
        const tasks = (state.tasksByVisit[visitId] ?? []).map((task) => (
          task.id === taskId ? { ...task, status: 'na', startMin: null, assignees: [] } : task
        ));
        updateTasks(visitId, tasks);
      },
      addAdHoc(visitId, draft) {
        const tasks = [...(state.tasksByVisit[visitId] ?? []), {
          id: `${visitId}-adhoc-${Date.now()}`,
          visitId,
          title: draft.title || 'Ad-hoc task',
          durationMin: Math.max(10, Number(draft.durationMin) || 30),
          skill: draft.skill || 'structures',
          cert: draft.cert || 'B1',
          zone: draft.zone || 'Cabin',
          needsParts: false,
          needsTools: false,
          partsReady: true,
          toolsReady: true,
          status: 'pending',
          assignees: [],
          startMin: null,
          order: 999,
          adHoc: true,
          source: 'local',
          critical: false,
          notes: '',
        }];
        updateTasks(visitId, tasks);
      },
      enrich(visitId, taskId) {
        const tasks = (state.tasksByVisit[visitId] ?? []).map((task) => (
          task.id === taskId && !task.title.includes(task.zone)
            ? { ...task, title: `${task.title} — ${task.zone} / ${task.skill}` }
            : task
        ));
        updateTasks(visitId, tasks);
      },
      setNotes(visitId, visitNotes) {
        setState((current) => ({
          ...current,
          plans: { ...current.plans, [visitId]: { ...current.plans[visitId], visitNotes } },
        }));
      },
      setTaskNotes(visitId, taskId, notes) {
        const tasks = (state.tasksByVisit[visitId] ?? []).map((task) => (
          task.id === taskId ? { ...task, notes } : task
        ));
        updateTasks(visitId, tasks);
      },
      setLicenseOverride(visitId, licenseOverride) {
        setState((current) => ({
          ...current,
          plans: { ...current.plans, [visitId]: { ...current.plans[visitId], licenseOverride } },
        }));
      },
      setBlock(visitId, blockOnConflicts) {
        setState((current) => ({
          ...current,
          plans: { ...current.plans, [visitId]: { ...current.plans[visitId], blockOnConflicts } },
        }));
      },
      markReady(visitId) {
        if (blockingConflicts(conflicts(visitId), state.plans[visitId]).length > 0) return;
        setState((current) => ({
          ...current,
          plans: { ...current.plans, [visitId]: { ...current.plans[visitId], state: 'Ready' } },
        }));
      },
      publish(visitId) {
        const plan = state.plans[visitId];
        const blocking = blockingConflicts(conflicts(visitId), plan);
        if (blocking.length > 0 || plan.state !== 'Ready') return;
        const snapshot = state.tasksByVisit[visitId];
        const version = {
          id: `v${plan.versions.length + 1}`,
          at: new Date().toISOString(),
          state: 'Published',
          tasks: snapshot,
        };
        setState((current) => ({
          ...current,
          plans: {
            ...current.plans,
            [visitId]: { ...plan, state: 'Published', versions: [...plan.versions, version] },
          },
        }));
      },
      lock(visitId) {
        const plan = state.plans[visitId];
        if (plan.state !== 'Published') return;
        setState((current) => ({
          ...current,
          plans: { ...current.plans, [visitId]: { ...plan, state: 'Locked' } },
        }));
      },
      complete(visitId) {
        const plan = state.plans[visitId];
        if (plan.state !== 'Locked') return;
        setState((current) => ({
          ...current,
          plans: { ...current.plans, [visitId]: { ...plan, state: 'Completed' } },
        }));
      },
      versionDiff(visitId) {
        const versions = state.plans[visitId]?.versions ?? [];
        if (versions.length < 2) return [];
        return diffSnapshots(versions[versions.length - 2].tasks, versions[versions.length - 1].tasks);
      },
      updateShift(id, patch) {
        setState((current) => ({
          ...current,
          shifts: current.shifts.map((shift) => (shift.id === id ? { ...shift, ...patch } : shift)),
        }));
      },
      allocateSlice(visitIds) {
        setState((current) => {
          const tasksByVisit = { ...current.tasksByVisit };
          const plans = { ...current.plans };
          for (const visitId of visitIds) {
            const visit = visitsById.get(visitId);
            if (!visit) continue;
            const result = generateSchedule(visit, tasksByVisit[visitId] ?? [], current.people);
            if (!result.ok) continue;
            tasksByVisit[visitId] = result.tasks;
            plans[visitId] = {
              ...(plans[visitId] ?? emptyPlan()),
              state: 'Draft',
              lastGenerateOk: true,
              lastGenerateReason: result.reason,
            };
          }
          return { ...current, tasksByVisit, plans };
        });
      },
      balanceSlice(visitIds) {
        setState((current) => {
          const tasksByVisit = { ...current.tasksByVisit };
          const load = {};
          for (const person of current.people) load[person.id] = 0;
          for (const visitId of visitIds) {
            for (const task of tasksByVisit[visitId] ?? []) {
              if (task.startMin == null) continue;
              for (const personId of task.assignees) load[personId] = (load[personId] ?? 0) + task.durationMin;
            }
          }
          for (const visitId of visitIds) {
            const visit = visitsById.get(visitId);
            if (!visit) continue;
            tasksByVisit[visitId] = (tasksByVisit[visitId] ?? []).map((task) => {
              if (task.startMin == null || task.assignees.length === 0) return task;
              const currentId = task.assignees[0];
              const candidates = current.people.filter((person) => person.id !== currentId && (
                person.availability === 'on shift'
                && person.station === visit.station
                && person.shift === visit.shift
                && person.ratings.includes(visit.fleet)
                && person.licenses.includes(task.cert)
                && person.skills.includes(task.skill)
              ));
              const lighter = candidates
                .filter((person) => (load[person.id] ?? 0) + task.durationMin < (load[currentId] ?? 0))
                .sort((a, b) => (load[a.id] ?? 0) - (load[b.id] ?? 0))[0];
              if (!lighter) return task;
              load[currentId] -= task.durationMin;
              load[lighter.id] = (load[lighter.id] ?? 0) + task.durationMin;
              return { ...task, assignees: [lighter.id] };
            });
          }
          const plans = { ...current.plans };
          for (const visitId of visitIds) {
            plans[visitId] = { ...(plans[visitId] ?? emptyPlan()), state: 'Draft' };
          }
          return { ...current, tasksByVisit, plans };
        });
      },
    };
  }, [state, updateTasks, visitsById]);

  return <PlanContext.Provider value={api}>{children}</PlanContext.Provider>;
}

export function usePlan() {
  const value = useContext(PlanContext);
  if (!value) throw new Error('usePlan must be used inside PlanProvider');
  return value;
}
