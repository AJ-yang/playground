import type { LevelDef } from './levels'
import {
  LEVEL_ANJU,
  LEVEL_FORK,
  LEVEL_GATE,
  LEVEL_GREENVALE,
  LEVEL_HIGHLANDS,
  LEVEL_RAMPARTS,
} from './levels'
import { g, type WaveDef } from './waves'

/**
 * 스테이지 — 맵 + 웨이브 + 해금 보상을 묶는다.
 *
 * 진행 설계: **스테이지를 깰 때마다 기물 1종이 열린다.** 그래서 각 스테이지는
 * "그때까지 가진 기물만으로 풀 수 있는" 문제여야 하고, 새로 열린 기물은
 * 다음 스테이지에서 곧바로 필요해지도록 위협을 배치했다. 그러지 않으면
 * 해금이 그냥 숫자가 늘어나는 일이 되고 배우는 게 없다.
 *
 *   S1 궁수대만        → 총통·화차 해금
 *   S2 +갑주·결사대  → 거마작 해금 (총통으로 갑주를 풀고 화차로 물량을 정리한다)
 *   S3 +기마·산개    → 조총 해금   (화차가 기병에 무력함을 여기서 배운다)
 *   S4 +대군·운제    → 비격진천뢰 해금 (사거리로 긴 진격로를 덮어야 한다)
 *   S5 +철기·충차    → 불랑기포 해금 (양면 저항은 순수 피해로 뚫는다)
 *   S6 전부 + 보스                    (기병 무리는 기병에 닿는 광역으로)
 *
 * **스테이지당 하나로 고정하지 않는다.** S1이 둘을 여는 이유는 S2가 갑주와
 * 물량을 동시에 던지기 때문이다. 지켜야 하는 것은 개수가 아니라
 * "열린 것은 다음 판에서 곧바로 쓰인다"는 규칙이다.
 */
export interface StageDef {
  id: string
  /** 1부터 시작하는 표시용 번호 */
  index: number
  name: string
  /** 스테이지 선택 화면에 쓰는 한 줄 소개 */
  subtitle: string
  level: LevelDef
  waves: WaveDef[]
  startGold: number
  startLives: number
  /**
   * 클리어 시 열리는 기물 ID들. 빈 배열이면 해금 없음 (최종 스테이지).
   *
   * 처음에는 스테이지당 하나로 고정했는데, 기물이 일곱으로 늘면서 그 규칙이
   * **스테이지 수를 정하는 쪽**이 돼 버렸다. 배우는 순서가 판의 개수를 강제하는
   * 것은 앞뒤가 뒤바뀐 것이라, 한 스테이지가 둘을 열 수 있게 풀었다.
   * 지켜야 할 규칙은 개수가 아니라 **"열린 것은 다음 판에서 곧바로 쓰인다"** 다.
   */
  unlocksTowers: string[]
}

/**
 * 게임 시작 시점부터 쓸 수 있는 기물 — **삼수병 중 둘**.
 *
 * 사수(멀리서 얇게)와 살수(붙어서 두껍게)가 정반대 축이라, 첫 판부터
 * 선택이 생긴다. 예전에 궁수 하나만 주었을 때는 열일곱 전략이 전부 똑같은
 * 판을 돌려 튜토리얼이 아무것도 가르치지 않았다.
 */
export const STARTING_TOWERS: readonly string[] = ['archer', 'sword']

// ────────────────────────────── S1 남해 포구 ──────────────────────────────
// 궁수대 하나로 풀 수 있어야 한다. 방어 스탯이 있는 적은 넣지 않는다.

const WAVES_S1: WaveDef[] = [
  {
    id: 1,
    prepTime: 22,
    reward: 25,
    groups: [g('grunt', 9, 1.15)],
  },
  {
    id: 2,
    prepTime: 16,
    reward: 25,
    groups: [g('grunt', 12, 1.1)],
  },
  {
    id: 3,
    prepTime: 16,
    reward: 25,
    warning: '척후 — 매우 빠릅니다',
    groups: [g('grunt', 10, 1.05), g('runner', 8, 1.05, 8)],
  },
  {
    id: 4,
    prepTime: 17,
    reward: 25,
    groups: [g('grunt', 14, 1.0), g('runner', 11, 1.0, 8)],
  },
  {
    id: 5,
    prepTime: 17,
    reward: 25,
    groups: [g('grunt', 16, 0.95), g('runner', 20, 0.95, 8)],
  },
  {
    id: 6,
    prepTime: 17,
    reward: 35,
    groups: [g('grunt', 22, 0.9), g('runner', 27, 0.9, 8)],
  },
  {
    id: 7,
    prepTime: 17,
    reward: 45,
    groups: [g('grunt', 30, 0.85), g('runner', 37, 0.85, 8)],
  },
  {
    id: 8,
    prepTime: 26,
    reward: 130,
    warning: '보스 — 왜구 두목',
    groups: [g('grunt', 40, 0.6), g('runner', 50, 0.5, 8), g('goblinking', 1, 1, 14)],
  },
]

