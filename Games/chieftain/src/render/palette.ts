/**
 * 피오르드의 색.
 *
 * 북유럽 해안의 낮은 채도와 차가운 회록색을 기준으로 잡았다. 진영색만
 * 뚜렷하게 띄우고 나머지는 전부 눌러 둔다 — 화면에서 제일 먼저 읽혀야 하는
 * 것은 지형이 아니라 **누구의 땅이고 내 반경이 어디까지인가**이기 때문이다.
 */
export const C = {
  // 바다를 한 단계 올렸다. 부감에서 바다가 화면의 절반을 차지하는데 전에는
  // 거의 검정이라 판이 검은 종이 위에 놓인 것처럼 보였다. 하늘이 밝아진
  // 지금은 그 대비가 더 튄다. 색조는 그대로 두고 명도만 올린다.
  deepWater: 0x142935,
  water: 0x1c3c4b,
  shallow: 0x24505f,
  shore: 0x4a5b52,
  grass: 0x3d5442,
  grassDry: 0x4a5744,
  rock: 0x4c5158,
  rockDark: 0x33383e,
  plank: 0x5a4632,
  plankDark: 0x3e3123,
  tree: 0x2b4436,
  treeDark: 0x203528,
  snow: 0xdfe7ea,
  /**
   * 안 밝힌 칸을 덮는 색.
   *
   * 거의 검정(0x05080b)이었다. 판이 평면 한 장이던 시절에는 그게 "아직 모르는
   * 곳"으로 읽혔는데, 지형과 물이 생긴 뒤로는 **세상에 뚫린 검은 구멍**처럼
   * 보인다. 하늘·안개와 같은 계열로 한 단계 올려서, 모르는 곳이 아니라
   * 안개에 잠긴 곳이 되게 한다.
   */
  fog: 0x26323c,

  /**
   * 하늘. 천정에서 지평선까지 네 단계로 내려온다(`sky.ts`).
   *
   * 전에는 `sky` 하나(0x0b0f14, 거의 검정)로 배경과 안개를 같이 썼다. 검은
   * 배경은 지평선을 지워서 화면을 납작하게 만든다 — 안개 색을 지평선에
   * 맞추면 먼 지형이 하늘로 녹아들고, 그것만으로 거리가 생긴다.
   */
  skyZenith: 0x152233,
  skyMid: 0x2b4258,
  skyHorizon: 0x7d95a4,
  skyUnder: 0x2c3d48,

  /** 진영. 파랑이 사람(0번), 주황이 컴퓨터(1번)다. */
  side: [0x7fb2ff, 0xff8a6b] as const,
  sideDim: [0x2c4a72, 0x6e3a2c] as const,

  neutral: 0xc9b48a,
  neutralDark: 0x8a7a58,

  keepWood: 0x6b4f34,
  keepRoof: 0x2f3b33,

  /** 지휘 반경 링. 이 색이 화면에서 가장 눈에 띄어야 한다(GDD 3.1). */
  radius: 0xffe08a,
} as const

export function hex(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`
}
