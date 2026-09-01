// THE Block registry. Per CLAUDE.md: "Every Tool ... must be
// registered in one single, readable file ... The point is that the
// person can open one file and see the complete list of what exists."
//
// This is that file. To see every Block type the app supports, look
// here -- not in components, not in the backend, just here. Adding a
// new Block type means adding one entry to `blockRegistry` below.
//
// Two fields exist purely for the Tools catalog page (ToolsPage.jsx):
// `worksWith` names other Tools (by registry key, Block or View) this
// one is meant to be used alongside, and `demoBlock` is a real, id-less
// block object the catalog renders through the same `component` every
// live Space uses -- not a separate mockup. An id-less block naturally
// renders read-only (every Block component treats a missing `id` as
// "not editable"), so the demo is inert without any special-casing.
//
// `workshopComponent` is optional: when present, a Workspace page (see
// WorkspacePage.jsx) renders this instead of the ordinary `component`
// for that Tool -- a bespoke, more spacious environment tailored to
// that specific Tool, per the Workspaces feature. Most Tools don't have
// one yet (each gets its own redesign pass, one at a time, per
// CLAUDE.md's Open section) and just fall back to `component`.
//
// `family` is 'general' (Text, List, Reference, Media, Comparison --
// the original five, no external input needed to add most of them),
// 'work' (Assessment and everything built on the same shared
// skeleton), or 'time' (Milestone, and anything else about a Space's
// own operational timing -- due dates, checkpoints, sessions -- rather
// than its content). It exists so any UI that lists Tools --
// ToolsPage.jsx's catalog, NewBlockForm.jsx's "+ Add Block" dropdown --
// can group by family instead of rendering one flat, registry-order
// list. Added once the app had grown to 15 Block types and both of
// those screens had become hard to scan; adding a new Work (or Time)
// Type only ever needs its `family` set here, nothing else touches
// those UIs.
//
// `icon` is a single restrained text glyph (no emoji) giving each Tool
// its own small visual identity -- a real gap found by auditing the
// Tools catalog and a live Space: every Block type rendered as an
// identical box, and a Work block's own kind (e.g. "Assessment" vs
// "Question") was never actually shown anywhere, only used as
// placeholder-text hinting. `family` still carries the coarse grouping
// (a colored left border on a block row/tool card, via `data-family`);
// `icon` adds the finer, per-type distinction on top of it. Both are
// read centrally -- ToolsPage.jsx's ToolCard, and the block-feed row
// wrapper in SpacePage.jsx/WorkspacePage.jsx -- rather than duplicated
// into every individual Block component.

import TextBlock from '../blocks/TextBlock.jsx';
import TextWorkshop from '../blocks/TextWorkshop.jsx';
import ListBlock from '../blocks/ListBlock.jsx';
import ListWorkshop from '../blocks/ListWorkshop.jsx';
import ReferenceBlock from '../blocks/ReferenceBlock.jsx';
import ReferenceWorkshop from '../blocks/ReferenceWorkshop.jsx';
import MediaBlock from '../blocks/MediaBlock.jsx';
import MediaWorkshop from '../blocks/MediaWorkshop.jsx';
import ComparisonBlock from '../blocks/ComparisonBlock.jsx';
import ComparisonWorkshop from '../blocks/ComparisonWorkshop.jsx';
import AssessmentBlock from '../blocks/AssessmentBlock.jsx';
import QuestionBlock from '../blocks/QuestionBlock.jsx';
import AnalysisBlock from '../blocks/AnalysisBlock.jsx';
import DeductionBlock from '../blocks/DeductionBlock.jsx';
import DefinitionBlock from '../blocks/DefinitionBlock.jsx';
import DemonstrationBlock from '../blocks/DemonstrationBlock.jsx';
import InsightBlock from '../blocks/InsightBlock.jsx';
import ImplicationBlock from '../blocks/ImplicationBlock.jsx';
import HypothesisBlock from '../blocks/HypothesisBlock.jsx';
import ObjectionBlock from '../blocks/ObjectionBlock.jsx';
import FormulationBlock from '../blocks/FormulationBlock.jsx';
import MilestoneBlock from '../blocks/MilestoneBlock.jsx';
import SessionBlock from '../blocks/SessionBlock.jsx';

