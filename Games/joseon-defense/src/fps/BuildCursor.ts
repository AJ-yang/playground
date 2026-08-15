import * as THREE from 'three'
import type { Game } from '../game/Game'
import { getTowerDef } from '../data/towers'
import { TILE_SIZE } from '../game/Game'
import { C, hex } from './palette3d'
import { TILE_M, type BoardFrame } from './coords'
import { buildGhostModel } from './models/towers3d'
import type { AimResult } from './aim'

/**
 * 배치 미리보기 — 짓기 전에 보여 주는 것 전부.
 *
 * 세 가지를 띄운다.
 *   1. 겨누는 칸의 바닥 표식 (초록/붉음)
 *   2. 그 자리에 설 기물의 반투명 모형
 *   3. 사거리 원
 *
 * **사거리 원이 셋 중 가장 중요하다.** 2D에서는 격자를 세어 "이 자리면 저
 * 코너까지 닿는다"를 눈으로 계산할 수 있었지만, 1인칭에서는 원근 때문에
 * 거리 감각이 통째로 무너진다. 땅에 그린 원 하나가 그 계산을 대신한다.
 */
export class BuildCursor {
  readonly root = new THREE.Group()

  private readonly tile: THREE.Mesh
  private readonly ghostHolder = new THREE.Group()
  private readonly ringPool: THREE.Mesh[] = []
  private ghostKey = ''

  private readonly ringGeo = new THREE.RingGeometry(0.97, 1, 56).rotateX(-Math.PI / 2)
  private readonly tileGeo = new THREE.PlaneGeometry(TILE_M * 0.94, TILE_M * 0.94).rotateX(
    -Math.PI / 2,
  )

  private readonly validMat = new THREE.MeshBasicMaterial({
    color: C.valid,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  })
  private readonly invalidMat = new THREE.MeshBasicMaterial({
    color: C.invalid,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  })

  constructor(private readonly frame: BoardFrame) {
    this.tile = new THREE.Mesh(this.tileGeo, this.validMat)
    this.tile.position.y = 0.03
    this.tile.visible = false
    this.root.add(this.tile)
    this.root.add(this.ghostHolder)
  }

  /**
   * @param showAllRanges 모든 기물의 사거리를 한꺼번에 볼지 (R 키)
   */
  update(game: Game, aim: AimResult, showAllRanges: boolean): void {
    this.updateGhost(aim)
    this.updateRings(game, aim, showAllRanges)
  }

  private updateGhost(aim: AimResult): void {
    if (aim.kind !== 'build') {
      this.tile.visible = false
      this.setGhost('', null)
      return
    }

    this.tile.visible = true
    this.tile.material = aim.ok ? this.validMat : this.invalidMat
    this.frame.tileCenter(aim.col, aim.row, 0.03, this.tile.position)

    // 모형은 기물 종류와 가부(색)가 바뀔 때만 다시 세운다. 매 프레임 새로
    // 만들면 칸을 훑는 것만으로 초당 수십 개의 모형이 생겼다 사라진다.
    this.setGhost(`${aim.towerId}:${aim.ok ? 1 : 0}`, getTowerDef(aim.towerId), aim.ok)
    this.frame.tileCenter(aim.col, aim.row, 0, this.ghostHolder.position)
  }

  private setGhost(key: string, def: ReturnType<typeof getTowerDef> | null, ok = true): void {
    if (key === this.ghostKey) return
    this.ghostKey = key
    this.ghostHolder.clear()
    if (def) this.ghostHolder.add(buildGhostModel(def, ok))
  }

  /**
   * 사거리 원. 평소엔 겨누는 대상 하나만, R을 누르고 있으면 전부 그린다.
   *
   * 전부 그리는 기능을 둔 이유는 배치의 본질이 **겹침**이기 때문이다. 어느
   * 코너가 비어 있는지는 원 하나로는 절대 안 보인다.
   */
  private updateRings(game: Game, aim: AimResult, showAll: boolean): void {
    let used = 0

    const ring = (x: number, z: number, radiusPx: number, color: number, strong: boolean): void => {
      const mesh = this.ringSlot(used++)
      mesh.position.set(x, 0.05, z)
      const r = this.frame.len(radiusPx)
      mesh.scale.set(r, 1, r)
      const material = mesh.material as THREE.MeshBasicMaterial
      material.color.set(color)
      material.opacity = strong ? 0.85 : 0.35
      mesh.visible = true
    }

    if (showAll) {
      for (const tower of game.towers) {
        const pos = this.frame.toWorld(tower.pos)
        ring(pos.x, pos.z, tower.stats.range * TILE_SIZE, hex(tower.def.accent), false)
      }
    }

    if (aim.kind === 'tower') {
      const pos = this.frame.toWorld(aim.tower.pos)
      ring(
        pos.x,
        pos.z,
        aim.tower.stats.range * TILE_SIZE,
        hex(aim.tower.def.accent),
        true,
      )
      // 지휘 기물은 사거리가 아니라 지휘 반경이 진짜 사거리다.
      if (aim.tower.stats.auraRange > 0) {
        ring(pos.x, pos.z, aim.tower.stats.auraRange * TILE_SIZE, 0xe6c765, true)
      }
    } else if (aim.kind === 'build') {
      const def = getTowerDef(aim.towerId)
      const stats = def.levels[0]!
      const center = this.frame.tileCenter(aim.col, aim.row)
      const radius = (stats.auraRange > 0 ? stats.auraRange : stats.range) * TILE_SIZE
      if (radius > 0) ring(center.x, center.z, radius, aim.ok ? C.rangeRing : C.invalid, true)
    }

    for (let i = used; i < this.ringPool.length; i++) this.ringPool[i]!.visible = false
  }

  private ringSlot(index: number): THREE.Mesh {
    let mesh = this.ringPool[index]
    if (!mesh) {
      mesh = new THREE.Mesh(
        this.ringGeo,
        new THREE.MeshBasicMaterial({
          color: C.rangeRing,
          transparent: true,
          opacity: 0.6,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      )
      mesh.renderOrder = 5
      this.ringPool.push(mesh)
      this.root.add(mesh)
    }
    return mesh
  }

  dispose(): void {
    this.root.clear()
    this.ringPool.length = 0
    this.ringGeo.dispose()
    this.tileGeo.dispose()
    this.validMat.dispose()
    this.invalidMat.dispose()
  }
}
