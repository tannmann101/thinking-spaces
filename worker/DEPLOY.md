# Deploying Thinking Spaces

This is a Cloudflare Worker + D1 database that reimplements every route
`backend/` (the Express + better-sqlite3 app used for local development)
has. It's routed at `thinking.thegardners.xyz/api/*` -- Cloudflare
intercepts those requests at the edge before they'd otherwise hit
GitHub Pages, which serves the built frontend on the rest of that
subdomain. Same split gardners-hub's own Worker already uses for the
main site.

Because `thegardners.xyz` is already on Cloudflare (already reverse-
proxied and Access-gated), this just adds a new subdomain, a Worker
route, and a D1 database to that same account -- no new service to
sign up for.

## One-time setup

Run these from the `worker/` directory, with Node.js installed locally.

1. **Log in to Cloudflare** (opens a browser to authorize):
   ```
   npx wrangler login
   ```

2. **Create the D1 database:**
   ```
   npx wrangler d1 create thinking-spaces
   ```
   This prints a `database_id`. Copy it into `wrangler.toml`, replacing
   `REPLACE_WITH_YOUR_DATABASE_ID`.

3. **Apply the schema:**
   ```
   npx wrangler d1 execute thinking-spaces --remote --file=schema.sql
   ```

4. **Seed the 6 built-in Templates** (safe to run even after data
   migration below -- it uses `INSERT OR IGNORE`, so it never
   duplicates or overwrites):
   ```
   npx wrangler d1 execute thinking-spaces --remote --file=templates-seed.sql
   ```

5. **Migrate the real, already-accumulated data.** This is a migration
   of an app already in daily use, not a fresh install -- skipping this
   step means starting the hosted version from an empty database.
   From `backend/` on the machine that actually has
   `backend/data/thinking-spaces.sqlite` (the personal laptop, via the
   desktop launcher):
   ```
   node export-to-d1.mjs
   ```
   This writes `backend/data-export.sql`. Copy it into `worker/`, then:
   ```
   npx wrangler d1 execute thinking-spaces --remote --file=data-export.sql
   ```
   Only run this once against a fresh database -- ordinary rows use a
   plain `INSERT`, so running it twice fails on duplicate primary keys
   (a safe failure, not silent duplication). Delete
   `worker/data-export.sql` afterward -- it's real personal data and
   shouldn't linger as a file (also excluded via `.gitignore` so it can
   never be committed by accident).

6. **Deploy the Worker:**
   ```
   npx wrangler deploy
   ```
   This binds it to the `thinking.thegardners.xyz/api/*` route from
   `wrangler.toml`.

7. **Add the DNS record for the new subdomain**, if it doesn't already
   exist: in the Cloudflare dashboard, add a proxied (orange-cloud)
   CNAME for `thinking` pointing at `<your-github-username>.github.io`
   -- this is what lets GitHub Pages serve the rest of the subdomain
   once the Worker's own `/api/*` route has first claim on that traffic.

8. **Verify the Access policy covers the new subdomain.** In the
   Cloudflare Zero Trust dashboard, check whether the Access
   application gating `thegardners.xyz` already covers
   `thinking.thegardners.xyz` (a wildcard/whole-zone policy usually
   does) or needs `thinking.thegardners.xyz/*` added explicitly.
   Without this, the app would be reachable without going through the
   PIN login the rest of the domain requires.

9. **Point GitHub Pages at the new subdomain.** In the
   `tannmann101/thinking-spaces` repo's Settings -> Pages, the custom
   domain should already read `thinking.thegardners.xyz` once the
   `.github/workflows/deploy-pages.yml` workflow has run once (it ships
   `frontend/public/CNAME`, which GitHub Pages reads automatically) --
   this step is just confirming it took and that "Enforce HTTPS" is on.

10. **Test it** -- visit `https://thinking.thegardners.xyz` in a
    browser you're already logged into Access with. You should land on
    the real Dashboard, showing the real migrated Spaces, not an empty
    app or an Access login page.

## After that

Every push to `main` that touches `frontend/**` rebuilds and redeploys
the static site automatically (see
`.github/workflows/deploy-pages.yml`). The Worker itself has no
auto-deploy set up -- a change to anything under `worker/src/` needs a
manual `npx wrangler deploy` from this directory. `backend/` keeps
being what local development actually runs; changes made there don't
automatically apply here; see `CLAUDE.md`'s Hosting section for why
the two are kept as separate, parallel implementations rather than one
generating the other.

## Making schema changes later

