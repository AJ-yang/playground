import * as THREE from 'three'
import type { Game } from '../game/Game'
import type { Tower } from '../game/Tower'
import { buildCost } from '../data/towers'
import { TILE_M, type BoardFrame } from './coords'

/**
 * 조준 판정 — 지금 화면 한가운데가 무엇을 겨누고 있는가.
 *
 * 2D에서는 마우스 커서가 곧 좌표라 이 계산이 필요 없었다. 1인칭에서는
 * **시선이 좌표를 만든다**. 카메라에서 앞으로 광선을 쏘아 먼저 맞는 것을
 * 찾고, 그것이 기물이면 정보를, 빈 땅이면 배치 가능 여부를 답한다.
 *
 * **손이 닿는 거리를 둔다.** 눈에 보이는 곳 아무 데나 지을 수 있으면 굳이
 * 걸어 다닐 이유가 없어져 1인칭이 그냥 불편한 2D가 된다. 반대로 너무 짧으면
 * 길 위 사거리 안쪽에 붙어 서야 해서 위험하다 — 여섯 칸이 그 사이다.
 */

const BUILD_REACH = TILE_M * 6
const INSPECT_REACH = TILE_M * 9

export type AimResult =
  | { kind: 'none' }
  | { kind: 'ground'; col: number; row: number; point: THREE.Vector3; hint: string }
  | {
      kind: 'build'
      col: number
      row: number
      point: THREE.Vector3
      towerId: string
      ok: boolean
      reason: string
    }
  | { kind: 'tower'; tower: Tower; point: THREE.Vector3 }

export class Aimer {
  private readonly raycaster = new THREE.Raycaster()
  private readonly forward = new THREE.Vector3()
  private readonly origin = new THREE.Vector3()
  private readonly hit = new THREE.Vector3()
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

  constructor(private readonly frame: BoardFrame) {}

  /**
   * @param pickables 기물 모형의 루트들. `userData.towerId`로 되짚는다.
   */
  aim(camera: THREE.Camera, game: Game, pickables: THREE.Object3D[]): AimResult {
    camera.getWorldPosition(this.origin)
    camera.getWorldDirection(this.forward)

    // 1) 기물을 먼저 본다. 모형은 땅 위로 솟아 있어서, 지면만 때리면 기물
    //    몸통을 겨눠도 그 뒤 땅이 잡힌다.
    this.raycaster.set(this.origin, this.forward)
    this.raycaster.far = INSPECT_REACH
    const hits = this.raycaster.intersectObjects(pickables, true)
    if (hits.length > 0) {
      const towerId = findTowerId(hits[0]!.object)
      const tower = towerId === null ? null : game.towers.find((t) => t.id === towerId)
      if (tower) return { kind: 'tower', tower, point: hits[0]!.point.clone() }
    }

    // 2) 지면. 위를 보고 있으면 교점이 없다.
    if (!this.raycaster.ray.intersectPlane(this.plane, this.hit)) return { kind: 'none' }

    const distance = this.origin.distanceTo(this.hit)
    const { col, row } = this.frame.tileAt(this.hit.x, this.hit.z)
    const point = this.hit.clone()

    if (!game.grid.inBounds(col, row)) {
      return { kind: 'none' }
    }

    const towerId = game.selectedBuildId
    if (!towerId) {
      const kind = game.grid.kindAt(col, row)
      const hint =
        kind === 'path'
          ? '적이 지나는 길'
          : kind === 'blocked'
            ? '지형이 막혀 있다'
            : distance > BUILD_REACH
              ? ''
              : '기물을 고르면(1–8) 여기에 세울 수 있다'
      return { kind: 'ground', col, row, point, hint }
    }

    const check = this.buildability(game, towerId, col, row, distance)
    return { kind: 'build', col, row, point, towerId, ok: check.ok, reason: check.reason }
  }

  /**
   * 배치 가능 여부. **Game의 판정을 그대로 쓰지 않고 미리 흉내 낸다** — 실제
   * 건설은 여전히 `game.tryBuild()`가 결정하고, 여기서는 미리보기용 사유만
   * 만든다. 두 곳이 어긋나면 초록으로 보이던 자리가 클릭에 실패하므로,
   * 조건의 순서와 문구를 Game 쪽과 같게 유지한다.
   */
  private buildability(
    game: Game,
    towerId: string,
    col: number,
    row: number,
    distance: number,
  ): { ok: boolean; reason: string } {
    if (distance > BUILD_REACH) return { ok: false, reason: '손이 닿지 않는다 — 더 가까이' }
    const kind = game.grid.kindAt(col, row)
    if (kind === 'path') return { ok: false, reason: '경로 위에는 지을 수 없습니다' }
    if (kind === 'blocked') return { ok: false, reason: '지형이 막혀 있습니다' }
    if (!game.grid.canBuild(col, row)) return { ok: false, reason: '이미 기물이 있습니다' }
    const cost = buildCost(towerId)
    if (game.gold < cost) return { ok: false, reason: `골드가 ${cost - game.gold} 부족합니다` }
    return { ok: true, reason: '' }
  }
}

/** 맞은 메시에서 위로 거슬러 올라가 기물 ID를 찾는다. */
function findTowerId(object: THREE.Object3D): number | null {
  let node: THREE.Object3D | null = object
  while (node) {
    const id = node.userData?.['towerId']
    if (typeof id === 'number') return id
    node = node.parent
  }
  return null
}
