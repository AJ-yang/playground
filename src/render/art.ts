/**
 * 벡터 아트.
 *
 * 외부 스프라이트를 쓰지 않고 SVG 패스 데이터를 직접 들고 있다가 `Path2D`로
 * 그린다. 이렇게 하면
 *   - 에셋 파일도 로딩도 없다 (아티팩트로 통째로 배포해도 자체 완결)
 *   - 해상도에 무관하게 선명하다
 *   - `@color` 같은 토큰으로 타워마다 같은 그림에 다른 색을 입힐 수 있다
 *
 * 모든 그림은 **32×32 좌표계**로 그리고, 바닥이 y≈29에 오도록 맞춘다.
 * 그래야 타일 위에 "서 있는" 것처럼 보인다.
 *
 * 시점은 위에서 살짝 내려다보는 측면(3/4)이다. 적은 정확한 탑다운이지만,
 * 건물을 탑다운으로 그리면 지붕만 보여 무엇인지 알 수 없다 — 타워디펜스가
 * 관습적으로 건물만 측면으로 그리는 이유다.
 */

export interface ArtLayer {
  /** SVG path 데이터 (viewBox 0 0 32 32) */
  d: string
  /** 채움색. `@color` / `@accent` / `@dark` / `@light`는 호출부 색으로 치환된다 */
  fill?: string
  stroke?: string
  width?: number
}

export type Art = readonly ArtLayer[]

export interface Tint {
  color: string
  accent: string
}

// 공통 재질 — 다섯 타워가 한 세계의 건물로 읽히려면 돌과 나무는 같아야 한다.
const STONE = '#6b7182'
const STONE_LIGHT = '#858c9e'
const STONE_DARK = '#3f4453'
const WOOD = '#6b4b2e'
const WOOD_DARK = '#432f1d'
const WOOD_LIGHT = '#87613e'
// 폐허 석재 — 흙길 위에 놓여도 묻히지 않도록 길보다 차갑고 밝게 잡았다.
const RUIN = '#575d6b'
const RUIN_LIGHT = '#6e7484'
const RUIN_DARK = '#33373f'
const OUTLINE = 'rgba(0,0,0,0.55)'

/** 돌 기단 — 모든 타워가 공유한다. */
const PLINTH: ArtLayer[] = [
  { d: 'M4 29 L28 29 L26 24 L6 24 Z', fill: STONE_DARK },
  { d: 'M6 24 L26 24 L24.5 21.5 L7.5 21.5 Z', fill: STONE },
  { d: 'M7.5 21.5 L24.5 21.5 L24 20.5 L8 20.5 Z', fill: STONE_LIGHT },
]

/** 궁수탑 — 목조 망루. 가볍고 값싼 인상. */
const ARCHER: Art = [
  ...PLINTH,
  // 기둥
  { d: 'M10 21 L10 13 L12.5 13 L12.5 21 Z', fill: WOOD_DARK },
  { d: 'M19.5 21 L19.5 13 L22 13 L22 21 Z', fill: WOOD_DARK },
  { d: 'M14.5 21 L14.5 14 L17.5 14 L17.5 21 Z', fill: WOOD },
  // 발판
  { d: 'M7 13.5 L25 13.5 L25 10.5 L7 10.5 Z', fill: WOOD },
  { d: 'M7 10.5 L25 10.5 L25 9.5 L7 9.5 Z', fill: WOOD_LIGHT },
  // 난간
  { d: 'M8.5 9.5 L8.5 6 M12 9.5 L12 6 M20 9.5 L20 6 M23.5 9.5 L23.5 6', stroke: WOOD_DARK, width: 1.4 },
  { d: 'M8 6.4 L24 6.4', stroke: WOOD, width: 1.6 },
  // 지붕
  { d: 'M5 6.5 L16 0.5 L27 6.5 Z', fill: '@color' },
  { d: 'M16 0.5 L27 6.5 L16 6.5 Z', fill: '@accent' },
  { d: 'M5 6.5 L27 6.5', stroke: OUTLINE, width: 0.8 },
]

/** 마법탑 — 원뿔 지붕의 첨탑. 창에서 빛이 샌다. */
const MAGE: Art = [
  ...PLINTH,
  // 탑신 (위로 갈수록 좁아진다)
  { d: 'M10 21 L11.2 6 L20.8 6 L22 21 Z', fill: STONE },
  { d: 'M10 21 L11.2 6 L14 6 L13.6 21 Z', fill: STONE_LIGHT },
  // 석재 이음선
  { d: 'M10.6 14 L21.4 14 M10.3 17.5 L21.7 17.5', stroke: STONE_DARK, width: 0.7 },
  // 창 — 아치형, 빛난다
  { d: 'M14.4 12.5 L14.4 10 Q16 8.4 17.6 10 L17.6 12.5 Z', fill: '@accent' },
  // 원뿔 지붕
  { d: 'M8.5 6.5 L16 -1 L23.5 6.5 Z', fill: '@color' },
  { d: 'M16 -1 L23.5 6.5 L16 6.5 Z', fill: '@accent' },
  { d: 'M8.5 6.5 L23.5 6.5', stroke: OUTLINE, width: 0.8 },
]

