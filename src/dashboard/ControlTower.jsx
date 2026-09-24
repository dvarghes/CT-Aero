import { ClickableTile, Tile } from '@carbon/react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.jsx';
import { StatusTag } from '../components/StatusTag.jsx';
import { SYNC } from '../data/mock.js';
import { compareCount, comparePoints, needsActionCount, staffFill } from '../data/slice.js';
import { formatAge, formatGroundWindow, formatUtcRange, syncTitle } from '../format.js';
import { useNow } from '../hooks/useNow.js';
import { useSlice } from '../hooks/useSlice.js';
import { windowLabel } from '../slicers/model.js';
import { useAppNavigate, useSlicerHref, useSlicers } from '../slicers/SlicerContext.jsx';
import { useMinWidth } from '../hooks/useMinWidth.js';
import { AttentionTable } from './AttentionTable.jsx';
import { CapacityChart, StatusChart } from './Charts.jsx';

function SyncSubtitle() {
  const tick = useNow();
  const { slicers } = useSlicers();
  const text = `${slicers.station} · ${windowLabel(slicers.window)} · M&E ${formatAge(SYNC.me, tick)} · Flight Ops ${formatAge(SYNC.flightOps, tick)} · HR ${formatAge(SYNC.hr, tick)}`;
  return <PageHeader title="Control tower" subtitle={text} subtitleTitle={syncTitle()} />;
}

export function ControlTower() {
  const { slicers } = useSlicers();
  const slice = useSlice();
  const wide = useMinWidth(1440);
  const go = useAppNavigate();
  const toHref = useSlicerHref();
  const fill = staffFill(slice.current);
  const priorFill = staffFill(slice.prior);
  const unread = slice.alerts.filter((alert) => alert.unread).length;
  const priorUnread = slice.priorAlerts.filter((alert) => alert.unread).length;
  const atRisk = needsActionCount(slice.current);
  const priorAtRisk = needsActionCount(slice.prior);
  const timeline = [...slice.current].sort((a, b) => new Date(a.windowStart) - new Date(b.windowStart));

  return (
    <div className="tower">
      <SyncSubtitle />
      <section className="kpi-grid" aria-label="Shift health">
        <Tile className="kpi-tile">
          <p className="kpi-label">Turnarounds in window</p>
          <p className="kpi-value">{slice.current.length}</p>
          <p className="kpi-delta">{compareCount(slice.current.length, slice.prior.length)}</p>
        </Tile>
        <ClickableTile className="kpi-tile" href="#attention" onClick={(event) => {
          event.preventDefault();
          document.getElementById('attention')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}>
          <p className="kpi-label">At risk / delayed</p>
          <p className="kpi-value">{atRisk}</p>
          <p className="kpi-delta">{compareCount(atRisk, priorAtRisk)}</p>
        </ClickableTile>
        <ClickableTile className="kpi-tile" href={toHref('/workforce')} onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
          event.preventDefault();
          go('/workforce');
        }}>
          <p className="kpi-label">Staff fill</p>
          <p className="kpi-value">{fill.percent == null ? '—' : `${fill.percent}%`}</p>
          <p className="kpi-delta">{comparePoints(fill.percent, priorFill.percent)}</p>
        </ClickableTile>
        <ClickableTile className="kpi-tile" href={toHref('/alerts')} onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
          event.preventDefault();
          go('/alerts');
        }}>
          <p className="kpi-label">Open alerts</p>
          <p className="kpi-value">{unread}</p>
          <p className="kpi-delta">{compareCount(unread, priorUnread)}</p>
        </ClickableTile>
      </section>
      <section className="analysis-grid" aria-label="Analysis">
        <StatusChart visits={slice.current} />
        <CapacityChart capacity={slice.capacity} />
      </section>
      <section id="attention" aria-labelledby="attention-heading">
        <h2 id="attention-heading" className="section-title">Attention</h2>
        <AttentionTable
          visits={slice.attention}
          windowId={slicers.window}
          showStation={slicers.station === 'All stations'}
          wide={wide}
        />
      </section>
      <section aria-labelledby="window-heading">
        <h2 id="window-heading" className="section-title">In this window</h2>
        {timeline.length === 0 ? (
          <p className="chart-empty">No turnarounds in this slice.</p>
        ) : (
          <ol className="window-list">
            {timeline.map((visit) => (
              <li key={visit.id}>
                <time dateTime={visit.windowStart} title={formatUtcRange(visit.windowStart, visit.windowEnd)}>
                  {formatGroundWindow(visit.windowStart, visit.windowEnd, visit.timeZone, slicers.window)}
                </time>
                <span className="window-list__main">
                  <Link className="cds--link" to={toHref(`/planner/${visit.id}`)}>{visit.tail}</Link>
                  <span className="cell-meta">{visit.station} · {visit.type} · {visit.flight}</span>
                </span>
                <StatusTag status={visit.status} reason={visit.blockedReason} />
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
