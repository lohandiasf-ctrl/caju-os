// Copied into dist/server/ by scripts/patch-wrangler.mjs, which also points
// `main` here. The build's own entry only exports `fetch`; delegated-task
// follow-ups need to run when nobody has the app open, so this wraps it and
// adds a scheduled handler that drives the sweep through the normal route.
import handler from './index.js';
import { withSecurityHeaders } from './security-headers.mjs';

export default {
  async fetch(request, env, ctx) {
    const response = await handler.fetch(request, env, ctx);
    return withSecurityHeaders(response, request.url);
  },
  async scheduled(event, env, ctx) {
    const sweep = handler.fetch(
      new Request('https://cron.internal/api/tasks/sweep', {
        method: 'POST',
        headers: { 'x-cron-secret': env.CRON_SECRET ?? '' },
      }),
      env,
      ctx,
    );
    const spareSync = handler.fetch(
      new Request('https://cron.internal/api/spares/sync', {
        method: 'POST',
        headers: { 'x-cron-secret': env.CRON_SECRET ?? '' },
      }),
      env,
      ctx,
    );
    const spareTracking = handler.fetch(
      new Request('https://cron.internal/api/spares/tracking', {
        method: 'POST',
        headers: { 'x-cron-secret': env.CRON_SECRET ?? '' },
      }),
      env,
      ctx,
    );
    const run = Promise.all([sweep, spareSync, spareTracking]);
    ctx.waitUntil(run);
    await run;
  },
};
