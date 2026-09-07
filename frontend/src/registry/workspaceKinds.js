// The Workspace Kinds registry -- the one file to open to see every
// specialized thinking environment this app offers, in the same spirit
// as registry/blocks.js and registry/views.js.
//
// A Kind is close to a Template, and deliberately narrower than it once
// was. It gives a Workspace its name, its own look, the Tools it starts
// you with, and the Tools its picker leads with -- so an Etymology
// Workspace doesn't look identical to an Analyst one the moment you
// create it.
//
// It used to do more: each kind named a set of page sections and sorted
// entries into them by Tool type. That stopped working the day the
// eleven Work Types became one Claim -- a section's sorting key became
// a Claim's optional `kind` label, which nothing prompts you to set, so
// every entry you added by hand fell straight through into "Also here".
// The sections were also, on inspection, the eleven Work Types wearing
// headings: exactly the taxonomy that had just been removed for making
// you classify a thought before you could write it down. So they went
// too, rather than being repaired back into existence.
//
// This lives in the frontend, not a database table, for two reasons. A
// kind carries page layout and framing copy, which a row can't hold; and
// nothing here is meant to be edited from inside the running app, unlike
// Templates and Resource Templates, which the person explicitly asked to
// be able to modify. The backend stores only which kind a Workspace is
// (workspaces.kind) and never reads this file.
//
// Each kind:
//   key           the value stored in workspaces.kind
//   label         what it's called on screen
//   icon          one restrained glyph, no emoji, same rule as Tools
//   description   what this environment is for, shown in the catalog
//   theme         its own look, resolved the same way any item's is
//   leadTools     the Tool types the add-a-Tool picker leads with
//   starterBlocks what a brand-new Workspace of this kind begins with
//
// Nothing here forbids a Tool: a kind leads, it never restricts. Any
// Tool can go into any Workspace, and they all read in one feed.

// Starter-block helpers. A starter block is an ordinary block spec, the
// same shape NewBlockForm builds and createWorkspace accepts.
const writing = (text) => ({ type: 'text', content: { tag: null, text } });
const checklist = (laneLabel, items) => ({
  type: 'list',
  content: {
    laneLabel,
    items: items.map((text) => ({ id: crypto.randomUUID(), text, done: false })),
  },
});
// A Claim this kind starts you with, carrying the label for the sort of
// claim it is -- an ordinary Claim, just not a blank one.
const claim = (kind, statement) => ({
  type: 'claim',
  content: { statement, kind, support: [], confidence: 'tentative' },
});

export const workspaceKindRegistry = {
  analyst: {
    key: 'analyst',
    label: 'Analyst',
    icon: '⊿',
    description:
      'Deep analytical reasoning: break something into its parts, follow what each implies, and test the chain for where it actually holds.',
    theme: { accent: 'maroon', shape: 'bracket', density: 'normal', typeface: 'body' },
    leadTools: ['claim'],
    starterBlocks: [
      writing(''),
      claim('analysis', ''),
      claim('objection', ''),
    ],
  },

  etymology: {
    key: 'etymology',
    label: 'Etymology',
    icon: '⟿',
    description:
      "Track how a word's sense moved over time, and what carried it — the history behind a term you keep using.",
    theme: { accent: 'indigo', shape: 'rule', density: 'normal', typeface: 'body' },
    leadTools: ['wordEvolution', 'conceptMap', 'reference', 'claim'],
    starterBlocks: [{ type: 'wordEvolution', content: { term: '', senses: [] } }, writing('')],
  },

  worldview: {
    key: 'worldview',
    label: 'Worldview Assessment',
    icon: '◉',
    description:
      'Work out what somebody must be holding for their view to make sense — across metaphysics, ethics and epistemology.',
    theme: { accent: 'plum', shape: 'inset', density: 'roomy', typeface: 'body' },
    leadTools: ['claim', 'model'],
    starterBlocks: [
      writing(''),
      claim('formulation', 'Metaphysics — what they take reality to be'),
      claim('formulation', 'Ethics — what they take the good to be'),
      claim('formulation', 'Epistemology — what they take knowing to be'),
    ],
  },

  critical: {
    key: 'critical',
    label: 'Critical Thinking',
    icon: '⚖',
    description:
      'Critique, not accusation: state the position at its strongest first, then work out precisely where it gives way.',
    theme: { accent: 'clay', shape: 'slab', density: 'normal', typeface: 'body' },
    leadTools: ['claim'],
    starterBlocks: [
      writing('Steelman: state the position as its best defender would put it.'),
      claim('objection', ''),
      claim('assessment', ''),
    ],
  },

  formulation: {
    key: 'formulation',
    label: 'Problem Formulation',
    icon: '⊢',
    description:
      'Name what a phenomenon actually is, read through a chosen lens, before trying to solve or judge it.',
    theme: { accent: 'rust', shape: 'tab', density: 'roomy', typeface: 'body' },
    leadTools: ['claim', 'conceptMap'],
    starterBlocks: [
      writing(''),
      checklist('Lenses to consider', [
        'Phenomenology',
        'Philosophy',
        'History',
        'Etymology',
        'Anthropology',
        'Epistemology',
      ]),
      claim('formulation', ''),
    ],
  },

  modeling: {
    key: 'modeling',
    label: 'Modeling',
    icon: '⬡',
    description:
      'Lay a worldview, a philosophy or a concept out as structure — the parts it is built from and how they hold each other up.',
    theme: { accent: 'indigo', shape: 'bracket', density: 'normal', typeface: 'body' },
    leadTools: ['model', 'conceptMap', 'claim'],
    starterBlocks: [
      { type: 'model', content: { subject: '', components: [], relations: [] } },
      writing(''),
    ],
  },

  conceptualize: {
    key: 'conceptualize',
    label: 'Conceptualize',
    icon: '◇',
    description:
      'Work a conception into clarity: what it includes, what it excludes, and what it keeps getting confused with.',
    theme: { accent: 'teal', shape: 'notch', density: 'roomy', typeface: 'body' },
    leadTools: ['claim', 'conceptMap', 'comparison'],
    starterBlocks: [
      claim('definition', ''),
      checklist('Cases', ['Clearly inside:', 'Clearly outside:', 'On the edge:']),
    ],
  },

  wordconcept: {
    key: 'wordconcept',
    label: 'Word-Concept Mapping',
    icon: '◈',
    description:
      'Track a referent and everything that references it, so you can see where a misunderstanding is arising in the language rather than in the thing.',
    theme: { accent: 'indigo', shape: 'inset', density: 'normal', typeface: 'body' },
    leadTools: ['conceptMap', 'wordEvolution', 'claim', 'comparison'],
    starterBlocks: [
      { type: 'conceptMap', content: { referent: '', gloss: '', renderings: [] } },
      writing(''),
    ],
  },
};

// A stable order for the catalog. Object key order would work today, but
// naming it means adding a kind never silently reshuffles the page.
export const WORKSPACE_KIND_ORDER = [
  'analyst',
  'critical',
  'formulation',
  'conceptualize',
  'worldview',
  'modeling',
  'etymology',
  'wordconcept',
];

export function getWorkspaceKind(key) {
  return key ? workspaceKindRegistry[key] || null : null;
}

