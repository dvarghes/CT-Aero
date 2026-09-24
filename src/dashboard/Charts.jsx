import { useMemo } from 'react';
import { GroupedBarChart, SimpleBarChart } from '@carbon/charts-react';
import { Tile } from '@carbon/react';
import { statusMix } from '../data/slice.js';

function countTicks(max) {
  const top = Math.max(1, Math.ceil(max));
  const step = top <= 8 ? 1 : Math.ceil(top / 6);
  const values = [];
  for (let value = 0; value <= top; value += step) values.push(value);
  return values;
}

const baseOptions = {
  theme: 'g90',
  resizable: true,
  animations: false,
  toolbar: { enabled: false },
  tooltip: { enabled: true },
};

export function StatusChart({ visits }) {
  const data = useMemo(() => statusMix(visits), [visits]);
  const options = useMemo(() => {
    const max = data.reduce((highest, item) => Math.max(highest, item.value), 0);
    return {
      ...baseOptions,
      title: 'Status mix',
      height: `${Math.min(300, Math.max(180, 88 + data.length * 28))}px`,
      legend: { enabled: false },
      axes: {
        left: { mapsTo: 'key', scaleType: 'labels' },
        bottom: {
          mapsTo: 'value',
          title: 'Turnarounds',
          ticks: { values: countTicks(max) },
        },
      },
      accessibility: { svgAriaLabel: 'Status mix' },
    };
  }, [data]);

  return (
    <Tile className="chart-tile">
      {data.length === 0 ? (
        <p className="chart-empty">No turnarounds in this slice.</p>
      ) : (
        <SimpleBarChart data={data} options={options} />
      )}
    </Tile>
  );
}

export function CapacityChart({ capacity }) {
  const data = useMemo(() => capacity.available.flatMap((item) => {
    const required = capacity.required.find((row) => row.station === item.station)?.hours ?? 0;
    return [
      { group: 'Required', key: item.station, value: required },
      { group: 'Available', key: item.station, value: item.hours },
    ];
  }), [capacity]);

  const options = useMemo(() => ({
    ...baseOptions,
    title: 'Capacity',
    height: '260px',
    legend: { alignment: 'center' },
    axes: {
      left: { mapsTo: 'value', title: 'Hours' },
      bottom: { mapsTo: 'key', scaleType: 'labels' },
    },
    accessibility: { svgAriaLabel: 'Required hours versus available hours' },
  }), []);

  return (
    <Tile className="chart-tile">
      <GroupedBarChart data={data} options={options} />
    </Tile>
  );
}