/** 대포탑 — 톱니 흉벽을 두른 낮고 두꺼운 포대. */
const CANNON: Art = [
  ...PLINTH,
  // 몸체
  { d: 'M7 21 L7 10 L25 10 L25 21 Z', fill: STONE },
  { d: 'M7 21 L7 10 L11 10 L11 21 Z', fill: STONE_LIGHT },
  { d: 'M7.5 15.5 L24.5 15.5', stroke: STONE_DARK, width: 0.7 },
  // 톱니 흉벽
  { d: 'M6 10 L10 10 L10 6 L6 6 Z', fill: STONE },
  { d: 'M13.5 10 L18.5 10 L18.5 6 L13.5 6 Z', fill: STONE },
  { d: 'M22 10 L26 10 L26 6 L22 6 Z', fill: STONE },
  { d: 'M6 6.6 L10 6.6 M13.5 6.6 L18.5 6.6 M22 6.6 L26 6.6', stroke: STONE_LIGHT, width: 1.2 },
  // 포문
  { d: 'M14 13.5 L18 13.5 L18 17 L14 17 Z', fill: '@color' },
  { d: 'M16 15.2 m -1.4 0 a 1.4 1.4 0 1 0 2.8 0 a 1.4 1.4 0 1 0 -2.8 0', fill: STONE_DARK },
]

/** 얼음탑 — 서리 낀 오벨리스크. 결정이 박혀 있다. */
const FROST: Art = [
  ...PLINTH,
  // 오벨리스크
  { d: 'M11.5 21 L13 7 L19 7 L20.5 21 Z', fill: STONE },
  { d: 'M11.5 21 L13 7 L15.4 7 L14.6 21 Z', fill: STONE_LIGHT },
  // 서리 결정 — 탑 꼭대기
  { d: 'M16 0.5 L19.5 6 L16 11.5 L12.5 6 Z', fill: '@accent' },
  { d: 'M16 0.5 L19.5 6 L16 6 Z', fill: '@color' },
  // 몸통에 박힌 작은 결정들
  { d: 'M16 13 L17.6 15.4 L16 17.8 L14.4 15.4 Z', fill: '@accent' },
  { d: 'M13 18.5 L14 20 L13 21.5 L12 20 Z', fill: '@accent' },
  { d: 'M19 18.5 L20 20 L19 21.5 L18 20 Z', fill: '@accent' },
]

/** 독 분사탑 — 연금술 가마솥을 얹은 나무 단. */
const VENOM: Art = [
  ...PLINTH,
  // 나무 다리
  { d: 'M10.5 21 L11.5 15 L13.5 15 L13 21 Z', fill: WOOD_DARK },
  { d: 'M21.5 21 L20.5 15 L18.5 15 L19 21 Z', fill: WOOD_DARK },
  { d: 'M9 15.5 L23 15.5 L23 13.5 L9 13.5 Z', fill: WOOD },
  // 가마솥
  { d: 'M9.5 6.5 L22.5 6.5 L21 12.5 Q16 15.5 11 12.5 Z', fill: STONE_DARK },
  { d: 'M9.5 6.5 L14 6.5 L13 12.8 Q11.6 12.4 11 12.5 Z', fill: STONE },
  { d: 'M8.5 5.5 L23.5 5.5 L23.5 7 L8.5 7 Z', fill: STONE },
  // 부글거리는 액체
  { d: 'M11 7 L21 7 L20.4 9 Q16 10.8 11.6 9 Z', fill: '@accent' },
  { d: 'M13 5 m -1 0 a 1 1 0 1 0 2 0 a 1 1 0 1 0 -2 0', fill: '@accent' },
  { d: 'M19 3.6 m -0.8 0 a .8 .8 0 1 0 1.6 0 a .8 .8 0 1 0 -1.6 0', fill: '@accent' },
]

export const TOWER_ART: Record<string, Art> = {
  archer: ARCHER,
  mage: MAGE,
  cannon: CANNON,
  frost: FROST,
  venom: VENOM,
}

/** 바위 — 각진 화강암 덩어리. */
export const ROCK_ART: Art = [
  { d: 'M4 27 L2.5 18 L8 11 L18 9 L27 14 L29 23 L24 28 Z', fill: '#454c5e' },
  { d: 'M8 11 L18 9 L20 15 L10.5 17 Z', fill: '#5b6478' },
  { d: 'M20 15 L27 14 L29 23 L23 22 Z', fill: '#333a49' },
  { d: 'M4 27 L2.5 18 L8 11 L18 9 L27 14 L29 23 L24 28 Z', stroke: 'rgba(0,0,0,0.5)', width: 1.1 },
]

