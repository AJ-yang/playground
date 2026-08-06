import type { Vec2 } from '../core/vec2'

/**
 * 맵 정의.
 *
 * waypoints는 타일 좌표이며 반드시 축에 평행한 구간으로 이어져야 한다
 * (가로 또는 세로만). 첫/마지막 웨이포인트는 화면 밖으로 두어 적이
 * 자연스럽게 등장·퇴장하게 한다.
 */
export interface LevelDef {
  id: string
  name: string
  cols: number
  rows: number
  /** 타일 좌표 기준 경로. 적은 이 폴리라인을 따라 이동한다. */
  waypoints: Vec2[]
  /** 경로가 아니지만 건설도 불가능한 장식 타일 (바위/숲 등) */
  blocked: Vec2[]
  startGold: number
  startLives: number
}

export const LEVEL_ONE: LevelDef = {
  id: 'greenvale',
  name: '초원의 관문',
  cols: 24,
  rows: 15,
  waypoints: [
    { x: -1, y: 7 },
    { x: 4, y: 7 },
    { x: 4, y: 2 },
    { x: 10, y: 2 },
    { x: 10, y: 12 },
    { x: 16, y: 12 },
    { x: 16, y: 5 },
    { x: 20, y: 5 },
    { x: 20, y: 9 },
    { x: 24, y: 9 },
  ],
  blocked: [
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    { x: 1, y: 2 },
    { x: 7, y: 8 },
    { x: 7, y: 9 },
    { x: 8, y: 9 },
    { x: 13, y: 0 },
    { x: 14, y: 0 },
    { x: 13, y: 1 },
    { x: 18, y: 13 },
    { x: 19, y: 13 },
    { x: 19, y: 14 },
    { x: 22, y: 2 },
    { x: 23, y: 2 },
    { x: 22, y: 3 },
  ],
  startGold: 260,
  startLives: 20,
}

export const LEVELS: LevelDef[] = [LEVEL_ONE]
