# Deploying Thinking Spaces

This is the app's backend: a Cloudflare Worker on a D1 database. It's
the same code locally and deployed -- `npm run dev` here runs it on
port 8787, which is what Vite's `/api` proxy points at. Deployed, it's
routed at `thinking.thegardners.xyz/api/*` -- Cloudflare
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

5. **Migrate the real, already-accumulated data.** *(Done once, in
   September 2026 -- kept here as the record of how, not as a step to
   repeat.)* This was a migration of an app already in daily use, not a
   fresh install. A local `export-to-d1.mjs` script read the Express
   backend's own SQLite file and wrote a `data-export.sql` of INSERTs;
   both are gone now that there is no local SQLite database to read.
   The applied command was:
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
manual `npx wrangler deploy` from this directory. That's the one thing
to remember: the frontend ships itself, the backend doesn't. A merge
that changes both leaves the live site calling routes the deployed
Worker doesn't have yet until you deploy.

## Making schema changes later

Edit `schema.sql`, then run the relevant `ALTER TABLE` (or a fresh
`CREATE TABLE` + data migration) by hand against the `--remote`
database with `wrangler d1 execute`. There's no automatic migration
step: a Worker has no boot to run one at, so a schema change is always
something applied deliberately, before the deploy that needs it.

### Queued, not yet applied to the deployed database

**The frontend is already ahead of this.** GitHub Pages redeploys itself
on every push to `main` that touches `frontend/**`, so the live site is
already serving a build that calls `/api/goals`, `/api/projects`,
`/api/search`, `/api/trash` and more -- none of which the currently
deployed Worker has. Until the steps below are run, those pages error on
the live site. Everything here is one sitting; do it in order.

Run from `worker/`. Every command is a single line, so it works the same
in PowerShell and in bash.

**0. Make sure the checkout is current, and prove it.** This is not
boilerplate -- skipping it is the one mistake that has actually bitten
this runbook. `--file=` reads from *your working copy*, so a stale
checkout silently applies a stale `schema.sql`: the command succeeds,
reports fewer queries than it should, and quietly leaves out whichever
tables were added since. `wrangler deploy` has the same hazard, and
worse consequences -- it would ship Worker code that disagrees with the
schema you just migrated.

```
git -C .. pull
git -C .. log --oneline -1
```

Then check the statement count you're about to apply, and remember it --
step 3 should report exactly this many:

```
findstr /R /C:"^CREATE" /C:"^ALTER" /C:"^INSERT" schema.sql | find /c /v ""
```

(On bash: `grep -cE '^\s*(CREATE|ALTER|INSERT)' schema.sql`.)

If `git pull` refuses because of local changes to `package.json` /
`package-lock.json`, those are almost certainly `npm install` artifacts:
`git -C .. stash push -m "npm artifacts" worker/package.json worker/package-lock.json`,
then pull.

**1. Back up first.** Everything below is additive except step 4, which
rebuilds a table. This is the person's own accumulated thinking, so take
a copy before touching it:

```
npx wrangler d1 export thinking-spaces --remote --output=backup-before-migration.sql
```

Keep that file somewhere outside the repo -- it is real personal data,
and the repo's `.gitignore` does not know about this name.

**2. Look at what's actually there**, so you only run what's missing and
you know whether step 4 applies at all:

```
npx wrangler d1 execute thinking-spaces --remote --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
npx wrangler d1 execute thinking-spaces --remote --command "PRAGMA table_info(projects);"
npx wrangler d1 execute thinking-spaces --remote --command "PRAGMA table_info(spaces);"
npx wrangler d1 execute thinking-spaces --remote --command "PRAGMA table_info(activity_log);"
```

**3. Apply the additive changes.** Check the query count it reports
against what step 0 told you to expect -- a smaller number means you
applied a stale file and some tables are silently missing.
`schema.sql` creates any table that doesn't exist yet (every CREATE is `IF NOT EXISTS`, so it never touches
one that does); the ALTERs add columns a CREATE can't retrofit. SQLite
has no `ADD COLUMN IF NOT EXISTS`, so an already-applied one fails with
`duplicate column name` -- that error means "already done", so read it
and move on rather than stopping:

