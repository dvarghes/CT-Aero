import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DataTable,
  OverflowMenu,
  OverflowMenuItem,
  ProgressBar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
} from '@carbon/react';
import { formatGroundWindow, formatUtcRange } from '../format.js';
import { useAppNavigate, useSlicerHref } from '../slicers/SlicerContext.jsx';
import { StatusTag } from '../components/StatusTag.jsx';

export function AttentionTable({ visits, windowId, showStation, wide }) {
  const [query, setQuery] = useState('');
  const go = useAppNavigate();
  const toHref = useSlicerHref();
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? visits.filter((visit) => (
      visit.tail.toLowerCase().includes(needle)
      || visit.flight.toLowerCase().includes(needle)
      || visit.workOrder.toLowerCase().includes(needle)
    ))
    : visits;

  const headers = wide
    ? [
      { key: 'tail', header: 'Tail' },
      { key: 'type', header: 'Type' },
      { key: 'window', header: 'Window' },
      { key: 'status', header: 'Status' },
      { key: 'fill', header: 'Staff fill' },
      { key: 'actions', header: 'Actions' },
    ]
    : [
      { key: 'tail', header: 'Tail' },
      { key: 'window', header: 'Window' },
      { key: 'status', header: 'Status' },
      { key: 'actions', header: 'Actions' },
    ];

  const widths = wide
    ? { tail: '22%', type: '12%', window: '22%', status: '18%', fill: '20%', actions: '3.5rem' }
    : { tail: '32%', window: '34%', status: '26%', actions: '3.5rem' };

  const rows = visible.map((visit) => ({
    id: visit.id,
    tail: visit.tail,
    type: visit.type,
    window: formatGroundWindow(visit.windowStart, visit.windowEnd, visit.timeZone, windowId),
    status: visit.status,
    fill: `${Math.round(visit.staffFill * 100)}`,
    actions: '',
  }));

  const empty = visits.length === 0
    ? 'No turnarounds need action in this slice.'
    : 'No turnarounds match this search.';

  return (
    <div className="attention">
      <DataTable rows={rows} headers={headers} size="xs">
        {({
          headers: tableHeaders,
          getHeaderProps,
          getTableProps,
          getToolbarProps,
          getTableContainerProps,
        }) => (
          <TableContainer {...getTableContainerProps()}>
            <TableToolbar {...getToolbarProps()} aria-label="Attention search">
              <TableToolbarContent>
                <TableToolbarSearch
                  persistent
                  placeholder="Search tail, flight, or work order"
                  labelText="Search attention list"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </TableToolbarContent>
            </TableToolbar>
            <Table {...getTableProps()} overflowMenuOnHover={false}>
              <TableHead>
                <TableRow>
                  {tableHeaders.map((header) => {
                    const { key, ...headerProps } = getHeaderProps({ header });
                    const hidden = header.key === 'actions';
                    return (
                      <TableHeader key={key} {...headerProps} style={{ width: widths[header.key] }}>
                        {hidden ? <span className="cds--visually-hidden">{header.header}</span> : header.header}
                      </TableHeader>
                    );
                  })}
                </TableRow>
              </TableHead>
              <TableBody>
                {visible.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={tableHeaders.length}>
                      <p className="table-empty">{empty}</p>
                    </TableCell>
                  </TableRow>
                ) : visible.map((visit) => (
                  <TableRow
                    key={visit.id}
                    className="attention-row"
                    tabIndex={0}
                    onClick={(event) => {
                      if (event.target.closest('button, a')) return;
                      go(`/planner/${visit.id}`);
                    }}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      go(`/planner/${visit.id}`);
                    }}
                  >
                    {tableHeaders.map((header) => (
                      <TableCell key={header.key} className={header.key === 'actions' ? 'cds--table-column-menu' : undefined}>
                        {renderCell(header.key, visit, { showStation, windowId, toHref, go })}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DataTable>
    </div>
  );
}

function renderCell(key, visit, { showStation, windowId, toHref, go }) {
  if (key === 'tail') {
    return (
      <span className="tail-cell">
        <Link className="cds--link" to={toHref(`/planner/${visit.id}`)} title={`${visit.flight} · ${visit.workOrder}`}>
          {visit.tail}
        </Link>
        {showStation ? <span className="cell-meta">{visit.station}</span> : null}
      </span>
    );
  }
  if (key === 'type') return visit.type;
  if (key === 'window') {
    return (
      <span title={formatUtcRange(visit.windowStart, visit.windowEnd)}>
        {formatGroundWindow(visit.windowStart, visit.windowEnd, visit.timeZone, windowId)}
      </span>
    );
  }
  if (key === 'status') return <StatusTag status={visit.status} reason={visit.blockedReason} />;
  if (key === 'fill') {
    const percent = Math.round(visit.staffFill * 100);
    return (
      <ProgressBar
        label={`${percent}%`}
        value={percent}
        max={100}
        size="small"
        status="active"
        type="inline"
      />
    );
  }
  return (
    <OverflowMenu
      size="sm"
      flipped
      aria-label={`Actions for ${visit.tail}`}
      iconDescription={`Actions for ${visit.tail}`}
    >
      <OverflowMenuItem itemText="Open plan" onClick={() => go(`/planner/${visit.id}`)} />
    </OverflowMenu>
  );
}
