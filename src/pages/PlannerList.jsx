import { Link } from 'react-router-dom';
import { Tag } from '@carbon/react';
import { PageHeader } from '../components/PageHeader.jsx';
import { formatGroundWindow } from '../format.js';
import { useMinWidth } from '../hooks/useMinWidth.js';
import { useSlice } from '../hooks/useSlice.js';
import { usePlan } from '../plan/PlanContext.jsx';
import { useSlicers } from '../slicers/SlicerContext.jsx';

const STATE_TYPE = {
  Draft: 'gray',
  Ready: 'cyan',
  Published: 'green',
  Locked: 'purple',
  Completed: 'teal',
};

export function PlannerList() {
  const { slicers } = useSlicers();
  const slice = useSlice();
  const plan = usePlan();
  const wide = useMinWidth(1440);
  const rows = [...slice.current].sort((a, b) => new Date(a.windowStart) - new Date(b.windowStart));

  return (
    <div className="tower">
      <PageHeader title="Planner" subtitle={`${rows.length} turnarounds in this slice.`} />
      <div className="attention">
        <table className="plain-table">
          <thead>
            <tr>
              <th>Tail</th>
              {wide ? <th>Window</th> : null}
              <th>Plan</th>
              <th>Tasks</th>
              {wide ? <th>Conflicts</th> : null}
              <th><span className="cds--visually-hidden">Open</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={wide ? 6 : 4}>No turnarounds in this slice.</td>
              </tr>
            ) : rows.map((visit) => {
              const tasks = plan.tasksByVisit[visit.id] ?? [];
              const conflicts = plan.blocking(visit.id).length;
              const state = plan.plans[visit.id]?.state ?? 'Draft';
              return (
                <tr key={visit.id}>
                  <td>
                    <Link className="cds--link" to={`/planner/${visit.id}${window.location.search}`}>{visit.tail}</Link>
                    <div className="cell-meta">{visit.station} · {visit.fleet}</div>
                  </td>
                  {wide ? (
                    <td>{formatGroundWindow(visit.windowStart, visit.windowEnd, visit.timeZone, slicers.window)}</td>
                  ) : null}
                  <td><Tag size="sm" type={STATE_TYPE[state] ?? 'gray'}>{state}</Tag></td>
                  <td>{tasks.length}</td>
                  {wide ? <td>{conflicts}</td> : null}
                  <td><Link className="cds--link" to={`/planner/${visit.id}${window.location.search}`}>Open</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
