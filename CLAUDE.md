# CLAUDE.md \u2014 Thinking Spaces

## What this is
A personal, single-user thinking workshop app. Each train of thought (a concept, theory, plan, assessment) becomes a "Space" \u2014 a revisitable, evolving place, not a static note. Spaces can hold different kinds of content depending on what they're for, can reference each other, and the whole system should feel alive and buildable-on-itself over time. This is being built for one person's own use, not as a product.

## Non-negotiable working method
This project has a specific failure mode to avoid: past attempts sent one big prompt, got a rough MVP back, then spent a long time fighting it in frustrating, unreviewable tinkering. That is not how this build happens. Instead:

- **Work in small, reviewed slices.** Finish one coherent piece, then stop and explain in plain language what was built and why, before continuing.
- **Confirm scope before starting any new pass or major piece of work.** Restate your understanding of what's being asked; don't assume and run.
- **No black boxes.** The person directing this project is not writing the code themselves. Every feature needs to be legible to a non-implementer: centralize things that would otherwise be scattered (a single registry file for block types, a single registry file for views \u2014 see Architecture below), comment intent not just mechanics, and avoid clever abstractions that hide what's actually happening.
- **Favor boring, readable code over clever code.** This is a solo-maintained personal project, not a codebase optimized for a team.
- **Don't build ahead of the current pass** (see Roadmap) without explicit go-ahead, even if the next piece seems obvious or easy.

## Current phase
**Pass 1: Dashboard, Creation Mode, Test Space.** Do not start Pass 2 work until this is confirmed done.

## Tech stack
React + Vite (frontend), Node/Express + SQLite (backend). This matches the person's other personal apps (a household finance tracker, a household-management app called Secretary) \u2014 consistency across their own tools matters more than any particular technical advantage.

## Target architecture: the Substrate

Earlier design exploration produced a much heavier architecture (separate registries for Space Types, a pluggable Tool Library with its own module contracts, a Resource layer with buildable facet schemas, a live-cascading Dev Mode, and a distinct Relational Space entity). **That heavier version is not what gets built.** It was deliberately collapsed into a simpler substrate that produces the same result with far less machinery:

- **Blocks** \u2014 the only content primitives: `Text` (paragraphs, with optional inline attribution tags: quote / paraphrase / reflection / inference), `List` (items, each optionally carrying a checkbox, a number, a date, or a confidence marker), `Reference` (a link to another Space, with an optional note), `Media` (image/audio/embedded sketch), `Comparison` (two Text or Reference blocks, paired side by side)
- **Properties** \u2014 a few optional attributes: a Space has a `status` (nascent / developing / mature / dormant); List items can carry a checkbox, number, date, or confidence value
- **Views** \u2014 generic renderers computed over blocks that share a property, not separate registered tools: `Timeline` (List items with a date), `Progress` (List items with a checkbox), `Streak` (a daily checkbox List, calendar-rendered), `Ledger` (List items with a number, running total), `Graph` (every Reference block across every Space \u2014 this is "the Map")
- **Templates** replace "Space Types" \u2014 a Template is just a named, saved starting arrangement of blocks. Applying one is a one-time copy, not a live link. Editing an existing Space later is never a separate "mode" \u2014 it's the same block-editing gesture as any other edit.
- **Backlinks** replace the "Relational Map" as a modeled entity \u2014 computed automatically from Reference blocks, not stored as a separate graph structure. A "Relational Space" is not a distinct schema; it's literally just a Space whose content references two or more other Spaces.

If the person mentions specific names from earlier brainstorming (Skeleton, Trail, Tension Resolver, Argument Map, Habit Streak, etc.), map them onto this substrate rather than building them as separate systems:
- Skeleton lanes \u2192 List blocks (one per lane), confidence as a per-item property
- Trail \u2192 automatic block-edit timestamps, rendered via a Timeline view scoped to one Space
- Tension Resolver \u2192 not a tool; two Text blocks (the conflicting statements) plus one more Text block (crux + synthesis) \u2014 at most a guided Template for assembling this fast
- Argument Map \u2192 a Graph view scoped to one Space's Reference blocks
- Citation Tracker \u2192 a List block whose items carry a Reference property
- Milestone Tracker / Habit Streak / Ledger Snippet \u2192 Progress / Streak / Ledger views over a List block

## Visual direction (later, not now)
There's an intended eventual look \u2014 codenamed "The Herbarium": a vellum/ink color palette, a serif display face paired with a monospace utility face, and an organic branching glyph as the visual identity signature for each Space (computed from status, reference count, and resolved tensions \u2014 not decorative). **Do not implement this styling during the functional build passes.** Use plain, legible, unstyled-but-clean UI (system fonts, minimal color) until the functional skeleton works end to end across all five passes. Visual polish is its own future pass, not something to interleave now.

## Data model, starting point
Keep this simple and indexable from the start \u2014 it's the foundation every later Dashboard metric queries against:
- `spaces` \u2014 id, title, template_id (nullable), status, created_at, updated_at
- `blocks` \u2014 id, space_id, type, content (JSON), properties (JSON), position, created_at, updated_at
- `templates` \u2014 id, name, block_arrangement (JSON)
- References are just blocks of type `reference` with a `target_space_id` in their content \u2014 index that column, since backlinks and the Graph view both query it constantly.

Propose refinements to this if something better fits once real building starts \u2014 it's a starting point, not gospel.

## Build roadmap \u2014 five passes, in order

1. **Dashboard, Creation Mode, Test Space** \u2014 a minimal Dashboard (list of Spaces + a way to create one), a Creation flow (name a Space, pick a Template or start blank), and one specific "Test Space" whose explicit purpose is being a scratch area for Pass 2 (not real content).
2. **Tools & Resources** \u2014 implement each Block type and each View, one at a time, testing/demoing each directly inside the Test Space before moving to the next. This is also where the Resource concept gets proven out (a Resource is just a Space tagged accordingly, referenced from elsewhere via a Reference block).
3. **Real Spaces, configured** \u2014 build actual Templates for the real Space types that came out of earlier design work (an inquiry/analytical type, a technical/practical type, a life-management type, a person-reflection type, a creative type), each just a named starter block arrangement using the tools proven out in Pass 2.
4. **Dev Mode** \u2014 in this architecture, this means: a clean UI for creating/editing/saving Templates, and making sure adding/removing/rearranging blocks on an already-live Space feels safe and ordinary, never like a separate risky mode.
5. **Relational Map** \u2014 the Graph view across all Spaces (computed from Reference blocks), plus the ability to select several Spaces and spin up a new Space seeded with References to all of them (a "Relational Space"), with a way to zoom into any one member Space and a clear way back.

## Transparency / indexability requirement
Every Block type and every View must be registered in one single, readable file each (e.g. `src/registry/blocks.ts`, `src/registry/views.ts`) \u2014 never scattered across the codebase. The point is that the person can open one file and see the complete list of what exists. Keep all cross-Space queries (counts, status distribution, backlink lookups) going through a small, consistent set of query functions rather than ad hoc SQL sprinkled around \u2014 this is what will make Dashboard metrics buildable later without new plumbing.