/** 침엽수 — 중세 숲의 기본. 삼각 세 겹. */
export const TREE_ART: Art = [
  { d: 'M14.5 29 L14.5 22 L17.5 22 L17.5 29 Z', fill: WOOD_DARK },
  { d: 'M16 17 L24 25 L8 25 Z', fill: '#2f4a28' },
  { d: 'M16 10.5 L22.5 19 L9.5 19 Z', fill: '#37582e' },
  { d: 'M16 3.5 L21 12.5 L11 12.5 Z', fill: '#3f6434' },
  { d: 'M16 3.5 L21 12.5 L16 12.5 Z', fill: '#2f4a28' },
]

/** 왕성 — 경로 끝. 여기가 지켜야 하는 곳이라는 걸 그림으로 말한다. */
export const CASTLE_ART: Art = [
  { d: 'M3 30 L29 30 L29 14 L3 14 Z', fill: STONE },
  { d: 'M3 30 L3 14 L9 14 L9 30 Z', fill: STONE_LIGHT },
  { d: 'M3.5 21 L28.5 21', stroke: STONE_DARK, width: 0.8 },
  // 양 옆 탑
  { d: 'M1 30 L1 9 L9 9 L9 30 Z', fill: STONE },
  { d: 'M23 30 L23 9 L31 9 L31 30 Z', fill: STONE },
  { d: 'M1 9 L3 9 L3 6 L1 6 Z M4 9 L6 9 L6 6 L4 6 Z M7 9 L9 9 L9 6 L7 6 Z', fill: STONE },
  { d: 'M23 9 L25 9 L25 6 L23 6 Z M26 9 L28 9 L28 6 L26 6 Z M29 9 L31 9 L31 6 L29 6 Z', fill: STONE },
  { d: 'M11 14 L13 14 L13 11 L11 11 Z M15 14 L17 14 L17 11 L15 11 Z M19 14 L21 14 L21 11 L19 11 Z', fill: STONE },
  // 성문
  { d: 'M13 30 L13 21 Q16 18 19 21 L19 30 Z', fill: '#2a1d12' },
  { d: 'M16 30 L16 20.2', stroke: WOOD, width: 0.8 },
  // 깃발
  { d: 'M16 6 L16 -1', stroke: WOOD_DARK, width: 1 },
  { d: 'M16 -0.5 L24 2 L16 4.5 Z', fill: '#5aa9e6' },
]

/**
 * 적 출현 지점 — 무너진 성문.
 *
 * 처음엔 갈색 폐허로 그렸는데 흙길 위에 놓이니 **길과 같은 색이라 안 보였다**.
 * 그래서 차가운 회색 폐석으로 바꾸고 아치 안쪽을 새까맣게 파냈다. 왕성이
 * 밝은 석재 + 푸른 깃발이라면, 이쪽은 부서진 잿빛 돌 + 찢긴 붉은 깃발이다.
 */
export const GATE_ART: Art = [
  // 왼쪽 기둥 — 위가 부서져 있다
  { d: 'M2 30 L2 11 L11 11 L11 30 Z', fill: RUIN },
  { d: 'M2 30 L2 11 L5 11 L5 30 Z', fill: RUIN_LIGHT },
  { d: 'M2 11 L4.5 11 L4.5 7.5 L2 7.5 Z M7 11 L9.5 11 L9.5 9 L7 9 Z', fill: RUIN },
  // 오른쪽 기둥 — 더 많이 무너졌다
  { d: 'M21 30 L21 14 L30 14 L30 30 Z', fill: RUIN },
  { d: 'M21 30 L21 14 L24 14 L24 30 Z', fill: RUIN_LIGHT },
  { d: 'M25 14 L27.5 14 L27.5 10.5 L25 10.5 Z', fill: RUIN },
  // 아치와 그 안의 어둠 — "여기서 나온다"를 가장 강하게 말하는 부분
  { d: 'M11 30 L11 18 Q16 10.5 21 18 L21 30 Z', fill: '#100e0d' },
  { d: 'M10 19 Q16 9.5 22 19 L22 15.5 Q16 6.5 10 15.5 Z', fill: RUIN },
  { d: 'M10 19 Q16 9.5 22 19', stroke: RUIN_DARK, width: 0.7 },
  // 갈라진 틈
  { d: 'M3.5 15 L4.5 19 L3 23 M27 19 L26 23', stroke: RUIN_DARK, width: 0.8 },
  // 찢긴 붉은 깃발 — 왕성의 푸른 깃발과 대비된다
  { d: 'M6.5 8 L6.5 -1', stroke: WOOD_DARK, width: 1 },
  { d: 'M6.5 -0.5 L13.5 1.4 L11 2.6 L13 4 L6.5 4.4 Z', fill: '#a83232' },
]