// ────────────────────────────── S2 제포 진성 ──────────────────────────────
// 갑병(갑주 12)이 주역. 궁수대만으로는 절대 못 뚫고 총통이 필요하다.

const WAVES_S2: WaveDef[] = [
  {
    id: 1,
    prepTime: 22,
    reward: 25,
    groups: [g('grunt', 7, 1.15), g('runner', 4, 1.15, 8)],
  },
  {
    id: 2,
    prepTime: 16,
    reward: 25,
    groups: [g('grunt', 9, 1.1), g('runner', 5, 1.1, 8)],
  },
  {
    id: 3,
    prepTime: 16,
    reward: 25,
    warning: '갑병 — 갑주 12, 화살이 튕깁니다. 총통이 필요합니다',
    groups: [g('grunt', 7, 1.05), g('armored', 2, 1.05, 8), g('runner', 4, 1.05, 12)],
  },
  {
    id: 4,
    prepTime: 17,
    reward: 35,
    groups: [g('grunt', 9, 1.0), g('armored', 3, 1.0, 8), g('runner', 6, 1.0, 12)],
  },
  {
    id: 5,
    prepTime: 17,
    reward: 45,
    groups: [g('armored', 5, 0.95), g('grunt', 9, 0.95, 8), g('runner', 7, 0.95, 12)],
  },
  {
    id: 6,
    prepTime: 17,
    reward: 60,
    warning: '방패병 — 갑주 22. 화살은 아예 안 통합니다',
    groups: [g('armored', 7, 0.9), g('grunt', 11, 0.9, 8), g('shieldman', 3, 1.2, 12)],
  },
  {
    id: 7,
    prepTime: 17,
    reward: 75,
    groups: [g('armored', 8, 0.85), g('grunt', 14, 0.85, 8), g('runner', 12, 0.85, 12)],
  },
  {
    id: 8,
    prepTime: 17,
    reward: 95,
    warning: '결사대 — 약하지만 뚫리면 생명 3입니다',
    groups: [g('armored', 12, 0.8), g('runner', 15, 0.8, 8), g('zealot', 5, 0.9, 12)],
  },
  {
    id: 9,
    prepTime: 18,
    reward: 125,
    groups: [g('armored', 15, 0.75), g('runner', 20, 0.75, 8), g('shieldman', 5, 1.0, 12), g('zealot', 7, 0.8, 16)],
  },
  {
    id: 10,
    prepTime: 26,
    reward: 300,
    warning: '보스 — 철갑 장수 (갑주 22)',
    groups: [g('armored', 20, 0.75), g('runner', 26, 0.7, 8), g('shieldman', 7, 0.95, 12), g('zealot', 8, 0.7, 16), g('golem', 1, 1, 20)],
  },
]

// ────────────────────────────── S3 새재 갈림길 ──────────────────────────────
// 니탕개의 난. 출발점이 2곳이고 여진 기병이 주역이다.
//
// 화차를 막 얻었는데 **기병에는 닿지 않는다**를 여기서 배운다. 궁기병은 거기에
// 산개 55%까지 겹쳐 총통마저 반만 먹으므로, 남는 답이 활뿐이라는 것이 다음
// 보상(조총)의 존재 이유가 된다.

