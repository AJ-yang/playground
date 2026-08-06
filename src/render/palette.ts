/** 전역 색상 팔레트. 색을 여기 한 곳에 모아두면 테마 교체가 쉬워진다. */
export const PALETTE = {
  bg: '#0e1117',
  boardEdge: '#1b2230',

  grassA: '#233021',
  grassB: '#1e2a1d',
  grassLine: 'rgba(255,255,255,0.035)',

  pathOuter: '#3a2f22',
  pathInner: '#584533',
  pathDash: 'rgba(255,255,255,0.06)',

  blockedFill: '#2a3040',
  blockedEdge: '#3b4457',

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