// 적에게 쓰는 재질. 종족이 달라도 같은 세계의 장비를 든 것처럼 보여야 한다.
const METAL = '#a7b0c0'
const METAL_LIGHT = '#d2d9e6'
const METAL_DARK = '#565f70'
const BONE = '#e8dcc0'
const LEATHER = '#6b4a2c'
const LEATHER_DARK = '#4a3119'

/**
 * 적 아트.
 *
 * 타워와 같은 3/4 측면 시점이고, 진행 방향에 따라 좌우로 뒤집어 그린다
 * (위에서 내려다본 정면 도형은 무엇인지 알아볼 수 없다).
 *
 * 중요 — 그림은 바뀌어도 **실루엣 규칙은 그대로다**. 각 적의 외곽이 원래의
 * 도형 계열로 읽히도록 잡았고(둥근 고블린 / 앞으로 쏠린 늑대 기수 /
 * 각진 강철 병사 / 위아래로 뾰족한 로브 / 방패 든 트롤 / 가시 돋은 마왕),
 * 뒤에는 같은 도형의 어두운 배경을 한 겹 깔아 형태 정보를 유지한다.
 * 색각 이상 사용자가 방어 유형을 판단하는 근거가 색이면 안 되기 때문이다.
 */
export const ENEMY_ART: Record<string, Art> = {
  /** 고블린 — 창 든 잡병. 둥글고 작다. */
  grunt: [
    { d: 'M12 25 L12 29 M20 25 L20 29', stroke: LEATHER_DARK, width: 2.4 },
    { d: 'M10 26 Q9 16 16 16 Q23 16 22 26 Z', fill: '@color' },
    { d: 'M11.5 26 Q11 19 16 19 Q21 19 20.5 26 Z', fill: LEATHER },
    { d: 'M16 19.5 L16 26', stroke: LEATHER_DARK, width: 0.8 },
    { d: 'M10.5 19 L6.5 23', stroke: '@color', width: 2.6 },
    { d: 'M21.5 19 L25.5 22', stroke: '@color', width: 2.6 },
    // 창
    { d: 'M27 8 L24 27', stroke: WOOD, width: 1.4 },
    { d: 'M27.2 8.4 L25.4 4.6 L29.2 6.4 Z', fill: METAL_LIGHT },
    // 머리와 뾰족한 귀
    { d: 'M11 10 L6.2 6.6 L10.6 13 Z M21 10 L25.8 6.6 L21.4 13 Z', fill: '@color' },
    { d: 'M10.5 11.5 A5.5 5.5 0 1 1 21.5 11.5 A5.5 5.5 0 1 1 10.5 11.5 Z', fill: '@color' },
    // 코가리개 투구
    { d: 'M10.6 11.4 Q16 4.4 21.4 11.4 L21.4 12.4 L10.6 12.4 Z', fill: METAL_DARK },
    { d: 'M15.2 11.8 L16.8 11.8 L16.8 15.6 L15.2 15.6 Z', fill: METAL_DARK },
    { d: 'M11.6 9.6 Q16 5.4 20.4 9.6', stroke: METAL, width: 0.9 },
    { d: 'M13.3 13.6 L14.5 13.6 M17.5 13.6 L18.7 13.6', stroke: '#1a1208', width: 1.7 },
  ],

  /** 늑대 기수 — 앞으로 쏠린 쐐기. 창끝이 진행 방향을 가리킨다. */
  runner: [
    { d: 'M7 20.4 Q3.4 19.4 1.6 15', stroke: '#8a7a63', width: 2.4 },
    // 늑대 — 등이 솟고 가슴이 두껍다
    { d: 'M7 21 Q9 16.4 15 16.4 Q21 16.4 24 18.6 Q25 22 21 23.6 Q14 25 9 24 Q6.6 23 7 21 Z', fill: '#8a7a63' },
    { d: 'M10 23.6 L9 29 M14 24.4 L13.6 29 M19.5 23.6 L20 29 M23 22.6 L24.6 28', stroke: '#6b5c47', width: 1.9 },
    { d: 'M22.4 19.2 Q26 17.6 27.4 19.6', stroke: '#9c8b72', width: 3 },
    { d: 'M26.6 17.6 L26.1 14.2 L28.7 16.8 Z', fill: '#9c8b72' },
    { d: 'M26 17.6 L31.4 18.6 L30.6 21.4 L26.6 21.4 Z', fill: '#9c8b72' },
    { d: 'M29.3 19.5 L30.7 19.3', stroke: '#241c14', width: 1.1 },
    { d: 'M30.9 20.6 L31.5 20.4', stroke: '#241c14', width: 0.9 },
    // 기수 — 안장 위에서 앞으로 숙인다
    { d: 'M12.4 17 Q11.6 11.2 16.2 10.9 Q20.2 10.7 19.8 16.6 Z', fill: '@color' },
    { d: 'M13.6 6.8 A3.4 3.4 0 1 1 20.4 6.8 A3.4 3.4 0 1 1 13.6 6.8 Z', fill: '@color' },
    { d: 'M13.6 7 Q17 2.2 20.4 7 L20.4 8 L13.6 8 Z', fill: METAL_DARK },
    { d: 'M15 9.4 L16.2 9.4 M17.8 9.4 L19 9.4', stroke: '#1a1208', width: 1.3 },
    // 창 — 앞으로 길게 뻗어 쐐기를 만든다
    { d: 'M11.4 15 L30.6 8.4', stroke: WOOD, width: 1.4 },
    { d: 'M30.4 8.6 L26.8 6.6 L31.7 5.4 Z', fill: METAL_LIGHT },
  ],

  /** 강철 병사 — 통짜 투구와 판금. 각진 실루엣. */
  armored: [
    { d: 'M12 25 L12 29 M20 25 L20 29', stroke: METAL_DARK, width: 2.8 },
    { d: 'M9 25 Q8 15 16 15 Q24 15 23 25 Z', fill: METAL },
    { d: 'M9.8 20 Q16 22.4 22.2 20', stroke: METAL_DARK, width: 0.9 },
    { d: 'M16 15.5 L16 25', stroke: METAL_DARK, width: 0.7 },
    { d: 'M6 18.5 Q8 13 12.5 15 Q10.2 18 9.6 20.4 Z', fill: METAL_LIGHT },
    { d: 'M26 18.5 Q24 13 19.5 15 Q21.8 18 22.4 20.4 Z', fill: METAL_LIGHT },
    // 방패
    { d: 'M2.5 15.5 L9 15.5 L9 22.5 L5.75 26 L2.5 22.5 Z', fill: '@color' },
    { d: 'M5.75 15.5 L5.75 26', stroke: METAL_DARK, width: 0.8 },
    { d: 'M2.5 15.5 L9 15.5 L9 22.5 L5.75 26 L2.5 22.5 Z', stroke: METAL, width: 1 },
    // 통짜 투구
    { d: 'M11 12 Q16 4.6 21 12 L21 15 Q16 17.2 11 15 Z', fill: METAL },
    { d: 'M12.2 11.4 L15 11.4 L15 12.9 L12.2 12.9 Z M17 11.4 L19.8 11.4 L19.8 12.9 L17 12.9 Z', fill: '#12151c' },
    { d: 'M16 5.4 L16 15.8', stroke: METAL_LIGHT, width: 0.9 },
    { d: 'M16 5.4 Q16.4 1 19.4 0.4 Q17.4 3 17 5.6 Z', fill: '@color' },
    // 검
    { d: 'M24.5 21 L29 8.5', stroke: METAL_LIGHT, width: 1.7 },
    { d: 'M23.6 21.6 L26.8 20.4', stroke: WOOD_DARK, width: 1.8 },
  ],

  /** 주술사 — 위아래로 뾰족한 로브. 마름모로 읽힌다. */
  shaman: [
    { d: 'M16 2.5 L24 16.5 L20 28.5 L12 28.5 L8 16.5 Z', fill: '@color' },
    { d: 'M16 4 L16 28', stroke: 'rgba(0,0,0,0.22)', width: 0.9 },
    { d: 'M16 4.2 L21.6 13 Q16 16.2 10.4 13 Z', fill: '#1d1630' },
    { d: 'M13.6 11.6 L15 11.6 M17 11.6 L18.4 11.6', stroke: '#ffe08a', width: 1.7 },
    { d: 'M13.2 20 L18.8 20 M16 17.2 L16 22.8', stroke: 'rgba(255,255,255,0.5)', width: 1 },
    // 지팡이와 오브
    { d: 'M25.5 28 L23.6 8', stroke: WOOD_DARK, width: 1.5 },
    { d: 'M23.4 6.6 A2.6 2.6 0 1 1 23.5 6.6 Z', fill: '#cbb2ff' },
    { d: 'M22.6 5.8 A1 1 0 1 1 22.7 5.8 Z', fill: '#ffffff' },
  ],

  /** 와이번 — 날개는 렌더러가 뒤에 따로 그린다(퍼덕임이 공중 신호라서). */
  wyvern: [
    // 꼬리와 갈퀴
    { d: 'M12 19.4 Q7 21.4 3.4 17.4', stroke: '@color', width: 2.6 },
    { d: 'M3.8 17.8 L0.4 14.4 L1.2 19.6 Z', fill: '@color' },
    // 몸통
    { d: 'M10.8 18.4 Q10.8 12.8 16.5 12.8 Q22.2 12.8 22.2 18.4 Q22.2 22.6 16.5 22.6 Q10.8 22.6 10.8 18.4 Z', fill: '@color' },
    { d: 'M12.4 19.4 Q16.5 22.8 20.6 19.4 Q20.2 21.9 16.5 21.9 Q12.8 21.9 12.4 19.4 Z', fill: 'rgba(255,255,255,0.24)' },
    // 목
    { d: 'M20.4 15 Q24.6 14 25.6 9.8', stroke: '@color', width: 3 },
    // 머리와 턱
    { d: 'M23.6 9.8 Q26 6.4 29.4 7.6 L30.6 10.2 L26.4 11.6 Q24 11.6 23.6 9.8 Z', fill: '@color' },
    { d: 'M26.4 11.2 L30.4 10 L30 11.9 L26.8 12.4 Z', fill: '@color' },
    { d: 'M25.6 7.6 L21.6 5 L26.4 7.4 Z', fill: BONE },
    { d: 'M13.2 13.6 L12.4 11 L15 12.8 Z M17.2 12.6 L17 10 L19.4 12.6 Z', fill: BONE },
    { d: 'M27.6 9 L28.9 8.8', stroke: '#101a1c', width: 1.3 },
    // 움츠린 뒷다리
    { d: 'M13.8 22 L12.8 26 M19.2 22 L20.4 26', stroke: '@color', width: 2 },
    { d: 'M11.6 26.2 L14.2 25.6 M19 25.8 L21.6 26.4', stroke: BONE, width: 1.2 },
  ],

  /** 트롤 파괴자 — 나무 방패를 든 거구. 방패 실루엣이 살아 있어야 한다. */
  brute: [
    { d: 'M11.5 24 L10.5 30 M20.5 24 L21.5 30', stroke: '#6b3f22', width: 3.2 },
    { d: 'M8 25.5 Q6 12.5 16 12.5 Q26 12.5 24 25.5 Z', fill: '@color' },
    { d: 'M12 25 Q11 17.5 16 17.5 Q21 17.5 20 25 Z', fill: 'rgba(255,255,255,0.16)' },
    { d: 'M10.4 24.4 Q16 27.4 21.6 24.4', stroke: 'rgba(0,0,0,0.22)', width: 1.2 },
    { d: 'M11.4 8 A4.8 4.8 0 1 1 20.6 8 A4.8 4.8 0 1 1 11.4 8 Z', fill: '@color' },
    { d: 'M12.2 5.2 L8.8 0.8 L14.2 3.6 Z M19.8 5.2 L23.2 0.8 L17.8 3.6 Z', fill: BONE },
    { d: 'M13.4 8 L14.8 8 M17.2 8 L18.6 8', stroke: '#2a1508', width: 1.8 },
    { d: 'M13.4 10.6 Q16 12.6 18.6 10.6', stroke: '#2a1508', width: 1 },
    // 나무 방패
    { d: 'M1 13.5 L8.5 13.5 L8.5 22 L4.75 26.5 L1 22 Z', fill: WOOD },
    { d: 'M1.4 16.4 L8.1 16.4 M1.4 19.4 L8.1 19.4', stroke: WOOD_DARK, width: 0.9 },
    { d: 'M4.75 18 A1.7 1.7 0 1 1 4.85 18 Z', fill: METAL },
    { d: 'M1 13.5 L8.5 13.5 L8.5 22 L4.75 26.5 L1 22 Z', stroke: WOOD_DARK, width: 1 },
    // 곤봉
    { d: 'M23.5 22 L28.4 13', stroke: WOOD_DARK, width: 2.3 },
    { d: 'M28.4 12 A3.3 3.3 0 1 1 28.5 12 Z', fill: WOOD_LIGHT },
    { d: 'M27 10.6 L28 9.2 M30 12.4 L31.4 11.8', stroke: BONE, width: 1.2 },
  ],

  /** 흑마법사 — 주술사와 같은 계열이되 더 크고 어둡다. */
  warlock: [
    { d: 'M16 2 L25 16 L21 29 L11 29 L7 16 Z', fill: '@color' },
    { d: 'M16 3.5 L16 29', stroke: 'rgba(0,0,0,0.26)', width: 0.9 },
    { d: 'M9.6 13.4 L13 5.6 L16 10 L19 5.6 L22.4 13.4 Q16 16.4 9.6 13.4 Z', fill: '#2b1030' },
    { d: 'M13.4 11.8 L14.8 11.8 M17.2 11.8 L18.6 11.8', stroke: '#ff9de0', width: 1.8 },
    { d: 'M16 18.6 L19.2 22 L16 25.4 L12.8 22 Z', stroke: 'rgba(255,255,255,0.5)', width: 1.1 },
    // 뒤틀린 지팡이와 떠다니는 룬 오브
    { d: 'M26.4 28 Q24.6 18 26.6 8.6', stroke: WOOD_DARK, width: 1.6 },
    { d: 'M26.6 7.4 A2.4 2.4 0 1 1 26.7 7.4 Z', fill: '#ff9de0' },
    { d: 'M25.8 6.6 A0.9 0.9 0 1 1 25.9 6.6 Z', fill: '#ffffff' },
    { d: 'M5.4 12.4 A1.6 1.6 0 1 1 5.5 12.4 Z', fill: '#ff9de0' },
    { d: 'M6.6 20 A1.1 1.1 0 1 1 6.7 20 Z', fill: '#ff9de0' },
  ],

  /** 수정 감시자 — 판금을 두른 부유 결정. 각진 실루엣을 그대로 쓴다. */
  sentinel: [
    { d: 'M16 3.5 L25.5 9.4 L25.5 21.6 L16 27.5 L6.5 21.6 L6.5 9.4 Z', fill: '@color' },
    { d: 'M16 3.5 L16 27.5 M6.5 9.4 L25.5 21.6 M25.5 9.4 L6.5 21.6', stroke: 'rgba(255,255,255,0.16)', width: 0.8 },
    { d: 'M6.5 9.4 L16 3.5 L25.5 9.4 L20.6 12.4 L16 9.6 L11.4 12.4 Z', fill: METAL_LIGHT },
    { d: 'M16 3.5 L25.5 9.4 L25.5 21.6 L16 27.5 L6.5 21.6 L6.5 9.4 Z', stroke: METAL, width: 1.8 },
    { d: 'M16 16.5 A3.2 3.2 0 1 1 16.1 16.5 Z', fill: '#ffffff' },
    { d: 'M16 16.5 A1.5 1.5 0 1 1 16.1 16.5 Z', fill: '#1b2340' },
    { d: 'M2.6 16 L4.6 12.6 L5.6 16.8 L3.6 19.2 Z M29.4 16 L27.4 12.6 L26.4 16.8 L28.4 19.2 Z', fill: METAL },
  ],

  /** 마왕 그라즈 — 뿔·왕관·어깨 가시로 가시 돋은 실루엣을 만든다. */
  overlord: [
    { d: 'M6 28 Q4 13.5 16 11.5 Q28 13.5 26 28 Z', fill: '#3a0d10' },
    { d: 'M9.5 27.5 Q8.5 14 16 14 Q23.5 14 22.5 27.5 Z', fill: '@color' },
    { d: 'M11.8 26.5 Q11.4 17.4 16 17.4 Q20.6 17.4 20.2 26.5 Z', fill: METAL_DARK },
    { d: 'M16 18.6 L18.2 21.6 L16 24.6 L13.8 21.6 Z', fill: '#f0c674' },
    { d: 'M5 16.5 Q7 10 12.4 13.2 Q9.4 16.2 8.8 19.4 Z', fill: METAL_DARK },
    { d: 'M27 16.5 Q25 10 19.6 13.2 Q22.6 16.2 23.2 19.4 Z', fill: METAL_DARK },
    { d: 'M6.6 12.6 L4.6 7.6 L9.2 11 Z M25.4 12.6 L27.4 7.6 L22.8 11 Z', fill: BONE },
    { d: 'M11 8.2 A5 5 0 1 1 21 8.2 A5 5 0 1 1 11 8.2 Z', fill: '@color' },
    { d: 'M11.6 6.4 Q16 10 20.4 6.4 L20.4 9.4 Q16 12.4 11.6 9.4 Z', fill: '#1a0708' },
    { d: 'M13.2 8.4 L14.6 8.4 M17.4 8.4 L18.8 8.4', stroke: '#ffd166', width: 1.9 },
    { d: 'M11.8 5.2 L6.8 0.2 L13.2 3 Z M20.2 5.2 L25.2 0.2 L18.8 3 Z', fill: BONE },
    { d: 'M11.6 4.8 L13 1.4 L14.5 3.6 L16 0.4 L17.5 3.6 L19 1.4 L20.4 4.8 Z', fill: '#f0c674' },
    // 도끼
    { d: 'M23.6 27 L28.2 8.6', stroke: WOOD_DARK, width: 1.9 },
    { d: 'M27.8 9.8 Q32.6 11.6 30.2 16.4 Q27.6 13.8 26.6 13.4 Z', fill: METAL_LIGHT },
  ],
}