// Mirrors TEST_SPACE_ID in backend/src/db/queries.js -- the frontend
// and backend are separate bundles, so this can't be a shared import,
// only a matching literal (same reasoning as SKELETON_LANE_LABELS in
// skeleton.js mirroring the backend's SKELETON_LANES).
const TEST_SPACE_ID = 'test-space';

// The only inline attribution tags a Text block's content.tag can hold.
// Exported so any future UI for creating/editing Text blocks reads
// this list instead of redefining it.
export const TEXT_ATTRIBUTION_TAGS = ['quote', 'paraphrase', 'reflection', 'inference'];

// The only values a List item's or Work item's confidence property can
// hold, ordered least- to most-confident. Widened from an original
// 3-level scale (solid/tentative/questioned) to this 5-level one for
// more "surgical" precision -- the original three words are kept as-is
// (so no existing stored value needed migrating), with `moderate` and
// `certain` added to round the scale out.
export const CONFIDENCE_LEVELS = ['questioned', 'tentative', 'moderate', 'solid', 'certain'];

// The only kinds a Media block's content.mediaType can hold. Only
// 'image' actually renders anything yet -- see MediaBlock.jsx.
export const MEDIA_TYPES = ['image', 'audio', 'sketch'];

// A self-contained SVG data URI so the Media demo renders with no
// dependency on external network access -- same trick the seeded demo
// data uses (see backend/src/db/seedTestSpace.js). Colored to match
// the app's own dark palette/type system directly (rather than
// inheriting index.css's variables, which an SVG data URI can't do)
// so the demo doesn't read as an unstyled placeholder dropped into an
// otherwise fully art-directed catalog.
const DEMO_IMAGE_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' width='320' height='180'>" +
  "<rect width='100%' height='100%' fill='#201a1b'/>" +
  "<text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='#6f5c5e' font-family='monospace' font-size='14'>Demo image</text>" +
  '</svg>';
const DEMO_IMAGE_URL = `data:image/svg+xml,${encodeURIComponent(DEMO_IMAGE_SVG)}`;

