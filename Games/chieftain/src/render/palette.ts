/**
 * 피오르드의 색.
 *
 * 북유럽 해안의 낮은 채도와 차가운 회록색을 기준으로 잡았다. 진영색만
 * 뚜렷하게 띄우고 나머지는 전부 눌러 둔다 — 화면에서 제일 먼저 읽혀야 하는
 * 것은 지형이 아니라 **누구의 땅이고 내 반경이 어디까지인가**이기 때문이다.
 */
export const C = {
  deepWater: 0x10222c,
  water: 0x17323f,
  shallow: 0x1f4553,
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
  sky: 0x0b0f14,
  fog: 0x05080b,

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
