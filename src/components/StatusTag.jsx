import { Tag } from '@carbon/react';

const TAG_TYPE = {
  Draft: 'gray',
  Published: 'cyan',
  'In progress': 'blue',
  'On track': 'green',
  'At risk': 'magenta',
  Delayed: 'red',
  Blocked: 'purple',
  Cancelled: 'gray',
  Completed: 'teal',
};

export function StatusTag({ status, reason }) {
  const label = status === 'Blocked' && reason ? `Blocked · ${reason}` : status;
  return (
    <Tag type={TAG_TYPE[status] ?? 'gray'} size="sm" title={label}>
      {label}
    </Tag>
  );
}
