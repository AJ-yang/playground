/** 전역 색상 팔레트. 색을 여기 한 곳에 모아두면 테마 교체가 쉬워진다. */
export const PALETTE = {
  bg: '#0e1117',
  boardEdge: '#1b2230',

  // 잔디 — 한 색이 아니라 밝기가 다른 세 톤을 섞어 평평해 보이지 않게 한다
  grassA: '#243322',
  grassB: '#1f2c1e',
  grassDeep: '#1a2519',
  grassLight: '#2c3d29',
  grassBlade: 'rgba(150,200,120,0.16)',
  grassLine: 'rgba(255,255,255,0.03)',

  // 흙길 — 둑(가장 어두움) → 흙 → 밝은 자국 순으로 세 겹
  pathBank: '#2b2118',
  pathOuter: '#453626',
  pathInner: '#5c4834',
  pathLight: '#6b5540',
  pathGravel: 'rgba(0,0,0,0.22)',
  pathRut: 'rgba(255,255,255,0.05)',

  blockedFill: '#2a3040',
  blockedEdge: '#3b4457',
  rockFill: '#3a4152',
  rockLight: '#4c5568',
  rockShade: '#232a38',
  treeTrunk: '#3b2d20',
  treeCanopy: '#2c4526',
  treeCanopyLight: '#3a5931',

  // 타워 석재 받침 — 색은 타워마다 다르지만 받침은 공통 재질
  stoneBase: '#4a4f5c',
  stoneBaseLight: '#5c6272',
  stoneBaseShade: '#2e323c',

  hudBg: '#131a24',
  hudEdge: '#222c3a',
  panelBg: '#131a24',
  panelEdge: '#222c3a',

  text: '#e6edf3',
  textMuted: '#8b949e',
  textDim: '#5c6773',

  gold: '#f0c674',
  life: '#ff6b6b',
  good: '#8bd450',
  warn: '#e0b341',
  danger: '#ff5c5c',
  accent: '#5aa9e6',

  rangeFill: 'rgba(90,169,230,0.10)',
  rangeEdge: 'rgba(90,169,230,0.55)',
  validFill: 'rgba(139,212,80,0.18)',
  validEdge: 'rgba(139,212,80,0.8)',
  invalidFill: 'rgba(255,92,92,0.18)',
  invalidEdge: 'rgba(255,92,92,0.8)',
} as const

export const FONT = {
  tiny: '10px system-ui, sans-serif',
  small: '11px system-ui, sans-serif',
  body: '12px system-ui, sans-serif',
  bodyBold: '600 12px system-ui, sans-serif',
  label: '600 13px system-ui, sans-serif',
  title: '700 16px system-ui, sans-serif',
  big: '700 22px system-ui, sans-serif',
  huge: '800 40px system-ui, sans-serif',
} as const

/** 라운드 사각형 경로. Path2D 대신 ctx에 직접 그려 재사용성을 높였다. */
export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}
