// Copied into dist/server/ by scripts/patch-wrangler.mjs, which also points
// `main` here. The build's own entry only exports `fetch`; delegated-task
// follow-ups need to run when nobody has the app open, so this wraps it and
// adds a scheduled handler that drives the sweep through the normal route.
import handler from './index.js';

export default {
  fetch(request, env, ctx) {
    return handler.fetch(request, env, ctx);
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
    const run = Promise.all([sweep, spareSync]);
    ctx.waitUntil(run);
    await run;
  },
};
