# CLAUDE.md — Thinking Spaces

## What this is
A personal, single-user thinking workshop app. Each train of thought (a concept, theory, plan, assessment) becomes a "Space" — a revisitable, evolving place, not a static note. Spaces can hold different kinds of content depending on what they're for, can reference each other, and the whole system should feel alive and buildable-on-itself over time. This is being built for one person's own use, not as a product.

## Non-negotiable working method
This project has a specific failure mode to avoid: past attempts sent one big prompt, got a rough MVP back, then spent a long time fighting it in frustrating, unreviewable tinkering. That is not how this build happens. Instead:

- **Work in small, reviewed slices.** Finish one coherent piece, then stop and explain in plain language what was built and why, before continuing.
- **Confirm scope before starting any new pass or major piece of work.** Restate your understanding of what's being asked; don't assume and run.
- **No black boxes.** The person directing this project is not writing the code themselves. Every feature needs to be legible to a non-implementer: centralize things that would otherwise be scattered (a single registry file for Tools, a single registry file for Views — see below), comment intent not just mechanics, and avoid clever abstractions that hide what's actually happening.
- **Favor boring, readable code over clever code.** This is a solo-maintained personal project, not a codebase optimized for a team.
- **Don't build ahead of the current priority** (see Roadmap) without explicit go-ahead, even if the next piece seems obvious or easy.
- **Use the person's own vocabulary** (Dashboard, Creation Mode, Spaces, Tools, Resources, Dev Mode, Relational Map — see below), not implementation jargon, when discussing the app with them. If a term drifts from how they actually think about it, that's a signal to realign the language, not just push forward.

## Tech stack
React + Vite (frontend), Node/Express + SQLite (backend). This matches the person's other personal apps (a household finance tracker, a household-management app called Secretary) — consistency across their own tools matters more than any particular technical advantage.

## The shape of the app, in plain language

This is the vocabulary to use — it's the person's own mental model, and it should stay the primary way of talking about this project:

- **Dashboard** — where you land: create Spaces, see Spaces, see trends/metrics/insights across them.
- **Creation Mode** — the flow for starting a new Space: pulling in Tools and Resources for what this Space is for, with real room for customization/personalization so the Space feels like its own thing, not a generic form.
- **Spaces** — one Space per train of thought. Every Space loosely falls into one of 5 starting clusters (see below), plus "Other" for anything that doesn't. A Space is never *just* its cluster, though — it gets tailored the way every train of thought is different.
- **Tools** — the functions/features a Space can use to work toward its purpose (write a paragraph, keep a checklist, compare two things, chart progress, etc.). Tools are internal to the app, modular and general-purpose, expanded in dev sessions like this one rather than built by the person from inside the running app. They should be visible as a catalog (with a demo of what each one offers) and some should be markable as "groupable" with others they work well alongside.
- **Resources** — anything that exists outside of (or alongside) the app that gets surfaced *within* it, in relation to a Space, a Relational Space, the Dashboard, or a Tool: a book, a computer, a phone, an account, a YouTuber or podcaster, a social media post, a discussion, a set of notes — anything worth having on hand while thinking something through.
- **Dev Mode** — **resolved, no longer a distinct mode.** Earlier brainstorming described a separate mode you'd enter to make structural changes. The person overrode that directly: everything should be addable/removable/editable in place, on every page, all the time — a toggle you have to switch into runs against that. So "Dev Mode" now means *ordinary, ubiquitous editability*, not a gate: structural controls (add/remove/reorder Tools, edit any property) are always visible, everywhere, never hidden behind a switch.
- **Relational Map** — where Spaces get connected: simply (checkboxes/text references) and visually, as an interactive node/link thought-map in the spirit of Obsidian's graph view, but livelier. This is also where Relational Spaces (a Space seeded from several others) get managed.
- **Log** — a global, cross-Space activity feed: every Space/Tool/Template created or removed, every status change, merged with each Space's own Trail history, in one chronological place — meant as the foundation for trends and data insights over time, not just a record for its own sake.

### Where the build actually stands against that vocabulary

Passes 1–5 of the original roadmap are done, plus a visual-polish pass, an editability pass, a Tools catalog, a Creation Mode overhaul, and the Dev Mode decision above. Mapped onto the language:

