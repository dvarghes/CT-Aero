import { ProgressBar, Tile } from '@carbon/react';
import { useParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.jsx';
import { StatusTag } from '../components/StatusTag.jsx';
import { getTurnaround } from '../data/mock.js';
import { formatGroundWindow, formatHours, formatUtcRange } from '../format.js';
import { useSlicers } from '../slicers/SlicerContext.jsx';

export function PlannerPage() {
  const { id } = useParams();
  const { slicers } = useSlicers();
  const visit = getTurnaround(id);

  if (!visit) {
    return (
      <div className="tower">
        <PageHeader title="Planner" subtitle="This turnaround is not in the mock data." />
      </div>
    );
  }

  const percent = Math.round(visit.staffFill * 100);
  const windowText = formatGroundWindow(visit.windowStart, visit.windowEnd, visit.timeZone, slicers.window);

  return (
    <div className="tower">
      <PageHeader
        title={visit.tail}
        subtitle={`${visit.station} · ${visit.type} · ${visit.flight} · ${visit.workOrder}`}
      />
      <Tile className="plan-card">
        <StatusTag status={visit.status} reason={visit.blockedReason} />
        <dl className="facts">
          <div>
            <dt>Ground window</dt>
            <dd title={formatUtcRange(visit.windowStart, visit.windowEnd)}>{windowText}</dd>
          </div>
          <div>
            <dt>Shift</dt>
            <dd>{visit.shift}</dd>
          </div>
          <div>
            <dt>Stand</dt>
            <dd>{visit.stand}</dd>
          </div>
          <div>
            <dt>Fleet</dt>
            <dd>{visit.fleet}</dd>
          </div>
          <div>
            <dt>Required</dt>
            <dd>{formatHours(visit.requiredHours)}h</dd>
          </div>
          <div>
            <dt>Assigned</dt>
            <dd>{formatHours(visit.assignedHours)}h</dd>
          </div>
        </dl>
        <ProgressBar
          className="plan-fill"
          label="Staff fill"
          helperText={`${percent}%`}
          value={percent}
          max={100}
          size="small"
          status="active"
        />
        <p className="module-note">Sequencing and the plan canvas are not in this pass.</p>
      </Tile>
    </div>
  );
}
