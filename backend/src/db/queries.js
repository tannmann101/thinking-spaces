// The single set of query functions every route is expected to go
// through, per CLAUDE.md: "Keep all cross-Space queries ... going
// through a small, consistent set of query functions rather than ad hoc
// SQL sprinkled around." Route handlers should never write raw SQL --
// if a route needs a new query, it gets added here, not inline.
//
// This file itself is a barrel: the actual query logic lives in
// backend/src/db/queries/*.js, one module per conceptual section of the
// app (spaces, blocks, workspaces, projects, skeleton, trail, review,
// work, insights, reports, the Log, Dashboard aggregations), mirroring the
// same "--- Section ---" divisions this file used to have internally
// when it was a single ~1,800-line file. Splitting it this way keeps
// CLAUDE.md's Transparency principle intact rather than breaking it:
// this remains the one recognizable, importable entry point every route
// already knows ("from '../db/queries.js'"), so nothing outside this
// directory needed to change -- but the actual reading/writing of any
// one concern (Spaces, Blocks, Skeleton, ...) now lives in its own
// small, readable file instead of all of them sharing one increasingly
// hard-to-scan one. See each queries/*.js file's own header comment for
// why it's shaped the way it is.
export * from './queries/constants.js';
export * from './queries/spaces.js';
export * from './queries/templates.js';
export * from './queries/blocks.js';
export * from './queries/workspaces.js';
export * from './queries/projects.js';
export * from './queries/skeleton.js';
export * from './queries/trail.js';
export * from './queries/review.js';
export * from './queries/work.js';
export * from './queries/log.js';
export * from './queries/insights.js';
export * from './queries/reports.js';
export * from './queries/dashboard.js';
