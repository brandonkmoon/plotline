import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0,
    beforeSend(event) {
      if (event.extra) {
        delete event.extra.response;
        delete event.extra.contribution;
      }
      return event;
    },
  });
}