```
npx wrangler d1 execute thinking-spaces --remote --file=schema.sql
npx wrangler d1 execute thinking-spaces --remote --command "ALTER TABLE activity_log ADD COLUMN block_id TEXT;"
npx wrangler d1 execute thinking-spaces --remote --command "ALTER TABLE activity_log ADD COLUMN event_count INTEGER NOT NULL DEFAULT 1;"
npx wrangler d1 execute thinking-spaces --remote --command "ALTER TABLE spaces ADD COLUMN theme TEXT;"
npx wrangler d1 execute thinking-spaces --remote --command "ALTER TABLE spaces ADD COLUMN goal_ids TEXT NOT NULL DEFAULT '[]';"
npx wrangler d1 execute thinking-spaces --remote --command "ALTER TABLE workspaces ADD COLUMN kind TEXT;"
npx wrangler d1 execute thinking-spaces --remote --command "ALTER TABLE projects ADD COLUMN goal_id TEXT;"
npx wrangler d1 execute thinking-spaces --remote --file=resource-templates-seed.sql
```

**4. Rebuild the projects table -- only if step 2 showed a `space_id`
column on it.** A Project no longer belongs to a Space, and that column
was NOT NULL with a foreign key into `spaces`, which blocks inserting a
standalone Project at all. SQLite cannot drop a column carrying a
foreign key, so this is the standard make-copy-swap. It is **not**
idempotent -- if `PRAGMA table_info(projects)` showed no `space_id`, the
rebuild has already happened and running it again would fail:

```
npx wrangler d1 execute thinking-spaces --remote --file=projects-spaceless-rebuild.sql
```

**5. Fix the retired status values.** See the next section for why this
one has no automatic counterpart here:

```
npx wrangler d1 execute thinking-spaces --remote --command "UPDATE spaces SET status = 'active' WHERE status IN ('nascent', 'developing');"
```

**6. Deploy the Worker, immediately.** This has to come *after* the
schema, since the new Worker code reads columns that don't exist until
step 3 -- and it has to follow step 4 promptly, since the rebuild
removes a column the currently-deployed Worker still reads:

```
npx wrangler deploy
```

**7. Check it.** Open `https://thinking.thegardners.xyz`, sign in
through the Access PIN, and confirm: your real Spaces still load, the
Goals and Projects entries in the sidebar open working pages, search
returns results, and a Space page's Trail shows recorded activity rather
than "No history yet."

## One migration the Worker can never run itself

The old Express backend ran a handful of one-time migrations at boot.
Most have no counterpart here, because a D1 database starts fresh on the
current shapes and so never holds a legacy-shaped row (see `CLAUDE.md`'s
Hosting section). The status migration is the exception: it maps the
two retired status values (`nascent`, `developing`) onto `active`, and
the deployed database was populated *before* the status vocabulary
changed, so it may still carry them. A Worker has no boot hook to run it
at, so it has to be run by hand -- which is what step 5 of the checklist
above does. It is safe to re-run at any time: once no row carries a
retired value, the UPDATE simply matches nothing.

## Adding the uploads bucket (one-time)

File uploads are the one part of the app that needs storage beyond D1.
A Worker has no filesystem, so an uploaded file becomes an object in R2
(Cloudflare's object storage). The code is in place -- `wrangler.toml`
declares the `UPLOADS` binding and `worker/src/index.js` has both
routes -- but the bucket itself has to exist before a deploy that uses
it, the same one-time account-level setup the D1 database needed.

Note before starting: enabling R2 on a Cloudflare account may ask for a
payment method even though this app's usage sits far inside the free
tier (10 GB of storage, and no charge for bandwidth out). Worth
checking in the dashboard first if that matters to you -- everything
else in this deployment stays free either way, and skipping this step
costs you only file uploads on the live site. Local uploads keep
working regardless.

From `worker/`:

```
npx wrangler r2 bucket create thinking-spaces-uploads
npx wrangler deploy
```

Then check it end to end on the live site: go to `+ New Resource`,
choose **Upload a file**, pick a small PDF or `.txt`, and confirm the
new Resource's page renders it. A PDF should show inline; a text or
markdown file should show its contents; anything else offers a download
link.

Until the bucket exists, the upload route answers `501 File storage is
not configured on this deployment.` rather than failing obscurely --
deploying the code before creating the bucket is untidy, not harmful.

## Uploads in local development

`wrangler dev` gives the `UPLOADS` binding a local, emulated bucket
under `.wrangler/`, so uploading a file works locally with nothing set
up -- the same code path the deployed site uses, against local storage.
Files put there stay there; they are not synced to the real bucket, and
the real bucket is never touched from local development.

What counts as an acceptable upload -- the allowed file types, the 25 MB
limit, the generated UUID filename -- lives in `src/uploadRules.js`,
separate from the route that enforces it so the rules can be read and
tested on their own.