const WAVES_S3: WaveDef[] = [
  {
    id: 1,
    prepTime: 22,
    reward: 25,
    groups: [g('grunt', 5, 1.15), g('runner', 5, 1.15, 8, 1)],
  },
  {
    id: 2,
    prepTime: 16,
    reward: 25,
    groups: [g('grunt', 6, 1.1), g('runner', 6, 1.1, 8, 1)],
  },
  {
    id: 3,
    prepTime: 16,
    reward: 25,
    warning: '별동대 — 흩어져 달립니다. 화약이 35%밖에 안 먹힙니다',
    groups: [g('grunt', 6, 1.05), g('armored', 1, 1.05, 8, 1), g('shaman', 1, 1.05, 12)],
  },
  {
    id: 4,
    prepTime: 17,
    reward: 25,
    warning: '경기병 — 기마. 화차는 방향을 못 돌립니다',
    groups: [g('grunt', 5, 1.0), g('armored', 1, 1.0, 8, 1), g('shaman', 2, 1.0, 12), g('wyvern', 2, 1.0, 16, 1)],
  },
  {
    id: 5,
    prepTime: 17,
    reward: 30,
    groups: [g('grunt', 6, 0.95), g('armored', 2, 0.95, 8, 1), g('shaman', 2, 0.95, 12), g('wyvern', 2, 0.95, 16, 1)],
  },
  {
    id: 6,
    prepTime: 17,
    reward: 35,
    groups: [g('shaman', 4, 0.9), g('armored', 2, 0.9, 8, 1), g('wyvern', 4, 0.9, 12), g('runner', 6, 0.9, 16, 1)],
  },
  {
    id: 7,
    prepTime: 22,
    reward: 90,
    warning: '중간 보스 — 선봉 기병 (기마·고속)',
    groups: [g('shaman', 4, 0.85), g('shieldman', 2, 1.05, 8, 1), g('runner', 6, 0.85, 12, 1), g('twinwyvern', 1, 1, 15)],
  },
  {
    id: 8,
    prepTime: 17,
    reward: 55,
    groups: [g('shaman', 6, 0.8), g('shieldman', 3, 1.05, 8, 1), g('wyvern', 6, 0.8, 12), g('runner', 10, 0.8, 16, 1)],
  },
  {
    id: 9,
    prepTime: 18,
    reward: 70,
    warning: '궁기병 — 화차도 화약도 안 통합니다. 활이 답입니다',
    groups: [g('shaman', 6, 0.75), g('horsearcher', 6, 0.9, 8, 1), g('shieldman', 4, 1.05, 12), g('runner', 10, 0.75, 16, 1)],
  },
  {
    id: 10,
    prepTime: 18,
    reward: 90,
    groups: [g('shaman', 8, 0.7), g('horsearcher', 6, 0.8, 8, 1), g('armored', 6, 0.7, 12), g('runner', 12, 0.7, 16, 1)],
  },
  {
    id: 11,
    prepTime: 18,
    reward: 115,
    groups: [g('shaman', 10, 0.65), g('horsearcher', 8, 0.75, 8, 1), g('armored', 8, 0.65, 12), g('runner', 16, 0.65, 16, 1)],
  },
  {
    id: 12,
    prepTime: 26,
    reward: 280,
    warning: '보스 — 여진 대추장 (기마 · 산개 62%)',
    groups: [g('shaman', 12, 0.65), g('horsearcher', 11, 0.7, 8, 1), g('armored', 11, 0.65, 12), g('runner', 18, 0.65, 16, 1), g('chieftain', 1, 1, 20)],
  },
]

