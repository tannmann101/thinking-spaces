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