/**
 * 무기 아트.
 *
 * 건물과 달리 이쪽은 목표를 향해 회전하므로, **회전축이 (16,16)** 이고
 * 무기는 오른쪽(+x)을 향하도록 그렸다. 건물 전체를 돌리면 어색하지만
 * 무기가 어디를 겨누는지는 여전히 보여야 해서 이렇게 나눴다.
 */
export const WEAPON_ART: Record<string, Art> = {
  /** 궁수탑 — 시위를 당긴 활. */
  arrow: [
    { d: 'M13 7 Q20 16 13 25', stroke: WOOD, width: 2.2 },
    { d: 'M13.2 7 L13.2 25', stroke: '#e8e3d6', width: 0.9 },
    { d: 'M11 16 L28.4 16', stroke: WOOD_DARK, width: 1.4 },
    { d: 'M30 16 L25.4 13.5 L25.4 18.5 Z', fill: METAL_LIGHT },
    { d: 'M12 16 L9 13.8 M12 16 L9 18.2', stroke: '#e8e3d6', width: 1 },
  ],

  /** 마법탑 — 룬 고리를 두른 부유 오브. */
  orb: [
    { d: 'M20 16 A9 9 0 1 1 20.1 16 Z', stroke: '@accent', width: 1.1 },
    { d: 'M20 16 A6.2 6.2 0 1 1 20.1 16 Z', fill: '@accent' },
    { d: 'M17.4 12.6 L22.6 19.4 M22.6 12.6 L17.4 19.4 M20 10.4 L20 21.6', stroke: 'rgba(255,255,255,0.6)', width: 0.9 },
  ],

  /** 대포탑 — 쇠테를 두른 봄바드. */
  cannon: [
    { d: 'M8.6 20 L15 20 L13.4 24.6 L9.2 24.6 Z', fill: WOOD_DARK },
    { d: 'M11.6 16 A4.3 4.3 0 1 1 11.7 16 Z', fill: METAL_DARK },
    { d: 'M12 11.4 L27 12.4 L27 19.6 L12 20.6 Z', fill: METAL_DARK },
    { d: 'M12 11.4 L27 12.4 L27 14.2 L12 13.5 Z', fill: METAL },
    { d: 'M16 11.7 L16 20.3 M21 12 L21 20', stroke: METAL, width: 1.6 },
    { d: 'M26 12.2 L29.4 11.6 L29.4 20.4 L26 19.8 Z', fill: METAL },
  ],

  /** 얼음탑 — 떠 있는 서리 결정 무리. */
  crystal: [
    { d: 'M20 6.5 L25 16 L20 25.5 L15 16 Z', fill: '@accent' },
    { d: 'M20 6.5 L25 16 L20 16 Z', fill: 'rgba(255,255,255,0.45)' },
    { d: 'M20 25.5 L15 16 L20 16 Z', fill: 'rgba(0,0,0,0.18)' },
    { d: 'M11.8 12 L14.4 16 L11.8 20 L9.2 16 Z', fill: '@accent' },
    { d: 'M27.2 13 L29 16 L27.2 19 L25.4 16 Z', fill: '@accent' },
  ],

  /** 독 분사탑 — 코르크를 막은 연금술 플라스크. */
  flask: [
    { d: 'M17 6.4 L21.8 6.4 L21.8 9 L17 9 Z', fill: WOOD },
    { d: 'M17.8 9 L21 9 L21 14.8 L17.8 14.8 Z', fill: 'rgba(255,255,255,0.32)' },
    { d: 'M19.4 19.6 A6.2 6.2 0 1 1 19.5 19.6 Z', fill: '@accent' },
    { d: 'M19.4 19.6 A6.2 6.2 0 1 1 19.5 19.6 Z', stroke: 'rgba(255,255,255,0.4)', width: 1 },
    { d: 'M16.6 17.4 A1.5 1.5 0 1 1 16.7 17.4 Z', fill: 'rgba(255,255,255,0.5)' },
    { d: 'M22.2 21 A1 1 0 1 1 22.3 21 Z', fill: 'rgba(255,255,255,0.4)' },
  ],
}

