export type NavigationMaterial = 'glass' | 'blur' | 'solid';

export type NavigationMaterialInput = {
  platform: string;
  version: number | string;
  reducedEffects: boolean;
  reduceTransparency: boolean;
  glassAvailable: boolean;
  blurAvailable: boolean;
};

/** Resolve effects only after platform support and accessibility preferences are known. */
export function resolveNavigationMaterial(input: NavigationMaterialInput): NavigationMaterial {
  if (input.reducedEffects || input.reduceTransparency) return 'solid';
  // iOS reports dotted versions such as "26.0.1"; Android reports its API level.
  const version = typeof input.version === 'number' ? input.version : Number.parseFloat(input.version);
  if (input.platform === 'ios' && version >= 26 && input.glassAvailable) return 'glass';
  if (input.blurAvailable && (
    input.platform === 'ios' || input.platform === 'web' || (input.platform === 'android' && version >= 31)
  )) return 'blur';
  return 'solid';
}
