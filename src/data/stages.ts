import type { LevelDef } from './levels'
import {
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
 *   S1 궁수대만        → 총통 해금
 *   S2 +갑주 위협    → 화차 해금   (총통으로 갑주를 풀어야 클리어)
 *   S3 +기마·산개    → 거마작 해금 (화차가 기병에 무력함을 여기서 배운다)
 *   S4 +고속 물량    → 비격진천뢰 해금 (거마작 감속 없이는 버티기 어렵다)
 *   S5 전부 + 보스                    (양면 저항은 독으로 뚫는다)
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
  /** 클리어 시 열리는 타워 ID. null이면 해금 없음 (최종 스테이지) */
  unlocksTower: string | null
}

/** 게임 시작 시점부터 쓸 수 있는 타워. */
export const STARTING_TOWERS: readonly string[] = ['archer']

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
    groups: [g('armored', 7, 0.9), g('grunt', 11, 0.9, 8), g('runner', 9, 0.9, 12)],
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
    groups: [g('armored', 12, 0.8), g('runner', 19, 0.8, 8), g('grunt', 12, 0.8, 12)],
  },
  {
    id: 9,
    prepTime: 18,
    reward: 125,
    groups: [g('armored', 15, 0.75), g('runner', 25, 0.75, 8), g('grunt', 16, 0.75, 12)],
  },
  {
    id: 10,
    prepTime: 26,
    reward: 300,
    warning: '보스 — 철갑 장수 (갑주 22)',
    groups: [g('armored', 20, 0.75), g('runner', 32, 0.7, 8), g('grunt', 20, 0.75, 12), g('golem', 1, 1, 16)],
  },
]

// ────────────────────────────── S3 새재 갈림길 ──────────────────────────────
// 출발점이 2곳. 화차를 막 얻었지만 기병이 등장해 "화차가 답은 아니다"를 배운다.

const WAVES_S3: WaveDef[] = [
  {
    id: 1,
    prepTime: 22,
    reward: 25,
    groups: [g('grunt', 4, 1.15), g('runner', 4, 1.15, 8, 1)],
  },
  {
    id: 2,
    prepTime: 16,
    reward: 25,
    groups: [g('grunt', 5, 1.1), g('runner', 5, 1.1, 8, 1)],
  },
  {
    id: 3,
    prepTime: 16,
    reward: 25,
    warning: '별동대 — 흩어져 달립니다. 화약이 35%밖에 안 먹힙니다',
    groups: [g('grunt', 5, 1.05), g('armored', 1, 1.05, 8, 1), g('shaman', 1, 1.05, 12)],
  },
  {
    id: 4,
    prepTime: 17,
    reward: 25,
    warning: '경기병 — 기마. 화차는 방향을 못 돌립니다',
    groups: [g('grunt', 4, 1.0), g('armored', 1, 1.0, 8, 1), g('shaman', 2, 1.0, 12), g('wyvern', 2, 1.0, 16, 1)],
  },
  {
    id: 5,
    prepTime: 17,
    reward: 30,
    groups: [g('grunt', 5, 0.95), g('armored', 2, 0.95, 8, 1), g('shaman', 2, 0.95, 12), g('wyvern', 2, 0.95, 16, 1)],
  },
  {
    id: 6,
    prepTime: 17,
    reward: 35,
    groups: [g('shaman', 3, 0.9), g('armored', 2, 0.9, 8, 1), g('wyvern', 3, 0.9, 12), g('runner', 6, 0.9, 16, 1)],
  },
  {
    id: 7,
    prepTime: 22,
    reward: 90,
    warning: '중간 보스 — 선봉 기병 (기마·고속)',
    groups: [g('shaman', 3, 0.85), g('armored', 2, 0.85, 8, 1), g('runner', 5, 0.85, 12, 1), g('twinwyvern', 1, 1, 15)],
  },
  {
    id: 8,
    prepTime: 17,
    reward: 55,
    groups: [g('shaman', 5, 0.8), g('armored', 3, 0.8, 8, 1), g('wyvern', 5, 0.8, 12), g('runner', 9, 0.8, 16, 1)],
  },
  {
    id: 9,
    prepTime: 18,
    reward: 70,
    groups: [g('shaman', 6, 0.75), g('wyvern', 7, 0.75, 8, 1), g('armored', 4, 0.75, 12), g('runner', 9, 0.75, 16, 1)],
  },
  {
    id: 10,
    prepTime: 18,
    reward: 90,
    groups: [g('shaman', 7, 0.7), g('wyvern', 9, 0.7, 8, 1), g('armored', 5, 0.7, 12), g('runner', 11, 0.7, 16, 1)],
  },
  {
    id: 11,
    prepTime: 18,
    reward: 115,
    groups: [g('shaman', 9, 0.65), g('wyvern', 11, 0.65, 8, 1), g('armored', 6, 0.65, 12), g('runner', 14, 0.65, 16, 1)],
  },
  {
    id: 12,
    prepTime: 26,
    reward: 280,
    warning: '보스 — 날랜 왜장 (화약 저항 78%)',
    groups: [g('shaman', 11, 0.65), g('wyvern', 13, 0.65, 8, 1), g('armored', 8, 0.65, 12), g('runner', 16, 0.65, 16, 1), g('hexmother', 1, 1, 20)],
  },
]