// ────────────────────────────── S4 안주성 벌판 ──────────────────────────────
// 임진왜란. 길게 되접히는 진격로에 대군이 밀려온다.
//
// 두 가지를 동시에 묻는다. (1) 간자(산개 80%)는 화약이 거의 안 통해 직전
// 보상인 **조총**이 없으면 답이 없고, (2) 운제는 방어가 0인 대신 체력이
// 통째로 커서 **화력 총량**을 묻는다 — 상성 퀴즈가 아닌 유일한 적이다.
// 이 스테이지의 보상(비격진천뢰)이 다음 판의 양면 저항을 푼다.
const WAVES_S4: WaveDef[] = [
  { id: 1, prepTime: 22, reward: 34, groups: [g('grunt', 6, 1.05), g('runner', 7, 1.05, 8)] },
  { id: 2, prepTime: 17, reward: 34, groups: [g('grunt', 7, 1.0), g('runner', 9, 1.0, 8)] },
  {
    id: 3,
    prepTime: 17,
    reward: 39,
    groups: [g('armored', 3, 0.95), g('shieldman', 2, 1.1, 8), g('grunt', 7, 0.95, 12)],
  },
  {
    id: 4,
    prepTime: 18,
    reward: 44,
    warning: '충차 — 양면 저항 탱커, 뚫리면 생명 2',
    groups: [g('armored', 3, 0.9), g('shaman', 3, 0.9, 8), g('zealot', 5, 0.7, 12), g('brute', 1, 1.0, 16)],
  },
  {
    id: 5,
    prepTime: 18,
    reward: 48,
    warning: '운제 — 방어는 없지만 체력이 통째로 큽니다',
    groups: [g('ladder', 1, 1.4), g('armored', 5, 0.85, 6), g('runner', 10, 0.7, 10)],
  },
  {
    id: 6,
    prepTime: 19,
    reward: 54,
    groups: [g('brute', 1, 0.9), g('ladder', 1, 1.3, 6), g('shieldman', 5, 0.9, 10), g('shaman', 5, 0.8, 14)],
  },
  {
    id: 7,
    prepTime: 19,
    reward: 59,
    warning: '간자 — 화약 저항 80%. 조총이 답입니다',
    groups: [g('warlock', 2, 1.1), g('brute', 2, 0.9, 6), g('runner', 14, 0.6, 10), g('wyvern', 3, 0.9, 14)],
  },
  {
    id: 8,
    prepTime: 26,
    reward: 126,
    warning: '중간 보스 — 날랜 왜장 (화약 저항 78%)',
    groups: [g('shaman', 6, 0.7), g('warlock', 3, 1.0, 6), g('runner', 15, 0.55, 10), g('hexmother', 1, 1, 16)],
  },
  {
    id: 9,
    prepTime: 20,
    reward: 69,
    groups: [g('ladder', 2, 1.2), g('brute', 2, 0.85, 6), g('runner', 17, 0.55, 10), g('zealot', 7, 0.5, 14), g('warlock', 4, 0.9, 17)],
  },
  {
    id: 10,
    prepTime: 20,
    reward: 74,
    groups: [g('shieldman', 7, 0.75), g('warlock', 3, 0.95, 6), g('wyvern', 6, 0.8, 10), g('runner', 19, 0.5, 14)],
  },
  {
    id: 11,
    prepTime: 21,
    reward: 78,
    groups: [g('ladder', 2, 1.1), g('brute', 2, 0.8, 6), g('shaman', 8, 0.6, 10), g('runner', 23, 0.45, 14)],
  },
  {
    id: 12,
    prepTime: 21,
    reward: 87,
    groups: [g('warlock', 5, 0.85), g('shieldman', 8, 0.7, 6), g('wyvern', 8, 0.7, 10), g('runner', 26, 0.42, 14)],
  },
  {
    id: 13,
    prepTime: 22,
    reward: 98,
    warning: '고속 물량에 간자가 섞였습니다 — 화약만으로는 안 됩니다',
    groups: [g('runner', 32, 0.34), g('zealot', 10, 0.42, 5), g('brute', 3, 0.75, 10), g('ladder', 2, 1.0, 14), g('warlock', 6, 0.85, 17)],
  },
  {
    id: 14,
    prepTime: 30,
    reward: 244,
    warning: '보스 — 누차 (화력 총량 시험)',
    groups: [
      g('brute', 5, 0.6),
      g('ladder', 3, 0.9, 5),
      g('runner', 40, 0.34, 9),
      g('warlock', 6, 0.7, 13),
      g('siegetower', 1, 1, 20),
    ],
  },
]

