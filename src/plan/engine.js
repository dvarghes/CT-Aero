const SHIFT_END = { Day: 14 * 60, Evening: 22 * 60, Night: 6 * 60 };

export function windowMinutes(visit) {
  const minutes = Math.round((new Date(visit.windowEnd) - new Date(visit.windowStart)) / 60000);
  return Math.max(30, minutes);
}

export function isOpen(task) {
  return task.status !== 'deferred' && task.status !== 'na';
}

export function isScheduled(task) {
  return isOpen(task) && task.startMin != null && task.assignees.length > 0;
}

export function personQualifies(person, visit, task) {
  if (person.availability !== 'on shift') return false;
  if (person.station !== visit.station) return false;
  if (person.shift !== visit.shift) return false;
  if (!person.ratings.includes(visit.fleet)) return false;
  if (task.cert && !person.licenses.includes(task.cert)) return false;
  if (task.skill && !person.skills.includes(task.skill)) return false;
  return true;
}

function markCritical(tasks) {
  const scheduled = tasks.filter(isScheduled);
  const makespan = scheduled.reduce((max, task) => Math.max(max, task.startMin + task.durationMin), 0);
  const byPerson = new Map();
  for (const task of scheduled) {
    const personId = task.assignees[0];
    if (!byPerson.has(personId)) byPerson.set(personId, []);
    byPerson.get(personId).push(task);
  }
  const critical = new Set();
  for (const list of byPerson.values()) {
    list.sort((a, b) => a.startMin - b.startMin);
    if (list[list.length - 1].startMin + list[list.length - 1].durationMin !== makespan) continue;
    let cursor = makespan;
    for (let index = list.length - 1; index >= 0; index -= 1) {
      const task = list[index];
      if (task.startMin + task.durationMin === cursor) {
        critical.add(task.id);
        cursor = task.startMin;
      }
    }
  }
  return tasks.map((task) => ({ ...task, critical: critical.has(task.id) }));
}

export function generateSchedule(visit, tasks, people) {
  const windowMin = windowMinutes(visit);
  const active = tasks.filter(isOpen);
  if (active.length === 0) {
    return { ok: false, reason: 'No open tasks to schedule.', tasks };
  }
  const tooLong = active.find((task) => task.durationMin > windowMin);
  if (tooLong) {
    return {
      ok: false,
      reason: `${tooLong.title} is ${tooLong.durationMin} min, longer than the ${windowMin} min ground window, so release cannot be met.`,
      tasks,
    };
  }
  const pool = people.filter((person) => (
    person.availability === 'on shift'
    && person.station === visit.station
    && person.shift === visit.shift
    && person.ratings.includes(visit.fleet)
  ));
  if (pool.length === 0) {
    return { ok: false, reason: 'No technicians on shift at this station are rated for this fleet.', tasks };
  }
  const uncovered = active.find((task) => !pool.some((person) => personQualifies(person, visit, task)));
  if (uncovered) {
    return {
      ok: false,
      reason: `No on-shift technician holds ${uncovered.cert} for ${uncovered.skill} work on “${uncovered.title}”.`,
      tasks,
    };
  }
  const total = active.reduce((sum, task) => sum + task.durationMin, 0);
  if (total > pool.length * windowMin) {
    return {
      ok: false,
      reason: `Work is ${total} min and ${pool.length} qualified technicians provide ${pool.length * windowMin} min inside the ground window.`,
      tasks,
    };
  }
  const freeAt = Object.fromEntries(pool.map((person) => [person.id, 0]));
  const load = Object.fromEntries(pool.map((person) => [person.id, 0]));
  const next = tasks.map((task) => ({ ...task, assignees: [...task.assignees] }));
  const byId = new Map(next.map((task) => [task.id, task]));
  for (const source of active) {
    const task = byId.get(source.id);
    let best = null;
    for (const person of pool.filter((item) => personQualifies(item, visit, task))) {
      const start = freeAt[person.id];
      if (start + task.durationMin > windowMin) continue;
      if (!best || start < best.start || (start === best.start && load[person.id] < load[best.id])) {
        best = { id: person.id, start };
      }
    }
    if (!best) {
      return {
        ok: false,
        reason: `Could not place “${task.title}” before release with the qualified technicians on shift.`,
        tasks,
      };
    }
    task.startMin = best.start;
    task.assignees = [best.id];
    task.status = 'scheduled';
    freeAt[best.id] = best.start + task.durationMin;
    load[best.id] += task.durationMin;
  }
  const used = new Set(next.filter(isScheduled).flatMap((task) => task.assignees));
  return {
    ok: true,
    reason: `Draft fits the ground window using ${used.size} technicians.`,
    tasks: markCritical(next),
  };
}