// ────────────────────────────── S4 안주성 벌판 ──────────────────────────────
// 경로가 길지만 물량이 압도적. 충차·철기 등장. 거마작 감속이 실질적 해답.

const WAVES_S4: WaveDef[] = [
  {
    id: 1,
    prepTime: 22,
    reward: 25,
    groups: [g('grunt', 8, 1.15), g('runner', 10, 1.15, 8)],
  },
  {
    id: 2,
    prepTime: 16,
    reward: 30,
    groups: [g('grunt', 10, 1.1), g('runner', 12, 1.1, 8)],
  },
  {
    id: 3,
    prepTime: 16,
    reward: 40,
    groups: [g('armored', 3, 1.05), g('shaman', 4, 1.05, 8), g('grunt', 7, 1.05, 12)],
  },
  {
    id: 4,
    prepTime: 17,
    reward: 45,
    warning: '충차 — 양면 저항 탱커, 뚫리면 생명 2',
    groups: [g('armored', 3, 1.0), g('shaman', 3, 1.0, 8), g('wyvern', 4, 1.0, 12), g('brute', 1, 1.0, 16)],
  },
  {
    id: 5,
    prepTime: 17,
    reward: 60,
    groups: [g('armored', 4, 0.95), g('shaman', 4, 0.95, 8), g('wyvern', 5, 0.95, 12), g('brute', 1, 0.95, 16)],
  },
  {
    id: 6,
    prepTime: 17,
    reward: 70,
    warning: '철기 — 갑주 두른 기마. 화차는 못 닿고 화살은 튕깁니다',
    groups: [g('brute', 1, 0.9), g('wyvern', 6, 0.9, 8), g('sentinel', 1, 0.9, 12), g('shaman', 4, 0.9, 16)],
  },
  {
    id: 7,
    prepTime: 17,
    reward: 90,
    groups: [g('brute', 2, 0.85), g('wyvern', 7, 0.85, 8), g('sentinel', 2, 0.85, 12), g('shaman', 5, 0.85, 16)],
  },
  {
    id: 8,
    prepTime: 22,
    reward: 190,
    warning: '중간 보스 — 철갑 장수',
    groups: [g('brute', 2, 0.8), g('wyvern', 9, 0.8, 8), g('sentinel', 2, 0.8, 12), g('shaman', 6, 0.8, 16), g('golem', 1, 1, 18)],
  },
  {
    id: 9,
    prepTime: 18,
    reward: 135,
    groups: [g('brute', 3, 0.75), g('sentinel', 3, 0.75, 8), g('runner', 22, 0.75, 12), g('shaman', 7, 0.75, 16)],
  },
  {
    id: 10,
    prepTime: 18,
    reward: 165,
    groups: [g('brute', 3, 0.7), g('sentinel', 4, 0.7, 8), g('runner', 27, 0.7, 12), g('shaman', 9, 0.7, 16)],
  },
  {
    id: 11,
    prepTime: 18,
    reward: 205,
    groups: [g('brute', 4, 0.65), g('sentinel', 5, 0.65, 8), g('runner', 33, 0.65, 12), g('shaman', 11, 0.65, 16)],
  },
  {
    id: 12,
    prepTime: 18,
    reward: 255,
    groups: [g('brute', 5, 0.6), g('sentinel', 6, 0.6, 8), g('runner', 41, 0.6, 12), g('wyvern', 16, 0.6, 16)],
  },
  {
    id: 13,
    prepTime: 18,
    reward: 315,
    warning: '기병 돌격 — 거마작이 없으면 그대로 지나갑니다',
    groups: [g('brute', 6, 0.55), g('sentinel', 7, 0.55, 8), g('runner', 50, 0.55, 12), g('wyvern', 20, 0.55, 16)],
  },
  {
    id: 14,
    prepTime: 26,
    reward: 700,
    warning: '보스 — 팔기 중군 (갑주 18 · 산개 52%)',
    groups: [g('brute', 12, 0.52), g('sentinel', 13, 0.52, 8), g('runner', 95, 0.36, 12), g('wyvern', 37, 0.52, 16), g('frostgiant', 1, 1, 22)],
  },
]