// ────────────────────────────── S5 안주 벌판 ──────────────────────────────
// 정묘호란. 철기(갑주 18 + 기마)와 충차(양면 저항)가 주역이다.
//
// 이 스테이지의 질문은 **"한 축의 화력으로는 안 되는 것"** 이다. 철기는 화차가
// 못 닿고 화살이 튕기며, 충차는 화살도 화약도 반씩 흘린다. 직전 보상인
// 비격진천뢰(순수 피해)가 여기서 처음으로 없으면 안 되는 물건이 된다.
//
// 두 갈래가 합류하는 맵이라 앞쪽은 커버리지가, 뒤쪽은 화력 총량이 시험된다.
const WAVES_S5: WaveDef[] = [
  { id: 1, prepTime: 24, reward: 56, groups: [g('grunt', 6, 0.7), g('runner', 5, 0.7, 3, 1)] },
  { id: 2, prepTime: 18, reward: 56, groups: [g('grunt', 7, 0.65), g('runner', 6, 0.7, 4, 1)] },
  {
    id: 3,
    prepTime: 18,
    reward: 62,
    warning: '방패병 — 갑주 22. 화살은 아예 안 통합니다',
    groups: [g('grunt', 7, 0.7), g('shieldman', 3, 1.2, 4, 1), g('runner', 3, 0.8, 8)],
  },
  {
    id: 4,
    prepTime: 18,
    reward: 70,
    groups: [g('armored', 5, 0.9), g('shieldman', 3, 1.1, 4, 1), g('zealot', 3, 0.8, 9, 1)],
  },
  {
    id: 5,
    prepTime: 19,
    reward: 77,
    groups: [g('grunt', 8, 0.65), g('armored', 6, 0.85, 4, 1), g('runner', 6, 0.7, 8)],
  },
  {
    id: 6,
    prepTime: 19,
    reward: 84,
    warning: '궁기병 — 화차도 화약도 안 통합니다. 활이 답입니다',
    groups: [g('horsearcher', 5, 0.9), g('armored', 6, 0.8, 4, 1), g('runner', 8, 0.6, 8)],
  },
  {
    id: 7,
    prepTime: 20,
    reward: 91,
    warning: '철기 — 갑주 두른 기마. 화차는 못 닿고 화살은 튕깁니다',
    groups: [g('sentinel', 3, 1.4), g('shieldman', 5, 1.0, 4, 1), g('grunt', 13, 0.55, 8)],
  },
  {
    id: 8,
    prepTime: 26,
    reward: 174,
    warning: '중간 보스 — 철갑 장수 (갑주 22)',
    groups: [g('grunt', 14, 0.5), g('armored', 7, 0.75, 5, 1), g('golem', 1, 1, 12)],
  },
  {
    id: 9,
    prepTime: 20,
    reward: 100,
    groups: [g('sentinel', 3, 1.2), g('horsearcher', 6, 0.8, 4, 1), g('zealot', 8, 0.5, 8)],
  },
  {
    id: 10,
    prepTime: 20,
    reward: 109,
    warning: '충차 — 양면 저항. 비격진천뢰가 답입니다',
    groups: [g('brute', 3, 1.4), g('shaman', 8, 0.6, 4, 1), g('runner', 21, 0.4, 8)],
  },
  {
    id: 11,
    prepTime: 21,
    reward: 117,
    groups: [g('armored', 9, 0.6), g('sentinel', 3, 1.1, 4, 1), g('horsearcher', 6, 0.75, 9, 1)],
  },
  {
    id: 12,
    prepTime: 21,
    reward: 126,
    warning: '기병 돌격 — 거마작이 없으면 그대로 지나갑니다',
    groups: [g('horsearcher', 9, 0.5), g('runner', 28, 0.32, 3, 1), g('sentinel', 3, 1.1, 9)],
  },
  {
    id: 13,
    prepTime: 22,
    reward: 134,
    groups: [g('brute', 5, 1.2), g('shieldman', 8, 0.7, 4, 1), g('shaman', 11, 0.5, 8)],
  },
  {
    id: 14,
    prepTime: 22,
    reward: 142,
    warning: '중간 보스 — 선봉 기병 (기마·고속)',
    groups: [g('grunt', 21, 0.36), g('horsearcher', 9, 0.5, 4, 1), g('twinwyvern', 1, 1, 11)],
  },
  {
    id: 15,
    prepTime: 23,
    reward: 156,
    groups: [g('sentinel', 6, 0.9), g('brute', 5, 1.1, 4, 1), g('armored', 9, 0.5, 8)],
  },
  {
    id: 16,
    prepTime: 30,
    reward: 349,
    warning: '보스 — 팔기 중군 (갑주 18 · 산개 52%)',
    groups: [
      g('shieldman', 9, 0.55),
      g('sentinel', 5, 0.95, 4, 1),
      g('horsearcher', 8, 0.5, 9),
      g('frostgiant', 1, 1, 16),
    ],
  },
]

// ────────────────────────────── S6 남한산성 ──────────────────────────────
// 세 방향 동시 압박 + 보스. 비격진천뢰의 순수 피해가 양면 저항의 해답.

