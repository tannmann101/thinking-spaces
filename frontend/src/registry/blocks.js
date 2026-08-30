// THE Block registry. Per CLAUDE.md: "Every Block type ... must be
// registered in one single, readable file ... The point is that the
// person can open one file and see the complete list of what exists."
//
// This is that file. To see every Block type the app supports, look
// here -- not in components, not in the backend, just here. Adding a
// new Block type means adding one entry to `blockRegistry` below.

import TextBlock from '../blocks/TextBlock.jsx';
import ListBlock from '../blocks/ListBlock.jsx';
import ReferenceBlock from '../blocks/ReferenceBlock.jsx';
import MediaBlock from '../blocks/MediaBlock.jsx';
import ComparisonBlock from '../blocks/ComparisonBlock.jsx';

// The only inline attribution tags a Text block's content.tag can hold.
// Exported so any future UI for creating/editing Text blocks (Pass 2
// still, or Dev Mode later) reads this list instead of redefining it.
export const TEXT_ATTRIBUTION_TAGS = ['quote', 'paraphrase', 'reflection', 'inference'];

// The only values a List item's confidence property can hold.
export const CONFIDENCE_LEVELS = ['solid', 'tentative', 'questioned'];

// The only kinds a Media block's content.mediaType can hold. Only
// 'image' actually renders anything yet -- see MediaBlock.jsx.
export const MEDIA_TYPES = ['image', 'audio', 'sketch'];

export const blockRegistry = {
  text: {
    label: 'Text',
    description:
      'A paragraph, optionally tagged as a quote, paraphrase, reflection, or inference.',
    component: TextBlock,
  },
  list: {
    label: 'List',
    description:
      'An ordered set of items. Each item can optionally carry a checkbox, a number, a date, or a confidence marker.',
    component: ListBlock,
  },
  reference: {
    label: 'Reference',
    description: 'A link to another Space, with an optional note.',
    component: ReferenceBlock,
  },
  media: {
    label: 'Media',
    description: 'An image, audio clip, or embedded sketch. Only images render for now.',
    component: MediaBlock,
  },
  comparison: {
    label: 'Comparison',
    description:
      'Two Text or Reference blocks shown side by side, optionally marked as a contrast.',
    component: ComparisonBlock,
  },
};