/**
 * 아트를 캔버스에 그린다.
 *
 * @param size 32 좌표계를 몇 픽셀로 펼칠지
 * @param anchorBottom true면 (cx, cy)를 그림의 **바닥 중앙**으로 삼는다.
 *   건물은 발밑이 타일에 닿아야 서 있는 것처럼 보이므로 기본값이다.
 * @param flipX 좌우 반전. 적이 진행 방향을 바라보게 할 때 쓴다.
 */
export function drawArt(
  ctx: CanvasRenderingContext2D,
  art: Art,
  cx: number,
  cy: number,
  size: number,
  tint?: Tint,
  anchorBottom = true,
  flipX = false,
): void {
  const scale = size / 32
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(flipX ? -scale : scale, scale)
  ctx.translate(-16, anchorBottom ? -29 : -16)

  for (const layer of art) {
    const path = new Path2D(layer.d)
    if (layer.fill) {
      ctx.fillStyle = resolve(layer.fill, tint)
      ctx.fill(path)
    }
    if (layer.stroke) {
      ctx.strokeStyle = resolve(layer.stroke, tint)
      ctx.lineWidth = layer.width ?? 1
      ctx.lineCap = 'round'
      ctx.stroke(path)
    }
  }
  ctx.restore()
}

function resolve(value: string, tint?: Tint): string {
  if (value === '@color') return tint?.color ?? '#888'
  if (value === '@accent') return tint?.accent ?? '#ccc'
  return value
}
