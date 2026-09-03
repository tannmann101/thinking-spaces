// The personalization system: one file naming every look an item can
// take and how a given item's look is decided. Same transparency
// principle as registry/blocks.js and registry/views.js -- open this
// one file and you can see the complete set, rather than hunting for
// styling decisions scattered across components.
//
// Two halves, and the split is the whole point:
//
//   1. A DISTINCT DEFAULT per kind of thing. A Hypothesis does not look
//      like a Milestone, a Resource does not look like a Synthesis, and
//      none of that requires you to have themed anything. This is what
//      makes a busy Space scannable when you've written all of it
//      yourself and still can't tell the pieces apart.
//   2. A MANUAL OVERRIDE on any individual item, stored as
//      `spaces.theme` / a block's `properties.theme`. Any subset of the
//      four dimensions; whatever you don't set keeps the default. This
//      is what lets one particular Space become its own place rather
//      than just another instance of its type.
//
// Nothing here touches the database -- the defaults are a rendering
// concern, so the backend stores only the override and this file
// resolves the rest at render time.

// ---------- The four dimensions ----------

// Hues are palette-constrained on purpose: an open color picker would
// let the app drift out of its own matte-black/oxblood identity within
// a week. These ten all sit at a similar weight against the dark ground
// so no item screams louder than another purely by hue. Each maps to a
// --theme-accent-* custom property in index.css.
export const THEME_ACCENTS = [
  'neutral',
  'maroon',
  'rust',
  'clay',
  'gold',
  'amber',
  'teal',
  'slate',
  'plum',
  'moss',
  'indigo',
];

// The silhouette -- how an item's edge is drawn. This is the strongest
// at-a-glance differentiator (much stronger than hue, which the eye
// groups rather than distinguishes), so it carries the per-type
// distinction while accent carries the coarser family reading.
export const THEME_SHAPES = [
  'plain', // a left stripe -- the app's long-standing default
  'slab', // a heavier left bar
  'bracket', // left stripe plus a top rule, forming an L
  'rule', // a top rule only, no left edge
  'notch', // a clipped top-left corner
  'inset', // a full hairline frame, indented
  'underline', // a bottom rule only
  'tab', // a small tab above the top-left corner
];

// How much room the item's content gets to breathe.
export const THEME_DENSITIES = ['compact', 'normal', 'roomy'];

// Which of the app's three existing faces the item's own text uses --
// no new fonts, just deliberate assignment of the ones already loaded.
export const THEME_TYPEFACES = ['body', 'display', 'mono'];

// Human labels for the picker UI, so it doesn't show raw keys.
export const THEME_DIMENSIONS = [
  { key: 'accent', label: 'Color', options: THEME_ACCENTS },
  { key: 'shape', label: 'Shape', options: THEME_SHAPES },
  { key: 'density', label: 'Density', options: THEME_DENSITIES },
  { key: 'typeface', label: 'Type', options: THEME_TYPEFACES },
];

// ---------- Distinct defaults ----------