export const blockRegistry = {
  text: {
    label: 'Writing',
    description:
      'A paragraph, optionally tagged as a quote, paraphrase, reflection, or inference.',
    family: 'general',
    icon: '¶',
    component: TextBlock,
    workshopComponent: TextWorkshop,
    worksWith: ['comparison'],
    demoBlock: {
      type: 'text',
      content: { tag: 'reflection', text: 'A demo paragraph, showing how a Writing entry reads.' },
      properties: {},
    },
  },
  list: {
    label: 'List',
    description:
      'An ordered set of items. Each item can optionally carry a checkbox, a number, a date, or a confidence marker.',
    family: 'general',
    icon: '☰',
    component: ListBlock,
    workshopComponent: ListWorkshop,
    worksWith: ['timeline', 'progress', 'streak', 'ledger'],
    demoBlock: {
      type: 'list',
      content: {
        laneLabel: 'Demo list',
        items: [
          { id: 'demo-1', text: 'Read the primary source', checkbox: true },
          { id: 'demo-2', text: 'Draft an outline', checkbox: false },
        ],
      },
      properties: {},
    },
  },
  reference: {
    label: 'Reference',
    description: 'A link to another Space, with an optional note.',
    family: 'general',
    icon: '→',
    component: ReferenceBlock,
    workshopComponent: ReferenceWorkshop,
    worksWith: ['comparison', 'graph'],
    // Points at the real Test Space so clicking the demo is harmless
    // (and even a little useful) rather than a dead link.
    demoBlock: {
      type: 'reference',
      content: {
        target_space_id: TEST_SPACE_ID,
        targetSpaceTitle: 'Test Space',
        note: 'why this connects',
      },
      properties: {},
    },
  },
  media: {
    label: 'Media',
    description: 'An image, audio clip, or embedded sketch. Only images render for now.',
    family: 'general',
    icon: '▣',
    component: MediaBlock,
    workshopComponent: MediaWorkshop,
    worksWith: [],
    demoBlock: {
      type: 'media',
      content: { mediaType: 'image', url: DEMO_IMAGE_URL, caption: 'A demo caption' },
      properties: {},
    },
  },
  comparison: {
    label: 'Comparison',
    description:
      'Two Writing or Reference entries shown side by side, optionally marked as a contrast.',
    family: 'general',
    icon: '⇄',
    component: ComparisonBlock,
    workshopComponent: ComparisonWorkshop,
    worksWith: ['text', 'reference'],
    demoBlock: {
      type: 'comparison',
      content: {
        left: { kind: 'text', tag: null, text: 'Option A' },
        right: { kind: 'text', tag: null, text: 'Option B' },
        contrast: true,
        contrastNote: 'demo contrast',
      },
      properties: {},
    },
  },
  // "Work": a new kind of Tool, one real, distinct Tool per kind of
  // thinking-act (assess, question, analyze, deduce, define,
  // demonstrate, realize, imply, and whatever follows) rather than a
  // generic block with a label. Every kind shares one underlying shape
  // ({statement, support, confidence} -- see WorkBlock.jsx) so Synthesis
  // can pull from them uniformly, even though each one's two text
  // fields are relabeled for its own kind (Definition is the one
  // exception to "statement = the Tool's own name": its statement
  // holds the term, not a definition-shaped sentence). `support` is a
  // list of discrete points, each either its own short claim or a live
  // link to another existing claim (another Work block, or a Skeleton
  // lane item) -- see WorkBlock.jsx for how a support point resolves.
  // See backend/src/db/queries.js's WORK_TYPES, which must list every
  // type registered here that Synthesis should be able to draw from.
  assessment: {
    label: 'Assessment',
    description: 'A judgment on something, with supporting points and a confidence marker.',
    family: 'work',
    icon: '⚖',
    component: AssessmentBlock,
    worksWith: ['question', 'analysis', 'deduction', 'objection'],
    demoBlock: {
      type: 'assessment',
      content: {
        statement: 'This vendor is not worth the switching cost.',
        support: [{ id: 'demo-1', text: 'Migration effort outweighs the savings within any reasonable payback window.' }],
        confidence: 'tentative',
      },
      properties: {},
    },
  },
  question: {
    label: 'Question',
    description:
      'An open question worth holding onto, with why it matters and a confidence marker for how central it feels.',
    family: 'work',
    icon: '?',
    component: QuestionBlock,
    worksWith: ['assessment', 'definition'],
    demoBlock: {
      type: 'question',
      content: {
        statement: 'Is the switching cost actually reversible?',
        support: [{ id: 'demo-1', text: 'If it is, the risk calculus for this decision changes a lot.' }],
        confidence: 'tentative',
      },
      properties: {},
    },
  },
  analysis: {
    label: 'Analysis',
    description: 'A finding from breaking something down into its parts, with the breakdown and a confidence marker.',
    family: 'work',
    icon: '⊞',
    component: AnalysisBlock,
    worksWith: ['assessment', 'deduction', 'insight'],
    demoBlock: {
      type: 'analysis',
      content: {
        statement: 'The delay is driven by onboarding friction, not price.',
        support: [
          {
            id: 'demo-1',
            text: 'Usage data shows drop-off concentrated in the first setup step, well before anyone reaches the pricing page.',
          },
        ],
        confidence: 'tentative',
      },
      properties: {},
    },
  },
  deduction: {
    label: 'Deduction',
    description:
      'A conclusion reached by explicit reasoning from other claims, with that reasoning and a confidence marker.',
    family: 'work',
    icon: '∴',
    component: DeductionBlock,
    worksWith: ['analysis', 'demonstration', 'implication', 'objection'],
    demoBlock: {
      type: 'deduction',
      content: {
        statement: 'Switching vendors this quarter is not worth it.',
        support: [
          {
            id: 'demo-1',
            text: 'Migration cost exceeds the savings within any window short enough to matter, and the contract already renewed.',
          },
        ],
        confidence: 'tentative',
      },
      properties: {},
    },
  },
  definition: {
    label: 'Definition',
    description: "A term and its meaning, with a confidence marker for how settled the definition feels.",
    family: 'work',
    icon: '≡',
    component: DefinitionBlock,
    worksWith: ['question'],
    demoBlock: {
      type: 'definition',
      content: {
        statement: 'Switching cost',
        support: [
          {
            id: 'demo-1',
            text: 'Everything given up or spent to move from one option to another -- money, time, momentum, and what has to be relearned.',
          },
        ],
        confidence: 'solid',
      },
      properties: {},
    },
  },
  demonstration: {
    label: 'Demonstration',
    description: 'A concrete worked example showing a claim to be true, with the walkthrough and a confidence marker.',
    family: 'work',
    icon: '▶',
    component: DemonstrationBlock,
    worksWith: ['deduction', 'implication', 'hypothesis'],
    demoBlock: {
      type: 'demonstration',
      content: {
        statement: 'The two migration plans really do cost the same over three years.',
        support: [
          { id: 'demo-1', text: 'Plan A: $400/mo x 36 = $14,400.' },
          { id: 'demo-2', text: 'Plan B: $9,000 upfront + $150/mo x 36 = $14,400.' },
        ],
        confidence: 'solid',
      },
      properties: {},
    },
  },
  // Insight and Implication are deliberately the softer, more
  // provisional pair alongside the sharper Assessment/Deduction --
  // most of the rest of the original thinking-verb list (derive, plan,
  // outline, explain, ...) either already maps onto an existing Tool
  // or is a near-duplicate of one of the six built so far; these two
  // were the ones that actually stood on their own.
  insight: {
    label: 'Insight',
    description: 'An unplanned realization, with what led to it and a confidence marker.',
    family: 'work',
    icon: '✦',
    component: InsightBlock,
    worksWith: ['analysis', 'implication'],
    demoBlock: {
      type: 'insight',
      content: {
        statement: 'The complaints were never about the price at all.',
        support: [
          { id: 'demo-1', text: 'Re-reading the support thread, every escalation happened after a setup step, not a billing screen.' },
        ],
        confidence: 'tentative',
      },
      properties: {},
    },
  },
  implication: {
    label: 'Implication',
    description:
      'What seems to follow from something, short of proof -- a softer sibling to Deduction -- with what suggests it and a confidence marker.',
    family: 'work',
    icon: '⇒',
    component: ImplicationBlock,
    worksWith: ['deduction', 'insight'],
    demoBlock: {
      type: 'implication',
      content: {
        statement: 'The team may be understaffed for onboarding, not just support.',
        support: [{ id: 'demo-1', text: 'Onboarding drop-off and slow support responses both spike on the same weeks.' }],
        confidence: 'tentative',
      },
      properties: {},
    },
  },
  // Hypothesis and Objection followed once the support-point/linking
  // structure existed to make them worth adding: a Hypothesis is a
  // claim proposed to test, not yet believed (distinct from
  // Assessment's already-reached judgment), and an Objection is a
  // targeted challenge to another existing claim -- which is exactly
  // what a linked support point is for, so Objection needed no
  // dedicated pointer field of its own to stay consistent with the
  // shared shape every other Work Type uses.
  hypothesis: {
    label: 'Hypothesis',
    description: 'A claim proposed to test, not yet believed, with what would test it and a confidence marker.',
    family: 'work',
    icon: '∼',
    component: HypothesisBlock,
    worksWith: ['assessment', 'demonstration'],
    demoBlock: {
      type: 'hypothesis',
      content: {
        statement: 'Reducing the setup form to three fields would cut onboarding drop-off.',
        support: [{ id: 'demo-1', text: 'A/B test a three-field version against the current seven-field one for two weeks.' }],
        confidence: 'tentative',
      },
      properties: {},
    },
  },
  objection: {
    label: 'Objection',
    description:
      'A specific challenge to another existing claim, with what it challenges (typically a linked claim) and a confidence marker.',
    family: 'work',
    icon: '✕',
    component: ObjectionBlock,
    worksWith: ['assessment', 'deduction'],
    demoBlock: {
      type: 'objection',
      content: {
        statement: 'The contract renewal date assumed in that deduction may already have passed.',
        support: [{ id: 'demo-1', text: 'Worth confirming with billing before treating the deduction as settled.' }],
        confidence: 'tentative',
      },
      properties: {},
    },
  },
  // Problem Formulation, added at the person's request: the stage of
  // thinking that comes before Assessment/Question/Analysis even make
  // sense, because what the phenomenon actually IS hasn't been named
  // yet. A Formulation is derived by reading something (an utterance, a
  // behavior, a stated value, a phenomenon) through a specific
  // interpretive lens rather than observed directly -- see the
  // Skeleton & Tensions section on the Tools catalog page for how a
  // Formulation's own Grounds can link to a claim surfaced by that
  // lens. Lenses themselves (etymology, phenomenology, anthropology,
  // history, epistemology, philosophy, ...) aren't a Block type -- they
  // live as Resources (tag "lens"), so they're reusable across every
  // phenomenon they get applied to rather than retyped fresh each time.
  formulation: {
    label: 'Formulation',
    description:
      'A working claim about what a phenomenon fundamentally is, derived through a specific interpretive lens, with a confidence marker for how settled the framing feels.',
    family: 'work',
    icon: '⊢',
    component: FormulationBlock,
    worksWith: ['question', 'analysis', 'deduction'],
    demoBlock: {
      type: 'formulation',
      content: {
        statement: 'This is fundamentally a status ritual, not a factual claim.',
        support: [{ id: 'demo-1', text: 'Etymology: the word’s root already meant "to display," not "to inform."' }],
        confidence: 'tentative',
      },
      properties: {},
    },
  },
  // "Time": the app's operational timing around a Space's own work --
  // due dates, checkpoints, and (later) sessions -- as real Tools of
  // their own rather than more flavors of List item. Milestone is the
  // first: a checkpoint with a target date and its own reached/not-yet
  // -reached state, distinct from a List item's `reviewBy` (which is
  // about "come back and reconsider this," not "this got done").
  milestone: {
    label: 'Milestone',
    description: 'A checkpoint with a target date and a reached/not-yet-reached state.',
    family: 'time',
    icon: '◆',
    component: MilestoneBlock,
    worksWith: ['list', 'assessment'],
    demoBlock: {
      type: 'milestone',
      content: {
        label: 'Ship the first draft',
        targetDate: '2026-09-15',
        reached: false,
        reachedAt: null,
        note: 'Needs the intro section finished first.',
      },
      properties: {},
    },
  },
  // A Session is one timed sitting of work -- start it, stop it, the
  // elapsed time gets logged. Deliberately one Block per sitting
  // (add another Session block for the next one) rather than a running
  // log inside a single block, same granularity Milestone and Work
  // items already use. startedAt/endedAt are the source of truth (not
  // a client-side ticking number): SessionBlock.jsx derives "elapsed
  // so far" from startedAt on every render, so a running session reads
  // correctly even after the tab was closed and reopened.
  session: {
    label: 'Session',
    description: 'A timed sitting of work -- start it, stop it, and the elapsed time is logged.',
    family: 'time',
    icon: '◷',
    component: SessionBlock,
    worksWith: ['milestone'],
    demoBlock: {
      type: 'session',
      content: {
        label: 'Drafting the intro',
        startedAt: '2026-08-20T14:00:00.000Z',
        endedAt: '2026-08-20T14:45:00.000Z',
        durationMinutes: 45,
        note: '',
      },
      properties: {},
    },
  },
};
