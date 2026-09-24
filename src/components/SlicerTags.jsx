import { DismissibleTag } from '@carbon/react';
import { appliedTags } from '../slicers/model.js';
import { useSlicers } from '../slicers/SlicerContext.jsx';

export function SlicerTags() {
  const { slicers, clear } = useSlicers();
  const tags = appliedTags(slicers);
  if (tags.length === 0) return null;
  return (
    <div className="slicer-tags">
      {tags.map((tag) => (
        <DismissibleTag
          key={tag.id}
          type="gray"
          size="sm"
          text={tag.text}
          tagTitle={tag.text}
          title={`Clear ${tag.text}`}
          onClose={() => clear(tag.id)}
        />
      ))}
    </div>
  );
}
