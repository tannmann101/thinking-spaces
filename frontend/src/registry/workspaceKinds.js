// The Workspace Kinds registry -- the one file to open to see every
// specialized thinking environment this app offers, in the same spirit
// as registry/blocks.js and registry/views.js.
//
// A Kind is not a Template. A Space Template seeds an arrangement and
// then lets go; a Kind keeps shaping its Workspace for as long as it
// exists -- it names the page's sections, frames each one with a
// question, and leads the Tool picker with the Tools that kind is
// actually built around. That difference is the whole point: without it
// an Etymology Workspace would look identical to an Analyst one the
// moment you finished creating it.
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
//   sections      named groups the Workspace page renders, each with a
//                 framing prompt and the Tool types that belong in it
//   leadTools     the Tool types the add-a-Tool picker leads with
//   starterBlocks what a brand-new Workspace of this kind begins with
//
// A block whose type matches no section falls into a final "Also here"
// group rather than disappearing -- see WorkspacePage.jsx. Nothing here
// forbids a Tool: a kind leads and arranges, it never restricts.

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
const work = (type, statement) => ({
  type,
  content: { statement, support: [], confidence: 'tentative' },
});

export const workspaceKindRegistry = {
  analyst: {
    key: 'analyst',
    label: 'Analyst',
    icon: '⊿',
    description:
      'Deep analytical reasoning: break something into its parts, follow what each implies, and test the chain for where it actually holds.',
    theme: { accent: 'maroon', shape: 'bracket', density: 'normal', typeface: 'body' },
    leadTools: ['analysis', 'deduction', 'implication', 'objection', 'hypothesis', 'insight'],
    sections: [
      {
        name: 'What is in front of you',
        prompt: 'State the material plainly before reasoning about it -- notes, quotes, observations.',
        types: ['text', 'list', 'media', 'reference'],
      },
      {
        name: 'Reasoning',
        prompt: 'Break it down, and follow what each part actually entails.',
        types: ['analysis', 'deduction', 'implication', 'insight'],
      },
      {
        name: 'Where it might fail',
        prompt: 'What would have to be true for this to be wrong? Put the strongest version of that here.',
        types: ['objection', 'hypothesis', 'question'],
      },
    ],
    starterBlocks: [
      writing(''),
      work('analysis', ''),
      work('objection', ''),
    ],
  },

  etymology: {
    key: 'etymology',
    label: 'Etymology',
    icon: '⟿',
    description:
      "Track how a word's sense moved over time, and what carried it -- the history behind a term you keep using.",
    theme: { accent: 'indigo', shape: 'rule', density: 'normal', typeface: 'body' },
    leadTools: ['wordEvolution', 'conceptMap', 'reference', 'definition'],
    sections: [
      {
        name: 'The word itself',
        prompt: 'Each stage: when it held, what it meant then, and what moved it.',
        types: ['wordEvolution', 'text'],
      },
      {
        name: 'Where it lands now',
        prompt: 'What the term is taken to mean today, and how far that sits from where it started.',
        types: ['conceptMap', 'definition'],
      },
      {
        name: 'Sources',
        prompt: 'Dictionaries, texts, and whoever you are taking this history from.',
        types: ['reference', 'media', 'list'],
      },
    ],
    starterBlocks: [{ type: 'wordEvolution', content: { term: '', senses: [] } }, writing('')],
  },

  worldview: {
    key: 'worldview',
    label: 'Worldview Assessment',
    icon: '◉',
    description:
      'Work out what somebody must be holding for their view to make sense -- across metaphysics, ethics and epistemology.',
    theme: { accent: 'plum', shape: 'inset', density: 'roomy', typeface: 'body' },
    leadTools: ['formulation', 'model', 'assessment', 'question'],
    sections: [
      {
        name: 'What was actually said or done',
        prompt: 'The utterance, behaviour or stated value you are reading. Record it before interpreting it.',
        types: ['text', 'media', 'reference'],
      },
      {
        name: 'What must be held',
        prompt:
          'What must this person be holding to such that this is how they are seeing the world? One formulation per axis.',
        types: ['formulation', 'model'],
      },
      {
        name: 'Reading it',
        prompt: 'Where the view hangs together, where it strains, and what you are still unsure of.',
        types: ['assessment', 'question', 'objection', 'insight'],
      },
    ],
    starterBlocks: [
      writing(''),
      work('formulation', 'Metaphysics -- what they take reality to be'),
      work('formulation', 'Ethics -- what they take the good to be'),
      work('formulation', 'Epistemology -- what they take knowing to be'),
    ],
  },

  critical: {
    key: 'critical',
    label: 'Critical Thinking',
    icon: '⚖',
    description:
      'Critique, not accusation: state the position at its strongest first, then work out precisely where it gives way.',
    theme: { accent: 'clay', shape: 'slab', density: 'normal', typeface: 'body' },
    leadTools: ['objection', 'assessment', 'hypothesis', 'question', 'deduction'],
    sections: [
      {
        name: 'The position, at its strongest',
        prompt:
          'Put it the way its best defender would. If you cannot state it so they would recognise it, the critique is premature.',
        types: ['text', 'definition', 'reference'],
      },
      {
        name: 'Where it gives way',
        prompt: 'The specific joint that fails -- not the person, and not the conclusion you dislike.',
        types: ['objection', 'deduction', 'analysis', 'question', 'hypothesis'],
      },
      {
        name: 'What survives',
        prompt: 'What still stands after the critique. This is the part worth keeping.',
        types: ['assessment', 'insight', 'implication'],
      },
    ],
    starterBlocks: [
      writing('Steelman: state the position as its best defender would put it.'),
      work('objection', ''),
      work('assessment', ''),
    ],
  },

  formulation: {
    key: 'formulation',
    label: 'Problem Formulation',
    icon: '⊢',
    description:
      'Name what a phenomenon actually is, read through a chosen lens, before trying to solve or judge it.',
    theme: { accent: 'rust', shape: 'tab', density: 'roomy', typeface: 'body' },
    leadTools: ['formulation', 'question', 'conceptMap', 'definition'],
    sections: [
      {
        name: 'The phenomenon',
        prompt: 'Describe what is showing up, as closely as you can, before naming what it is.',
        types: ['text', 'media', 'list'],
      },
      {
        name: 'Lenses applied',
        prompt:
          'Which reading disciplines you are bringing -- etymology, phenomenology, history, and the rest. Link each to its own Resource.',
        types: ['reference', 'list'],
      },
      {
        name: 'Formulations',
        prompt: 'What this fundamentally is, derived through each lens. One per reading.',
        types: ['formulation', 'definition', 'conceptMap'],
      },
      {
        name: 'Still open',
        prompt: 'What the formulation has not settled.',
        types: ['question', 'hypothesis'],
      },
    ],
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
      work('formulation', ''),
    ],
  },

  modeling: {
    key: 'modeling',
    label: 'Modeling',
    icon: '⬡',
    description:
      'Lay a worldview, a philosophy or a concept out as structure -- the parts it is built from and how they hold each other up.',
    theme: { accent: 'indigo', shape: 'bracket', density: 'normal', typeface: 'body' },
    leadTools: ['model', 'conceptMap', 'formulation', 'hypothesis'],
    sections: [
      {
        name: 'The model',
        prompt: 'The components, and the relations between them.',
        types: ['model', 'conceptMap', 'text'],
      },
      {
        name: 'What it rests on',
        prompt: 'The load-bearing assumptions. If one of these fails, what else falls with it?',
        types: ['formulation', 'hypothesis', 'deduction'],
      },
      {
        name: 'Testing it',
        prompt: 'Where the model predicts something you can actually check.',
        types: ['question', 'objection', 'assessment'],
      },
    ],
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
    leadTools: ['definition', 'conceptMap', 'comparison', 'formulation'],
    sections: [
      {
        name: 'Working definition',
        prompt: 'The current best statement of what this is. Expect to rewrite it.',
        types: ['definition', 'formulation'],
      },
      {
        name: 'What it is not',
        prompt: 'The near neighbours it gets collapsed into. Naming these is half the clarity.',
        types: ['comparison', 'conceptMap'],
      },
      {
        name: 'Cases',
        prompt: 'Instances that clearly fall inside, clearly fall outside, and sit right on the edge.',
        types: ['list', 'text', 'demonstration'],
      },
    ],
    starterBlocks: [
      work('definition', ''),
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
    leadTools: ['conceptMap', 'wordEvolution', 'definition', 'comparison'],
    sections: [
      {
        name: 'The referent and its renderings',
        prompt:
          'What is actually being referred to, and every way it gets named -- each marked by how far it sits from the thing itself.',
        types: ['conceptMap'],
      },
      {
        name: 'How the words got here',
        prompt: 'Where the renderings came from. A sense-shift often explains a disagreement entirely.',
        types: ['wordEvolution', 'definition'],
      },
      {
        name: 'The misunderstanding',
        prompt: 'State the confusion itself: who means what, and at which point the two stop pointing at the same thing.',
        types: ['text', 'comparison', 'assessment'],
      },
    ],
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

// Groups a Workspace's blocks into its kind's sections. A block lands in
// the first section whose types include it; anything left over goes to a
// final "Also here" group, so pulling an unexpected Tool into a kinded
// Workspace can never make it vanish.
//
// Returns null for an unkinded Workspace, which the page renders as the
// plain flat feed it has always been.
export function groupBlocksByKindSection(kind, blocks) {
  if (!kind) return null;
  const taken = new Set();
  const groups = kind.sections.map((section) => {
    const members = blocks.filter((block) => {
      if (taken.has(block.id)) return false;
      if (!section.types.includes(block.type)) return false;
      taken.add(block.id);
      return true;
    });
    return { ...section, blocks: members };
  });

  const leftover = blocks.filter((block) => !taken.has(block.id));
  if (leftover.length > 0) {
    groups.push({
      name: 'Also here',
      prompt: 'Pulled into this Workspace, but not part of one of its own sections.',
      types: [],
      blocks: leftover,
    });
  }
  return groups;
}
