import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0,
    beforeSend(event) {
      // Strip user-written content from error payloads
      if (event.extra) {
        delete event.extra.response;
        delete event.extra.contribution;
      }
      if (event.contexts) {
        for (const key of Object.keys(event.contexts)) {
          const ctx = event.contexts[key] as Record<string, unknown>;
          if (ctx) {
            delete ctx.response;
            delete ctx.contribution;
          }
        }
      }
      // Strip from breadcrumbs
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map((bc) => {
          if (bc.data) {
            delete bc.data.response;
            delete bc.data.contribution;
          }
          return bc;
        });
      }
      return event;
    },
  });
}