const WAVES_S6: WaveDef[] = [
  {
    id: 1,
    prepTime: 22,
    reward: 75,
    groups: [g('grunt', 5, 1.15), g('runner', 5, 1.15, 8, 1)],
  },
  {
    id: 2,
    prepTime: 16,
    reward: 75,
    groups: [g('grunt', 5, 1.1), g('runner', 7, 1.1, 8, 1)],
  },
  {
    id: 3,
    prepTime: 16,
    reward: 87,
    groups: [g('armored', 2, 1.05), g('grunt', 3, 1.05, 8, 1), g('shaman', 2, 1.05, 12, 2), g('wyvern', 2, 1.05, 16)],
  },
  {
    id: 4,
    prepTime: 17,
    reward: 101,
    warning: '간자 — 화약 저항 80%',
    groups: [g('armored', 2, 1.0), g('grunt', 3, 1.0, 8, 1), g('shaman', 2, 1.0, 12, 2), g('wyvern', 2, 1.0, 16)],
  },
  {
    id: 5,
    prepTime: 17,
    reward: 114,
    warning: '충차 — 양면 저항. 비격진천뢰가 답입니다',
    groups: [g('armored', 2, 0.95), g('shaman', 2, 0.95, 8, 1), g('wyvern', 2, 0.95, 12, 2), g('brute', 2, 0.95, 16), g('warlock', 2, 0.95, 16, 1)],
  },
  {
    id: 6,
    prepTime: 17,
    reward: 128,
    groups: [g('shieldman', 3, 0.8), g('shaman', 2, 0.9, 8, 1), g('wyvern', 2, 0.9, 12, 2), g('brute', 2, 0.9, 16), g('warlock', 2, 0.9, 16, 1)],
  },
  {
    id: 7,
    prepTime: 17,
    reward: 140,
    groups: [g('armored', 2, 0.85), g('shaman', 2, 0.85, 8, 1), g('wyvern', 2, 0.85, 12, 2), g('brute', 2, 0.85, 16), g('warlock', 2, 0.85, 16, 1)],
  },
  {
    id: 8,
    prepTime: 22,
    reward: 330,
    warning: '중간 보스 — 선봉 기병',
    groups: [g('sentinel', 2, 0.8, 0, 1), g('warlock', 2, 0.8, 6, 2), g('wyvern', 3, 0.8, 10), g('twinwyvern', 1, 1, 14)],
  },
  {
    id: 9,
    prepTime: 18,
    reward: 166,
    groups: [g('brute', 2, 0.75), g('sentinel', 2, 0.75, 8, 1), g('warlock', 2, 0.75, 12, 2), g('wyvern', 3, 0.75, 16)],
  },
  {
    id: 10,
    prepTime: 18,
    reward: 190,
    groups: [g('brute', 2, 0.7), g('sentinel', 2, 0.7, 8, 1), g('warlock', 2, 0.7, 12, 2), g('wyvern', 3, 0.7, 16)],
  },
  {
    id: 11,
    prepTime: 18,
    reward: 217,
    groups: [g('brute', 2, 0.65), g('sentinel', 2, 0.65, 8, 1), g('warlock', 2, 0.65, 12, 2), g('wyvern', 3, 0.65, 16)],
  },
  {
    id: 12,
    prepTime: 18,
    reward: 229,
    groups: [g('warlock', 2, 0.6), g('brute', 2, 0.6, 8, 1), g('sentinel', 2, 0.6, 12, 2), g('runner', 8, 0.6, 16)],
  },
  {
    id: 13,
    prepTime: 18,
    reward: 253,
    groups: [g('warlock', 2, 0.55), g('brute', 2, 0.55, 8, 1), g('sentinel', 2, 0.55, 12, 2), g('runner', 8, 0.55, 16)],
  },
  {
    id: 14,
    prepTime: 24,
    reward: 584,
    warning: '중간 보스 — 철갑 장수',
    groups: [g('warlock', 2, 0.5), g('sentinel', 2, 0.5, 8, 2), g('runner', 7, 0.5, 12), g('golem', 1, 1, 16, 1)],
  },
  {
    id: 15,
    prepTime: 19,
    reward: 318,
    groups: [g('warlock', 3, 0.45), g('brute', 2, 0.45, 8, 1), g('sentinel', 2, 0.45, 12, 2), g('runner', 10, 0.45, 16)],
  },
  {
    id: 16,
    prepTime: 19,
    reward: 354,
    groups: [g('brute', 2, 0.4), g('sentinel', 2, 0.4, 8, 1), g('warlock', 3, 0.4, 12, 2), g('runner', 5, 0.4, 16)],
  },
  {
    id: 17,
    prepTime: 19,
    reward: 394,
    groups: [g('brute', 2, 0.35), g('sentinel', 2, 0.35, 8, 1), g('warlock', 3, 0.35, 12, 2), g('runner', 7, 0.35, 16)],
  },
  {
    id: 18,
    prepTime: 19,
    reward: 431,
    groups: [g('brute', 2, 0.3), g('sentinel', 2, 0.3, 8, 1), g('warlock', 3, 0.3, 12, 2), g('runner', 7, 0.3, 16)],
  },
  {
    id: 19,
    prepTime: 20,
    reward: 483,
    warning: '총공세 — 마지막 정비 기회입니다',
    groups: [g('brute', 3, 0.25), g('sentinel', 3, 0.25, 8, 1), g('warlock', 3, 0.25, 12, 2), g('runner', 8, 0.25, 16)],
  },
  {
    id: 20,
    prepTime: 24,
    reward: 864,
    warning: '팔기 대장 출진 — 최종 웨이브',
    groups: [g('brute', 3, 0.2), g('sentinel', 3, 0.2, 8, 1), g('warlock', 5, 0.2, 12, 2), g('runner', 13, 0.2, 16), g('overlord', 1, 1, 22)],
  },
]

