/** Parametrik dişli çark path'i — marka amblemi ve illüstrasyonların ortak geometrisi. */
export function gearOutline(
  teeth: number,
  outerR: number,
  bodyR: number,
  holeR: number,
  cx = 0,
  cy = 0,
): string {
  const seg = (Math.PI * 2) / teeth;
  const pts: string[] = [];
  for (let i = 0; i < teeth; i++) {
    const base = i * seg;
    const a1 = base;
    const a2 = base + seg * 0.16;
    const a3 = base + seg * 0.34;
    const a4 = base + seg * 0.5;
    pts.push(
      `${i === 0 ? 'M' : 'L'}${(cx + bodyR * Math.cos(a1)).toFixed(2)} ${(cy + bodyR * Math.sin(a1)).toFixed(2)}`,
      `L${(cx + outerR * Math.cos(a2)).toFixed(2)} ${(cy + outerR * Math.sin(a2)).toFixed(2)}`,
      `L${(cx + outerR * Math.cos(a3)).toFixed(2)} ${(cy + outerR * Math.sin(a3)).toFixed(2)}`,
      `L${(cx + bodyR * Math.cos(a4)).toFixed(2)} ${(cy + bodyR * Math.sin(a4)).toFixed(2)}`,
    );
  }
  pts.push('Z');
  if (holeR > 0) {
    pts.push(
      `M${(cx + holeR).toFixed(2)} ${cy.toFixed(2)}`,
      `A${holeR} ${holeR} 0 1 0 ${(cx - holeR).toFixed(2)} ${cy.toFixed(2)}`,
      `A${holeR} ${holeR} 0 1 0 ${(cx + holeR).toFixed(2)} ${cy.toFixed(2)}`,
      'Z',
    );
  }
  return pts.join(' ');
}
