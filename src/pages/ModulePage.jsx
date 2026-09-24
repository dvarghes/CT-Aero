import { PageHeader } from '../components/PageHeader.jsx';
import { staffFill } from '../data/slice.js';
import { useSlice } from '../hooks/useSlice.js';

const MODULES = {
  planner: {
    title: 'Planner',
    note: 'The planner list is not in this pass.',
  },
  workforce: {
    title: 'Workforce',
    note: 'The workforce board is not in this pass.',
  },
  alerts: {
    title: 'Alerts',
    note: 'The alert inbox is not in this pass.',
  },
  horizon: {
    title: 'Horizon',
    note: 'The horizon calendar is not in this pass.',
  },
  reports: {
    title: 'Reports',
    note: 'Reports are not in this pass.',
  },
  admin: {
    title: 'Admin',
    note: 'Station, skill, and rule configuration is not in this pass.',
  },
};

function summary(id, slice) {
  if (id === 'admin') return null;
  if (id === 'workforce') {
    const fill = staffFill(slice.current);
    if (fill.percent == null) return 'No required hours in this slice.';
    return `Staff fill ${fill.percent}% · ${fill.assigned}h assigned of ${fill.required}h.`;
  }
  if (id === 'alerts') {
    const unread = slice.alerts.filter((alert) => alert.unread).length;
    return `${unread} unread of ${slice.alerts.length} alerts in this slice.`;
  }
  return `${slice.current.length} turnarounds in this slice.`;
}

export function ModulePage({ id }) {
  const module = MODULES[id];
  const slice = useSlice();
  return (
    <div className="tower">
      <PageHeader title={module.title} subtitle={summary(id, slice)} />
      <p className="module-note">{module.note}</p>
    </div>
  );
}
