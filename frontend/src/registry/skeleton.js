// The Skeleton isn't a Block type -- it's four List blocks (lanes) and
// one Text block (Current Best Articulation), identified by a marker
// in `properties` rather than anything structural. This is the
// frontend's copy of the lane list (labels + order), mirroring
// SKELETON_LANES in the backend's queries.js. Evidence has no
// shorthand trigger; that's defined backend-side since triggers only
// matter for parsing, not display.
export const SKELETON_LANE_LABELS = [
  { key: 'premises', label: 'Premises' },
  { key: 'evidence', label: 'Evidence' },
  { key: 'open-questions', label: 'Open Questions' },
  { key: 'tensions', label: 'Tensions' },
];
