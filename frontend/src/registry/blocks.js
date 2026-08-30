// THE Block registry. Per CLAUDE.md: "Every Block type ... must be
// registered in one single, readable file ... The point is that the
// person can open one file and see the complete list of what exists."
//
// This is that file. To see every Block type the app supports, look
// here -- not in components, not in the backend, just here. Adding a
// new Block type means adding one entry to `blockRegistry` below.

import TextBlock from '../blocks/TextBlock.jsx';

// The only inline attribution tags a Text block's content.tag can hold.
// Exported so any future UI for creating/editing Text blocks (Pass 2
// still, or Dev Mode later) reads this list instead of redefining it.
export const TEXT_ATTRIBUTION_TAGS = ['quote', 'paraphrase', 'reflection', 'inference'];

export const blockRegistry = {
  text: {
    label: 'Text',
    description:
      'A paragraph, optionally tagged as a quote, paraphrase, reflection, or inference.',
    component: TextBlock,
  },
};
