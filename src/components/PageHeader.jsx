import { SlicerTags } from './SlicerTags.jsx';

export function PageHeader({ title, subtitle, subtitleTitle }) {
  return (
    <header className="page-header">
      <h1 className="page-title">{title}</h1>
      {subtitle ? (
        <p className="page-subtitle" title={subtitleTitle}>{subtitle}</p>
      ) : null}
      <SlicerTags />
    </header>
  );
}