// Accent carries the family (so the general/work/time reading built in
// the professionalism pass survives), shape carries the specific type.
// Every (accent, shape) pair below is unique, which is what guarantees
// no two Tool types render identically before anyone themes anything.
const BLOCK_THEME_DEFAULTS = {
  // General -- cool and neutral hues, the unmarked foundational family.
  text: { accent: 'neutral', shape: 'plain', density: 'roomy', typeface: 'body' },
  list: { accent: 'slate', shape: 'rule', density: 'normal', typeface: 'body' },
  reference: { accent: 'teal', shape: 'bracket', density: 'compact', typeface: 'body' },
  media: { accent: 'moss', shape: 'notch', density: 'normal', typeface: 'body' },
  comparison: { accent: 'plum', shape: 'inset', density: 'normal', typeface: 'body' },

  // Work -- the warm red range, the app's own primary color, since Work
  // is literally what this app is for.
  assessment: { accent: 'maroon', shape: 'slab', density: 'normal', typeface: 'body' },
  question: { accent: 'maroon', shape: 'bracket', density: 'normal', typeface: 'body' },
  analysis: { accent: 'maroon', shape: 'rule', density: 'normal', typeface: 'body' },
  objection: { accent: 'maroon', shape: 'notch', density: 'normal', typeface: 'body' },
  deduction: { accent: 'rust', shape: 'slab', density: 'normal', typeface: 'body' },
  definition: { accent: 'rust', shape: 'inset', density: 'compact', typeface: 'body' },
  demonstration: { accent: 'rust', shape: 'bracket', density: 'roomy', typeface: 'body' },
  formulation: { accent: 'rust', shape: 'tab', density: 'roomy', typeface: 'body' },
  insight: { accent: 'clay', shape: 'notch', density: 'normal', typeface: 'body' },
  implication: { accent: 'clay', shape: 'tab', density: 'normal', typeface: 'body' },
  hypothesis: { accent: 'clay', shape: 'underline', density: 'normal', typeface: 'body' },

  // Mapping -- one cool blue-violet, since three types fit inside a
  // single accent and shape can carry all the distinction they need.
  wordEvolution: { accent: 'indigo', shape: 'rule', density: 'normal', typeface: 'body' },
  conceptMap: { accent: 'indigo', shape: 'inset', density: 'normal', typeface: 'body' },
  model: { accent: 'indigo', shape: 'bracket', density: 'normal', typeface: 'body' },

  // Time -- the gold range already reserved for reached/running states,
  // and mono, since these two read as instruments rather than prose.
  milestone: { accent: 'gold', shape: 'slab', density: 'compact', typeface: 'mono' },
  session: { accent: 'amber', shape: 'tab', density: 'compact', typeface: 'mono' },
};

// The fallback for a block type with no entry above -- a genuinely
// unknown type, which shouldn't happen but shouldn't crash either.
const FALLBACK_BLOCK_THEME = { accent: 'neutral', shape: 'plain', density: 'normal', typeface: 'body' };

// A Space's own default comes from what kind of Space it is. These are
// tags rather than a column (see the Resources/Synthesis vocabulary
// entries in CLAUDE.md), checked in priority order -- a promoted
// Synthesis carries both 'synthesis' and 'resource', and should keep
// reading as the Synthesis it actually is.
const SPACE_THEME_BY_TAG = [
  ['synthesis', { accent: 'plum', shape: 'inset', density: 'roomy', typeface: 'display' }],
  ['resource', { accent: 'teal', shape: 'bracket', density: 'normal', typeface: 'body' }],
  ['relational', { accent: 'slate', shape: 'rule', density: 'normal', typeface: 'body' }],
];

const DEFAULT_SPACE_THEME = { accent: 'neutral', shape: 'plain', density: 'normal', typeface: 'display' };

// ---------- Resolution ----------

// Drops any key the override left unset (or set to a value this app
// doesn't know how to draw), so a stale or partial override can never
// produce an item with no shape at all.
function validOverride(override) {
  if (!override) return {};
  const clean = {};
  THEME_DIMENSIONS.forEach(({ key, options }) => {
    if (options.includes(override[key])) clean[key] = override[key];
  });
  return clean;
}

export function defaultBlockTheme(type) {
  return BLOCK_THEME_DEFAULTS[type] || FALLBACK_BLOCK_THEME;
}

export function defaultSpaceTheme(space) {
  const tags = space?.tags || [];
  const match = SPACE_THEME_BY_TAG.find(([tag]) => tags.includes(tag));
  return match ? match[1] : DEFAULT_SPACE_THEME;
}

export function resolveBlockTheme(block) {
  return { ...defaultBlockTheme(block?.type), ...validOverride(block?.properties?.theme) };
}

export function resolveSpaceTheme(space) {
  return { ...defaultSpaceTheme(space), ...validOverride(space?.theme) };
}

// Spread onto any JSX element to actually apply a resolved theme -- the
// CSS in index.css keys entirely off these four data attributes, so no
// component needs to know what a given accent or shape looks like.
export function themeAttributes(theme) {
  return {
    'data-theme-accent': theme.accent,
    'data-theme-shape': theme.shape,
    'data-theme-density': theme.density,
    'data-theme-typeface': theme.typeface,
  };
}
