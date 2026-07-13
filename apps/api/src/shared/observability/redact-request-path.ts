/** Removes bearer credentials embedded in path segments before telemetry/logging. */
export function redactRequestPath(rawUrl: string): string {
  const pathname = rawUrl.split('?', 1)[0] ?? rawUrl;
  return pathname.replace(
    /(\/public\/service-complaints\/[^/?#]+\/)[^/?#]+/i,
    '$1[REDACTED]'
  );
}