- **Tools** = the **Block types** (Text, List, Reference, Media, Comparison) and **View types** (Timeline, Progress, Streak, Ledger, Graph), registered in `frontend/src/registry/blocks.js` and `frontend/src/registry/views.js`. Browsable at `/tools` (`frontend/src/pages/ToolsPage.jsx`) — every Tool's description, a live demo (via each registry entry's `demoBlock`/`demoProps`), and `worksWith` for what it pairs with.
- **Spaces' 5 clusters** = the 5 built-in Templates (Inquiry/Analytical, Technical/Practical, Life Management, Person-Reflection, Creative), each a named starting arrangement of Tools. "Start Blank" in Creation Mode already serves as the "Other" option.
- **Resources** = a Space carrying `"resource"` in its `tags` array (a plain JSON array on `spaces` — see Data model). Extra tags (`"book"`, `"person"`, `"account"`, ...) already work for sub-typing with zero new code. Surfaced in the Dashboard's Resources digest and selectable in Creation Mode.
- **Creation Mode**, as actually built = visual cluster cards (with a live preview of what each starts with), the ability to add extra Tools and pull in existing Resources as References before the Space exists, and tags/goal set at creation — see `frontend/src/pages/CreateSpace.jsx` and `createSpaceWithSetup` in `backend/src/db/queries.js`.
- **Dev Mode** — see the resolved entry above. Every page's edit surfaces should be checked against this whenever new content is added to the app: if something can be created, it needs a way to be removed or changed too, without a mode switch.
- **Relational Map** = the Graph page (`/graph`), computed live from Reference blocks (no separate graph structure is stored). Currently a static SVG with a fixed circle layout — no drag, no pan/zoom, not interactive. **A real gap** against "interactive thought map, livelier than Obsidian" — the one remaining open item.
- **Log** = `/log` (`frontend/src/pages/LogPage.jsx`), backed by `listGlobalActivity`/`getActivityStats` in `backend/src/db/queries.js`. Merges a new `activity_log` table (structural lifecycle events: Space/Tool/Template created or removed, status changes) with the existing `trail_entries` into one feed, plus a first simple set of stats (total events, last 7 days, most active Space). Deliberately doesn't log every keystroke-level content edit — that would bury the events actually worth seeing trends in.

If the person mentions older brainstorming names (Skeleton, Trail, Tension Resolver, Argument Map, Citation Tracker, Milestone Tracker, Habit Streak), these are already built as Tools — Skeleton lanes and Trail have their own files (`registry/skeleton.js`, the Trail spine on each Space page); the rest map onto Views over List Tools. Check before assuming a familiar name means new work.

## Visual direction
Done, not a future pass anymore. The shipped look is a matte-black/oxblood dark theme — Fraunces (display serif), Source Serif 4 (body serif), JetBrains Mono (utility mono) — defined in `frontend/src/index.css`. This superseded an earlier "vellum/ink" plan after the person reviewed a mockup and preferred the darker direction. The Visual Identity glyph (an organic branching mark per Space, computed from status/reference count/open tensions — never decorative) is real and themed to match.

## Data model, current state
- `spaces` — id, title, template_id (nullable), status, tags (JSON array — Resources and any future category), goal (nullable text — "what this Space is working toward," a property of the Space itself, not its content), created_at, updated_at
- `blocks` — id, space_id, type, content (JSON), properties (JSON), position, created_at, updated_at
- `templates` — id, name, block_arrangement (JSON)
- `trail_entries` — id, space_id, kind (auto/manual), summary, note, skeleton_snapshot (JSON), created_at
- `activity_log` — id, space_id (nullable, no foreign key), space_title (snapshotted at write time, since a "Space deleted" entry must survive the Space itself being gone), kind, summary, created_at — the Log's structural-event half; merged with `trail_entries` at query time by `listGlobalActivity`, not duplicated into this table
- References are blocks of type `reference` with a `target_space_id` in their content — indexed, since backlinks and the Relational Map query it constantly.
- Tags are queried by membership (`listSpacesByTag` in `backend/src/db/queries.js`, `GET /api/spaces?tag=...`) — general-purpose, not written specifically for Resources.

Propose refinements to this if something better fits once more building happens — it's a foundation, not gospel.

## Roadmap

Complete: Passes 1–5 of the original plan (Dashboard/Creation Mode/Test Space; Tools & Resources; the 5 Templates; Dev Mode as originally scoped; the Relational Map). Visual polish. Two editability passes: the first made Space title/status/tags/goal editable in place and List items removable; the second (alongside the Dev Mode decision) closed the remaining "created but never removed/changed" gaps found by auditing every page — a Space itself can now be deleted (`deleteSpace` in `backend/src/db/queries.js`, a delete control on both the Dashboard and the Space page, guarded so the Test Space can't be deleted), a List block's heading is editable, and a Comparison block's contrast flag/note can be toggled and edited after creation. The Tools catalog, the Creation Mode overhaul, and the Log (see above) are all done.

**Standing principle, not a one-time pass:** per the Dev Mode decision, anything that can be created should have an equally ordinary way to be removed or changed, on whatever page it's created or shown — check for this whenever new content or a new page is added, rather than treating editability as a separate pass that's ever fully "done."

**Open, not yet started (only one item left):**
1. **Relational Map overhaul** — a genuinely interactive node/link map (drag, pan/zoom, visual life), replacing the current static SVG.

## Transparency / indexability requirement
Every Tool — every Block type and every View type — must be registered in one single, readable file each (`frontend/src/registry/blocks.js`, `frontend/src/registry/views.js`) — never scattered across the codebase. The point is that the person can open one file and see the complete list of what exists; the planned Tools catalog page makes this visible *in the app itself*, not just in the source. Keep all cross-Space queries (counts, status distribution, backlink lookups, tag membership) going through a small, consistent set of query functions in `backend/src/db/queries.js` rather than ad hoc SQL sprinkled around — this is what makes Dashboard metrics and things like the Resources digest buildable without new plumbing.
