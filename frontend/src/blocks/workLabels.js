// What a Work entry calls its two fields.
//
// There used to be eleven Work Types -- Assessment, Question, Analysis,
// Deduction, Definition, Demonstration, Insight, Implication,
// Hypothesis, Objection, Formulation -- each a real registered Tool
// with its own file, all eleven of them a two-line wrapper around
// WorkBlock that named these same two labels and passed everything
// else through. Choosing between them at the moment of capture turned
// out to cost more than the distinction was worth (an entire "Compare
// Work Types" panel existed purely to make the choice survivable),
// so there is one Tool now: Claim, with the kind as an optional label
// you can set afterwards, or leave off.
//
// The ten retired names stay here, and stay out of the picker, for one
// reason: entries already written as one of them must keep rendering
// exactly as they did. This is the whole of what those eleven files
// contained, so nothing was lost by deleting them.
export const WORK_LABELS = {
  claim: { statement: 'Claim', support: 'Support' },
  assessment: { statement: 'Assessment', support: 'Rationale' },
  question: { statement: 'Question', support: 'Why this matters' },
  analysis: { statement: 'Analysis', support: 'Breakdown' },
  deduction: { statement: 'Deduction', support: 'Reasoning' },
  definition: { statement: 'Term', support: 'Definition' },
  demonstration: { statement: 'Demonstration', support: 'Walkthrough' },
  insight: { statement: 'Insight', support: 'What led to it' },
  implication: { statement: 'Implication', support: 'What suggests it' },
  hypothesis: { statement: 'Hypothesis', support: 'What would test this' },
  objection: { statement: 'Objection', support: 'What this challenges' },
  formulation: { statement: 'Formulation', support: 'Grounds' },
};

// The optional kind label on a Claim. Suggestions, not a fixed list --
// the field is free text, so this is a shortcut rather than a limit.
// Deliberately the same names the retired Types had, since those were
// good names for kinds of thinking; they were only bad as eleven
// separate Tools you had to pick between before you could write.
export const CLAIM_KIND_SUGGESTIONS = [
  'assessment',
  'question',
  'hypothesis',
  'formulation',
  'objection',
  'definition',
];

export function labelsFor(type) {
  return WORK_LABELS[type] || WORK_LABELS.claim;
}
