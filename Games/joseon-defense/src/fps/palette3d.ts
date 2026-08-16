/**
 * 3D 전장의 색.
 *
 * 2D 팔레트(`render/palette.ts`)와 **세계관은 같고 값은 다르다.** 2D는 캔버스에
 * 칠하는 최종 색이라 이미 그늘이 섞여 있지만, 3D는 조명이 곱해진다 — 같은
 * 값을 그대로 쓰면 달빛을 두 번 먹어 전부 검게 가라앉는다. 그래서 여기 값은
 * "달빛 아래에서 저 2D 색으로 보이도록" 한 단계 밝혀 둔 재질색이다.
 *
 * 세계관은 여전히 **달밤**이다. 따뜻한 색은 지켜야 하는 것(마을·초롱·아군
 * 기물의 불씨)에만 남기고, 들판과 적은 푸른기로 죽인다.
 */
export const C = {
  // 하늘·대기
  skyTop: 0x0a1020,
  skyHorizon: 0x1d2a3e,
  fog: 0x131c2b,
  moon: 0xdfe8f5,

  // 땅
  grass: 0x46523c,
  grassDark: 0x36402f,
  path: 0x8a7452,
  pathEdge: 0x5a4a33,

  // 바위·나무
  rock: 0x5b6474,
  rockDark: 0x3a414e,
  trunk: 0x6b4630,
  canopy: 0x3d5c46,

  // 성벽·성문
  wall: 0x6b6558,
  wallDark: 0x4a4539,
  timber: 0x6e4a2e,
  timberDark: 0x4a3220,
  roofTile: 0x3f4652,

  // 기물 공통
  stone: 0x6f7480,
  stoneDark: 0x4b5058,

  // 불빛
  lantern: 0xffb95e,
  ember: 0xff8a3d,

  // UI 표식
  valid: 0x8bd450,
  invalid: 0xff5c5c,
  rangeRing: 0x5a9fd6,
} as const

/** `'#rrggbb'` 문자열을 three가 쓰는 숫자로. 데이터의 색을 그대로 3D에 옮길 때. */
export function hex(css: string): number {
  return Number.parseInt(css.replace('#', ''), 16)
}