function localMinutes(ms, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).formatToParts(new Date(ms));
  const hour = Number(parts.find((part) => part.type === 'hour').value);
  const minute = Number(parts.find((part) => part.type === 'minute').value);
  return hour * 60 + minute;
}

function crossesShiftEnd(visit, task, person) {
  const end = new Date(visit.windowStart).getTime() + (task.startMin + task.durationMin) * 60000;
  const mins = localMinutes(end, visit.timeZone);
  if (person.shift === 'Night') return mins >= 6 * 60 && mins < 22 * 60;
  return mins > SHIFT_END[person.shift];
}

export function taskBounds(visit, task) {
  const start = new Date(visit.windowStart).getTime() + task.startMin * 60000;
  return [start, start + task.durationMin * 60000];
}

export function conflictsForVisit(visit, tasks, people, tasksByVisit, visitsById) {
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const windowMin = windowMinutes(visit);
  const conflicts = [];
  for (const task of tasks) {
    if (!isScheduled(task)) continue;
    if (task.startMin + task.durationMin > windowMin) {
      conflicts.push({ id: `${task.id}-over`, taskId: task.id, severity: 'P0', type: 'overrun', text: `${task.title} runs past release.` });
    }
    for (const personId of task.assignees) {
      const person = peopleById.get(personId);
      if (!person || !personQualifies(person, visit, task)) {
        conflicts.push({
          id: `${task.id}-qual-${personId}`,
          taskId: task.id,
          severity: 'P0',
          type: 'qualification',
          text: `${person?.name ?? personId} is not qualified for ${task.title}.`,
        });
      } else if (crossesShiftEnd(visit, task, person)) {
        conflicts.push({
          id: `${task.id}-shift-${personId}`,
          taskId: task.id,
          severity: 'P0',
          type: 'shift',
          text: `${task.title} crosses the end of ${person.name}'s ${person.shift} shift.`,
        });
      }
    }
    if (task.needsParts && !task.partsReady) {
      conflicts.push({ id: `${task.id}-parts`, taskId: task.id, severity: 'P0', type: 'parts', text: `${task.title} is missing parts.` });
    }
    if (task.needsTools && !task.toolsReady) {
      conflicts.push({ id: `${task.id}-tools`, taskId: task.id, severity: 'P0', type: 'tools', text: `${task.title} is missing tools.` });
    }
  }
  const scheduled = [];
  for (const [visitId, visitTasks] of Object.entries(tasksByVisit)) {
    const other = visitsById.get(visitId);
    if (!other) continue;
    for (const task of visitTasks) {
      if (!isScheduled(task)) continue;
      const [start, end] = taskBounds(other, task);
      scheduled.push({ visitId, task, start, end });
    }
  }
  for (const task of tasks) {
    if (!isScheduled(task)) continue;
    const [start, end] = taskBounds(visit, task);
    for (const personId of task.assignees) {
      const hit = scheduled.find((item) => (
        item.task.id !== task.id
        && item.task.assignees.includes(personId)
        && item.start < end
        && start < item.end
      ));
      if (!hit) continue;
      const person = peopleById.get(personId);
      conflicts.push({
        id: `${task.id}-book-${personId}`,
        taskId: task.id,
        severity: 'P0',
        type: 'double-book',
        text: `${person?.name ?? personId} is double-booked on ${task.title} and ${hit.task.title}.`,
      });
    }
  }
  return conflicts;
}

export function blockingConflicts(conflicts, plan) {
  return conflicts.filter((conflict) => {
    if (conflict.severity !== 'P0') return false;
    if (conflict.type === 'qualification' && plan.licenseOverride.trim()) return false;
    if (!plan.blockOnConflicts) return false;
    return true;
  });
}

export function doubleBookedPeople(tasksByVisit, visitsById) {
  const intervals = [];
  for (const [visitId, tasks] of Object.entries(tasksByVisit)) {
    const visit = visitsById.get(visitId);
    if (!visit) continue;
    for (const task of tasks) {
      if (!isScheduled(task)) continue;
      const [start, end] = taskBounds(visit, task);
      for (const personId of task.assignees) {
        intervals.push({ personId, start, end, title: task.title, tail: visit.tail });
      }
    }
  }
  const hits = new Map();
  for (let i = 0; i < intervals.length; i += 1) {
    for (let j = i + 1; j < intervals.length; j += 1) {
      const left = intervals[i];
      const right = intervals[j];
      if (left.personId !== right.personId || left.start >= right.end || right.start >= left.end) continue;
      hits.set(left.personId, `${left.tail} ${left.title} overlaps ${right.tail} ${right.title}.`);
    }
  }
  return hits;
}

