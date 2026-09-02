import { env } from 'cloudflare:workers';

// TEST_SCHEMA_SQL is a test-only binding set in vitest.config.js, since
// this file runs bundled inside the sandboxed Workers runtime with no
// host filesystem access -- schema.sql has to be read on the Node side
// and handed in this way. D1's own `.exec()` accepts a batch of
// `\n`-separated statements, which is exactly what schema.sql already
// is. Every statement in it is `CREATE TABLE IF NOT EXISTS`, so this is
// safe to run every time a test file's worker starts up (setup files
// can run more than once, per the Workers Vitest plugin's own docs).
await env.DB.exec(env.TEST_SCHEMA_SQL);