export const STAGES: StageDef[] = [
  {
    id: 'greenvale',
    index: 1,
    name: '왜구의 노략',
    subtitle: '남해 포구에 왜구가 들었다 — 활 하나로 버텨낸다',
    level: LEVEL_GREENVALE,
    waves: WAVES_S1,
    startGold: 270,
    startLives: 20,
    // 둘을 한 번에 연다. 다음 판이 갑주(→총통)와 물량(→화차)을 **동시에**
    // 던지기 때문이다. 하나씩 주려고 판을 하나 더 만드는 것은 배우는 순서가
    // 아니라 판의 개수를 위한 일이 된다.
    unlocksTowers: ['mage', 'cannon'],
  },
  {
    id: 'ramparts',
    index: 2,
    name: '삼포왜란',
    subtitle: '1510 · 갑주를 두르고 왔다. 화살로는 뚫리지 않는다',
    level: LEVEL_RAMPARTS,
    waves: WAVES_S2,
    startGold: 300,
    startLives: 20,
    unlocksTowers: ['frost'],
  },
  {
    id: 'fork',
    index: 3,
    name: '니탕개의 난',
    subtitle: '1583 · 여진 기병이 육진을 두 곳에서 친다',
    level: LEVEL_FORK,
    waves: WAVES_S3,
    startGold: 330,
    startLives: 20,
    unlocksTowers: ['musket'],
  },
  {
    id: 'highlands',
    index: 4,
    name: '임진왜란',
    subtitle: '1592 · 대군이 북상하고, 성벽에 사다리가 걸린다',
    level: LEVEL_HIGHLANDS,
    waves: WAVES_S4,
    startGold: 360,
    startLives: 20,
    unlocksTowers: ['venom', 'banner'],
  },
  {
    id: 'anju',
    index: 5,
    name: '정묘호란',
    subtitle: '1627 · 압록강을 건넌 기병이 두 갈래로 벌판을 덮는다',
    level: LEVEL_ANJU,
    waves: WAVES_S5,
    startGold: 470,
    startLives: 20,
    unlocksTowers: ['culverin'],
  },
  {
    id: 'gate',
    index: 6,
    name: '병자호란',
    subtitle: '1636 · 세 방향에서 동시에. 성문을 열 수는 없다',
    level: LEVEL_GATE,
    waves: WAVES_S6,
    startGold: 580,
    startLives: 20,
    unlocksTowers: [],
  },
]

export function getStage(id: string): StageDef {
  const found = STAGES.find((s) => s.id === id)
  if (!found) throw new Error(`알 수 없는 스테이지 ID: ${id}`)
  return found
}

export const TOTAL_STAGES = STAGES.length
