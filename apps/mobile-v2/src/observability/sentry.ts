import * as Sentry from '@sentry/react-native';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
const environment = process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT?.trim() || (__DEV__ ? 'development' : 'production');
const configuredSampleRate = Number(process.env.EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? '0.05');
const tracesSampleRate = Number.isFinite(configuredSampleRate)
  ? Math.min(1, Math.max(0, configuredSampleRate))
  : 0.05;

function redactEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  // CRM/finans payloadları ve credential'lar olay zarfına giremez. Sunucu
  // korelasyonu gerekiyorsa yalnız ApiError içindeki requestId/code tag'lenir.
  event.user = undefined;
  if (event.request) {
    event.request = {
      ...event.request,
      cookies: undefined,
      data: undefined,
      headers: undefined,
      query_string: undefined,
    };
  }
  event.breadcrumbs = event.breadcrumbs?.map((breadcrumb) => ({
    ...breadcrumb,
    data: undefined,
  }));
  return event;
}

Sentry.init({
  dsn,
  enabled: Boolean(dsn) && !__DEV__,
  environment,
  sendDefaultPii: false,
  tracesSampleRate,
  enableNativeFramesTracking: true,
  attachStacktrace: true,
  beforeSend: redactEvent,
  beforeBreadcrumb: (breadcrumb) => ({ ...breadcrumb, data: undefined }),
});

export function captureException(error: unknown, tags?: Record<string, string>): void {
  if (!dsn || __DEV__) return;
  Sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(tags ?? {})) scope.setTag(key, value);
    Sentry.captureException(error);
  });
}

export const wrapRoot = Sentry.wrap;