// ────────────────────────────── S5 남한산성 ──────────────────────────────
// 세 방향 동시 압박 + 보스. 비격진천뢰의 순수 피해가 양면 저항의 해답.

const WAVES_S5: WaveDef[] = [
  {
    id: 1,
    prepTime: 22,
    reward: 30,
    groups: [g('grunt', 4, 1.15), g('runner', 4, 1.15, 8, 1)],
  },
  {
    id: 2,
    prepTime: 16,
    reward: 30,
    groups: [g('grunt', 4, 1.1), g('runner', 5, 1.1, 8, 1)],
  },
  {
    id: 3,
    prepTime: 16,
    reward: 35,
    groups: [g('armored', 1, 1.05), g('grunt', 2, 1.05, 8, 1), g('shaman', 1, 1.05, 12, 2), g('wyvern', 1, 1.05, 16)],
  },
  {
    id: 4,
    prepTime: 17,
    reward: 40,
    warning: '간자 — 화약 저항 80%',
    groups: [g('armored', 1, 1.0), g('grunt', 2, 1.0, 8, 1), g('shaman', 1, 1.0, 12, 2), g('wyvern', 1, 1.0, 16)],
  },
  {
    id: 5,
    prepTime: 17,
    reward: 45,
    warning: '충차 — 양면 저항. 비격진천뢰가 답입니다',
    groups: [g('armored', 1, 0.95), g('shaman', 1, 0.95, 8, 1), g('wyvern', 1, 0.95, 12, 2), g('brute', 1, 0.95, 16), g('warlock', 1, 0.95, 16, 1)],
  },
  {
    id: 6,
    prepTime: 17,
    reward: 50,
    groups: [g('armored', 1, 0.9), g('shaman', 1, 0.9, 8, 1), g('wyvern', 1, 0.9, 12, 2), g('brute', 1, 0.9, 16), g('warlock', 1, 0.9, 16, 1)],
  },
  {
    id: 7,
    prepTime: 17,
    reward: 55,
    groups: [g('armored', 1, 0.85), g('shaman', 1, 0.85, 8, 1), g('wyvern', 1, 0.85, 12, 2), g('brute', 1, 0.85, 16), g('warlock', 1, 0.85, 16, 1)],
  },
  {
    id: 8,
    prepTime: 22,
    reward: 130,
    warning: '중간 보스 — 선봉 기병',
    groups: [g('sentinel', 1, 0.8, 0, 1), g('warlock', 1, 0.8, 6, 2), g('wyvern', 2, 0.8, 10), g('twinwyvern', 1, 1, 14)],
  },
  {
    id: 9,
    prepTime: 18,
    reward: 65,
    groups: [g('brute', 1, 0.75), g('sentinel', 1, 0.75, 8, 1), g('warlock', 1, 0.75, 12, 2), g('wyvern', 2, 0.75, 16)],
  },
  {
    id: 10,
    prepTime: 18,
    reward: 75,
    groups: [g('brute', 1, 0.7), g('sentinel', 1, 0.7, 8, 1), g('warlock', 1, 0.7, 12, 2), g('wyvern', 2, 0.7, 16)],
  },
  {
    id: 11,
    prepTime: 18,
    reward: 85,
    groups: [g('brute', 1, 0.65), g('sentinel', 1, 0.65, 8, 1), g('warlock', 1, 0.65, 12, 2), g('wyvern', 3, 0.65, 16)],
  },
  {
    id: 12,
    prepTime: 18,
    reward: 90,
    groups: [g('warlock', 1, 0.6), g('brute', 1, 0.6, 8, 1), g('sentinel', 1, 0.6, 12, 2), g('runner', 6, 0.6, 16)],
  },
  {
    id: 13,
    prepTime: 18,
    reward: 100,
    groups: [g('warlock', 1, 0.55), g('brute', 1, 0.55, 8, 1), g('sentinel', 1, 0.55, 12, 2), g('runner', 6, 0.55, 16)],
  },
  {
    id: 14,
    prepTime: 24,
    reward: 230,
    warning: '중간 보스 — 철갑 장수',
    groups: [g('warlock', 1, 0.5), g('sentinel', 1, 0.5, 8, 2), g('runner', 5, 0.5, 12), g('golem', 1, 1, 16, 1)],
  },
  {
    id: 15,
    prepTime: 19,
    reward: 125,
    groups: [g('warlock', 2, 0.45), g('brute', 1, 0.45, 8, 1), g('sentinel', 1, 0.45, 12, 2), g('runner', 8, 0.45, 16)],
  },
  {
    id: 16,
    prepTime: 19,
    reward: 140,
    groups: [g('brute', 1, 0.4), g('sentinel', 1, 0.4, 8, 1), g('warlock', 2, 0.4, 12, 2), g('runner', 4, 0.4, 16)],
  },
  {
    id: 17,
    prepTime: 19,
    reward: 155,
    groups: [g('brute', 1, 0.35), g('sentinel', 1, 0.35, 8, 1), g('warlock', 2, 0.35, 12, 2), g('runner', 5, 0.35, 16)],
  },
  {
    id: 18,
    prepTime: 19,
    reward: 170,
    groups: [g('brute', 1, 0.3), g('sentinel', 1, 0.3, 8, 1), g('warlock', 2, 0.3, 12, 2), g('runner', 5, 0.3, 16)],
  },
  {
    id: 19,
    prepTime: 20,
    reward: 190,
    warning: '총공세 — 마지막 정비 기회입니다',
    groups: [g('brute', 2, 0.25), g('sentinel', 2, 0.25, 8, 1), g('warlock', 2, 0.25, 12, 2), g('runner', 6, 0.25, 16)],
  },
  {
    id: 20,
    prepTime: 24,
    reward: 340,
    warning: '팔기 대장 출진 — 최종 웨이브',
    groups: [g('brute', 3, 0.2), g('sentinel', 3, 0.2, 8, 1), g('warlock', 4, 0.2, 12, 2), g('runner', 10, 0.2, 16), g('overlord', 1, 1, 22)],
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
    unlocksTower: 'mage',
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
    unlocksTower: 'cannon',
  },
  {
    id: 'fork',
    index: 3,
    name: '임진왜란',
    subtitle: '1592 · 두 길로 북상한다. 기병까지 섞였다',
    level: LEVEL_FORK,
    waves: WAVES_S3,
    startGold: 330,
    startLives: 20,
    unlocksTower: 'frost',
  },
  {
    id: 'highlands',
    index: 4,
    name: '정묘호란',
    subtitle: '1627 · 압록강을 건넌 기병이 벌판을 덮는다',
    level: LEVEL_HIGHLANDS,
    waves: WAVES_S4,
    startGold: 360,
    startLives: 20,
    unlocksTower: 'venom',
  },
  {
    id: 'gate',
    index: 5,
    name: '병자호란',
    subtitle: '1636 · 세 방향에서 동시에. 성문을 열 수는 없다',
    level: LEVEL_GATE,
    waves: WAVES_S5,
    startGold: 520,
    startLives: 20,
    unlocksTower: null,
  },
]

export function getStage(id: string): StageDef {
  const found = STAGES.find((s) => s.id === id)
  if (!found) throw new Error(`알 수 없는 스테이지 ID: ${id}`)
  return found
}

export const TOTAL_STAGES = STAGES.length
