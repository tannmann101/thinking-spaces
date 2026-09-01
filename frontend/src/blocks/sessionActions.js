// The Session content shape a quick-start action creates -- shared
// between SpacePage.jsx's "Start a Session" button and ProjectPage.jsx's
// own, so the two can't drift on what a freshly-started Session looks
// like. Mirrors NewBlockForm.jsx's own session branch exactly, minus
// the intermediate "type a starting label first" step: a quick-start
// begins running immediately, with a blank label set afterward the same
// click-to-edit way every other label in this app already is.
export function newSessionSpec(properties = {}) {
  return {
    type: 'session',
    content: { label: '', startedAt: new Date().toISOString(), endedAt: null, durationMinutes: null, note: '' },
    properties,
  };
}