Edit `schema.sql`, then run the relevant `ALTER TABLE` (or a fresh
`CREATE TABLE` + data migration) by hand against the `--remote`
database with `wrangler d1 execute`, same as `backend/src/db/index.js`'s
own `ensureColumn` migrations do for the Node side -- just applied once
by hand here instead of automatically at every boot, since a Worker has
no boot to run them at.

### Queued, not yet applied to the deployed database

These accumulated since the last live deployment. Run them once, in
this order, from `worker/`:

```sh
# Adds the goals table and everything else declared in schema.sql that
# doesn't exist yet -- every CREATE is IF NOT EXISTS, so this is safe to
# re-run and won't touch tables that are already there.
npx wrangler d1 execute thinking-spaces --remote --file=schema.sql

# Columns an existing table can't gain from a CREATE TABLE IF NOT EXISTS.
npx wrangler d1 execute thinking-spaces --remote --command \
  "ALTER TABLE activity_log ADD COLUMN block_id TEXT;"
npx wrangler d1 execute thinking-spaces --remote --command \
  "ALTER TABLE spaces ADD COLUMN theme TEXT;"
npx wrangler d1 execute thinking-spaces --remote --command \
  "ALTER TABLE spaces ADD COLUMN goal_ids TEXT NOT NULL DEFAULT '[]';"
npx wrangler d1 execute thinking-spaces --remote --command \
  "ALTER TABLE workspaces ADD COLUMN kind TEXT;"
npx wrangler d1 execute thinking-spaces --remote --command \
  "ALTER TABLE projects ADD COLUMN goal_id TEXT;"
npx wrangler d1 execute thinking-spaces --remote --command \
  "ALTER TABLE activity_log ADD COLUMN event_count INTEGER NOT NULL DEFAULT 1;"

# Seeds the 17 built-in Resource Templates (idempotent -- INSERT OR IGNORE).
npx wrangler d1 execute thinking-spaces --remote --file=resource-templates-seed.sql
```

One of these is a rebuild rather than an ALTER, because SQLite cannot
drop a column carrying a foreign key. Projects no longer belong to a
Space, and the old `projects.space_id` was NOT NULL with a foreign key
into `spaces`, which blocks inserting a standalone Project at all. The
Node side does this automatically at boot (`migrateProjectsSpaceless()`
in `backend/src/db/queries/projects.js`); here it has to be run by hand:

```sh
npx wrangler d1 execute thinking-spaces --remote --command \
  "CREATE TABLE projects_rebuilt (id TEXT PRIMARY KEY, name TEXT NOT NULL, goal_id TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
   INSERT INTO projects_rebuilt (id, name, goal_id, created_at, updated_at) SELECT id, name, goal_id, created_at, updated_at FROM projects;
   DROP TABLE projects;
   ALTER TABLE projects_rebuilt RENAME TO projects;"
```

Skip that last one if the deployed database has no `projects.space_id`
column (check with `PRAGMA table_info(projects);`) -- it means the
rebuild has already been done.

## One migration the Worker can never run itself

`backend/src/db/index.js` runs a handful of one-time migrations at boot.
Most have no counterpart here, because a D1 database starts fresh on the
current shapes and so never holds a legacy-shaped row (see `CLAUDE.md`'s
Hosting section). `migrateSpaceStatuses()` is the exception: it maps the
two retired status values (`nascent`, `developing`) onto `active`, and
the deployed database was populated *before* the status vocabulary
changed, so it may still carry them. A Worker has no boot hook to run it
at, so run it once by hand:

```sh
npx wrangler d1 execute thinking-spaces --remote --command \
  "UPDATE spaces SET status = 'active' WHERE status IN ('nascent', 'developing');"
```

## Not yet done: file uploads need R2

`backend/`'s content-ingestion feature (see `CLAUDE.md`) added two
pieces: a link-preview route (`POST /link-preview`, no storage needed --
already ported to `worker/src/linkPreview.js` and wired into
`worker/src/index.js`) and a file-upload route (`POST /uploads`,
`GET /uploads/:filename`, storing files on the local filesystem under
`backend/data/uploads/`). The upload route was deliberately *not*
ported here -- a Worker has no local filesystem to write to, so it needs
R2 (Cloudflare's S3-compatible object storage) instead, which requires
creating a bucket and adding an R2 binding to `wrangler.toml`, the same
kind of one-time Cloudflare-account setup the original D1 database
needed. Not done yet since this session has no live Cloudflare access of
its own (see `CLAUDE.md`'s Open list) -- once a bucket exists, port
`backend/src/routes/uploads.js`'s two routes into `worker/src/index.js`
using `env.UPLOADS.put()`/`.get()` in place of `fs.writeFileSync`/
`res.sendFile`, keeping the same UUID-filename and file-type-allowlist
logic.
