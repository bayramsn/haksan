/** UIKit tab metrics, separate from the removed custom floating capsule. SDK 54 exposes no native height event. */
export function navigationBottomInset(input: { platform: string; version: number; bottom: number; landscape: boolean }) {
  if (input.platform !== 'ios') return 0; // Classic tabs consume layout space.
  const bar = input.landscape ? 32 : input.version >= 26 ? 62 : 49;
  return bar + input.bottom;
}