export function personLoad(person, tasksByVisit, visitsById) {
  let minutes = 0;
  let count = 0;
  const stands = [];
  const mismatched = [];
  for (const [visitId, tasks] of Object.entries(tasksByVisit)) {
    const visit = visitsById.get(visitId);
    if (!visit) continue;
    for (const task of tasks) {
      if (!isScheduled(task) || !task.assignees.includes(person.id)) continue;
      minutes += task.durationMin;
      count += 1;
      if (!stands.includes(visit.stand)) stands.push(visit.stand);
      if (!personQualifies(person, visit, task)) mismatched.push(task.title);
    }
  }
  const hours = Math.round((minutes / 60) * 10) / 10;
  const warnings = [];
  if (hours > person.maxHours) {
    warnings.push(`${hours}h assigned exceeds the ${person.maxHours}h maximum.`);
    warnings.push(`${Math.round((hours - person.maxHours) * 10) / 10}h overtime.`);
  }
  if (person.hoursAlreadyWorked >= 8 && count > 0) {
    warnings.push(`Rest risk after ${person.hoursAlreadyWorked}h already worked.`);
  }
  for (const title of mismatched) warnings.push(`Qualification mismatch on ${title}.`);
  return {
    hours,
    count,
    bayChanges: Math.max(0, stands.length - 1),
    warnings,
  };
}

export function filterRoster(people, filters, loadById) {
  return people.filter((person) => {
    if (filters.station && filters.station !== 'All stations' && person.station !== filters.station) return false;
    if (filters.shift && filters.shift !== 'All shifts' && person.shift !== filters.shift) return false;
    if (filters.ratings?.length && !filters.ratings.every((rating) => person.ratings.includes(rating))) return false;
    if (filters.licenses?.length && !filters.licenses.every((license) => person.licenses.includes(license))) return false;
    if (filters.skills?.length && !filters.skills.every((skill) => person.skills.includes(skill))) return false;
    if (filters.teams?.length && !filters.teams.includes(person.team)) return false;
    if (filters.availability?.length) {
      const match = filters.availability.some((value) => (
        value === 'assigned' ? (loadById.get(person.id)?.count ?? 0) > 0 : person.availability === value
      ));
      if (!match) return false;
    }
    return true;
  });
}

export function diffSnapshots(before, after) {
  const previous = new Map((before ?? []).map((task) => [task.id, task]));
  const lines = [];
  for (const task of after ?? []) {
    const prior = previous.get(task.id);
    if (!prior) {
      lines.push(`Added ${task.title}.`);
      continue;
    }
    const sameTime = prior.startMin === task.startMin && prior.durationMin === task.durationMin;
    const samePeople = prior.assignees.join(',') === task.assignees.join(',');
    if (!sameTime || !samePeople || prior.status !== task.status) {
      lines.push(`${task.title}: ${prior.status} ${prior.startMin ?? '—'} min → ${task.status} ${task.startMin ?? '—'} min.`);
    }
  }
  for (const task of before ?? []) {
    if (!(after ?? []).some((item) => item.id === task.id)) lines.push(`Removed ${task.title}.`);
  }
  return lines;
}

export function instructionSuggestions(tasks) {
  return tasks.flatMap((task) => {
    if (!isOpen(task)) return [];
    const items = [];
    if (task.durationMin >= 60) {
      items.push({ taskId: task.id, kind: 'split', text: `Split “${task.title}” (${task.durationMin} min) into two cards.` });
    }
    if (!task.title.includes(task.zone)) {
      items.push({ taskId: task.id, kind: 'enrich', text: `Name the ${task.zone} zone and ${task.skill} skill on “${task.title}”.` });
    }
    return items;
  });
}

export function fairnessHints(peopleList, tasksByVisit) {
  const heavy = {};
  for (const tasks of Object.values(tasksByVisit)) {
    for (const task of tasks) {
      if (!isScheduled(task) || task.durationMin < 60) continue;
      for (const personId of task.assignees) heavy[personId] = (heavy[personId] ?? 0) + 1;
    }
  }
  const values = Object.values(heavy);
  if (values.length === 0) return [];
  const average = values.reduce((sum, value) => sum + value, 0) / peopleList.length;
  return peopleList
    .filter((person) => (heavy[person.id] ?? 0) > average + 0.5)
    .map((person) => ({
      personId: person.id,
      text: `${person.name} has ${heavy[person.id]} heavy checks, above the crew average.`,
    }));
}

export function coverageGap(shifts, peopleList, station) {
  return shifts.map((shift) => {
    const count = peopleList.filter((person) => (
      person.shift === shift.id
      && person.availability === 'on shift'
      && person.licenses.includes(shift.role)
      && (station === 'All stations' || person.station === station)
    )).length;
    return { ...shift, count, short: count < shift.minimum };
  });
}
