import * as THREE from 'three'
import type { Game } from '../game/Game'
import type { Side, Unit } from '../game/types'
import type { Terrain } from '../render/terrain'

/**
 * 유닛 고르기.
 *
 * ## 왜 화면 좌표로 재는가
 *
 * 3D 판이지만 사람이 고르는 것은 **화면 위의 점**이다. 60도로 누운 부감에서
 * 월드 거리로 재면 화면에서 나란히 서 있는 두 유닛이 실제로는 멀어서, 눈에
 * 보이는 것과 잡히는 것이 어긋난다. 그래서 유닛을 화면으로 투영해 놓고
 * 픽셀로 잰다 — 스타크래프트의 드래그가 그렇게 느껴지는 이유이기도 하다.
 *
 * ## 왜 시뮬레이션 밖에 있는가
 *
 * 선택은 **판정에 관여하지 않는다.** 여기서 나오는 것은 유닛 id 목록뿐이고,
 * 그 목록으로 무엇을 할지는 `Game.commandUnits`가 정한다. 두 클라이언트가
 * 서로 다른 것을 골라 놓고도 같은 판을 굴릴 수 있어야 락스텝이 성립한다
 * (GDD 7.2).
 */

/** 클릭 한 번이 유닛을 잡는 반경(픽셀). 넉넉해야 손이 안 아프다. */
const PICK_PX = 26

/** 이만큼 안 끌면 클릭으로 친다. */
export const DRAG_SLOP = 5

export interface Viewport {
  width: number
  height: number
}

/** 내가 지금 고를 수 있는 유닛인가. */
function selectable(side: Side, u: Unit): boolean {
  return u.faction === side && u.hp > 0
}

/**
 * 유닛의 머리께를 화면 좌표로. 화면 밖이면 null.
 *
 * 발밑이 아니라 몸통 높이를 쓴다 — 발밑을 쓰면 커서를 유닛 몸에 얹었는데
 * 안 잡히는 일이 생긴다.
 */
function project(
  u: Unit,
  camera: THREE.Camera,
  terrain: Terrain,
  view: Viewport,
): { x: number; y: number } | null {
  _v.set(u.pos.x, terrain.heightAt(u.pos.x, u.pos.z) + 2.4, u.pos.z)
  _v.project(camera)
  if (_v.z > 1) return null
  return {
    x: ((_v.x + 1) / 2) * view.width,
    y: ((1 - _v.y) / 2) * view.height,
  }
}

const _v = new THREE.Vector3()

/** 그 화면 점에 가장 가까운 내 유닛. 없으면 -1. */
export function unitAt(
  game: Game,
  side: Side,
  camera: THREE.Camera,
  terrain: Terrain,
  x: number,
  y: number,
  view: Viewport,
): number {
  let best = -1
  let bestD = PICK_PX * PICK_PX
  for (const u of game.units) {
    if (!selectable(side, u)) continue
    const s = project(u, camera, terrain, view)
    if (!s) continue
    const d = (s.x - x) * (s.x - x) + (s.y - y) * (s.y - y)
    if (d < bestD) {
      bestD = d
      best = u.id
    }
  }
  return best
}

/**
 * 화면 사각형 안의 내 유닛 전부.
 *
 * **일꾼은 병사가 하나라도 잡히면 빠진다.** 전선을 긁었는데 일꾼이 딸려
 * 들어와서 같이 진격하면, 사람은 그걸 알아채기 전에 일꾼을 잃는다. 일꾼만
 * 긁으면 일꾼이 잡히므로 일꾼을 못 고르게 되는 것은 아니다.
 */
export function unitsInBox(
  game: Game,
  side: Side,
  camera: THREE.Camera,
  terrain: Terrain,
  box: { x0: number; y0: number; x1: number; y1: number },
  view: Viewport,
): number[] {
  const lo = { x: Math.min(box.x0, box.x1), y: Math.min(box.y0, box.y1) }
  const hi = { x: Math.max(box.x0, box.x1), y: Math.max(box.y0, box.y1) }
  const soldiers: number[] = []
  const civilians: number[] = []
  for (const u of game.units) {
    if (!selectable(side, u)) continue
    const s = project(u, camera, terrain, view)
    if (!s) continue
    if (s.x < lo.x || s.x > hi.x || s.y < lo.y || s.y > hi.y) continue
    if (game.isCivilian(u)) civilians.push(u.id)
    else soldiers.push(u.id)
  }
  return soldiers.length > 0 ? soldiers : civilians
}
