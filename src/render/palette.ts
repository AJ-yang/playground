/**
 * 전역 색상 팔레트. 색을 여기 한 곳에 모아두면 테마 교체가 쉬워진다.
 *
 * 세계관은 **달밤의 마을**이다. 밤이라 초록이 죽고 푸른기가 돌며, 따뜻한 색은
 * 마을의 창불·청사초롱·부적의 주사색에만 남긴다. 화면에서 따뜻한 것이 곧
 * 지켜야 하는 것이 되도록 색을 배분했다.
 */
export const PALETTE = {
  bg: '#0b0d10',
  boardEdge: '#161c28',

  // 밤 들판 — 달빛 아래라 초록이 죽고 푸른기가 돈다. 한 색이 아니라 밝기가
  // 다른 세 톤을 섞어 평평해 보이지 않게 한다.
  grassA: '#2d3128',
  grassB: '#252920',
  grassDeep: '#1c1f18',
  grassLight: '#3a3f31',
  grassBlade: 'rgba(214,206,168,0.13)',
  grassLine: 'rgba(255,255,255,0.028)',

  // 달빛 받은 흙길 — 둑(가장 어두움) → 흙 → 밝은 자국 순으로 세 겹
  pathBank: '#2a2219',
  pathOuter: '#463a2a',
  pathInner: '#5e4f39',
  pathLight: '#77664b',
  pathGravel: 'rgba(0,0,0,0.22)',
  pathRut: 'rgba(255,255,255,0.05)',

  blockedFill: '#232936',
  blockedEdge: '#333c4d',
  rockFill: '#333a4a',
  rockLight: '#454e61',
  rockShade: '#1e242f',
  treeTrunk: '#5a3a26',
  treeCanopy: '#2b4436',
  treeCanopyLight: '#3a5b45',

  // 타워 석재 받침 — 색은 타워마다 다르지만 받침은 공통 재질
  stoneBase: '#4a4f5c',
  stoneBaseLight: '#5c6272',
  stoneBaseShade: '#2e323c',

  hudBg: '#0f141d',
  hudEdge: '#1e2634',
  panelBg: '#0f141d',
  panelEdge: '#1e2634',

  text: '#e6edf3',
  textMuted: '#8b949e',
  textDim: '#5c6773',

  gold: '#ecd06a',
  life: '#ff6b6b',
  good: '#8bd450',
  warn: '#e0b341',
  danger: '#ff5c5c',
  accent: '#5a9fd6',

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
