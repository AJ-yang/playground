import * as THREE from 'three'
import type { Vec2 } from '../core/vec2'
import { clamp } from '../core/vec2'
import { TILE_LAND } from '../data/fjord'
import { COLS, ROWS } from '../data/fjord'
import { TILE } from '../data/tuning'
import { PLATEAU, type Terrain } from './terrain'

/**
 * 카메라 둘 — 부감과 1인칭.
 *
 * **부감은 고정이다.** 팬도 줌도 없다. 아홉 칸이 한 화면에 다 들어오므로
 * 움직일 이유가 없고, 무엇보다 배울 것이 하나 줄어든다(판정자가 규칙 모르는
 * 사람 3명이다 — GDD 6.5).
 *
 * 그리고 이 고정이 설계를 강화한다. 부감은 *전부 보는 시점*이고 1인칭은
 * *한 곳만 보는 시점*이라는 대비가 조작 없이 그대로 드러나기 때문이다.
 */
export class Cameras {
  readonly overhead: THREE.PerspectiveCamera
  readonly first: THREE.PerspectiveCamera

  /** 1인칭 시선. yaw는 Game의 아바타와 공유하고, pitch는 여기만 안다. */
  pitch = 0

  private readonly raycaster = new THREE.Raycaster()
  private readonly hit = new THREE.Vector3()
  private readonly ndc = new THREE.Vector2()

  constructor(aspect: number, private readonly terrain: Terrain) {
    this.overhead = new THREE.PerspectiveCamera(42, aspect, 1, 600)
    this.first = new THREE.PerspectiveCamera(74, aspect, 0.2, 600)
    this.layout(aspect)
  }

  /**
   * 부감 위치. 화면비에 따라 뒤로 물러난다.
   *
   * 세로로 긴 창에서는 세로 화각이 좁아지므로 더 멀리서 봐야 아홉 칸이 다
   * 들어온다. 이걸 안 하면 좁은 창에서 맵 위아래가 잘린다.
   */
  layout(aspect: number): void {
    // 물까지 맞추면 화면의 절반이 빈 바다가 된다. **아홉 칸**에 맞춘다.
    const boardHalf = (TILE * (Math.max(COLS, ROWS) - 1)) / 2 + TILE_LAND / 2
    const need = boardHalf * 1.12
    const vFov = (this.overhead.fov * Math.PI) / 180
    const hFit = need / Math.tan(vFov / 2)
    const wFit = need / (Math.tan(vFov / 2) * aspect)
    const d = Math.max(hFit, wFit)

    // 45도보다 눕히면 앞쪽 칸이 뒤쪽 칸을 가린다. 60도쯤이 균형점이다.
    const tilt = (60 * Math.PI) / 180
    // 판이 해수면보다 `PLATEAU`만큼 올라앉았으므로 겨누는 곳도 같이 올린다.
    this.overhead.position.set(0, PLATEAU + Math.sin(tilt) * d, Math.cos(tilt) * d)
    this.overhead.lookAt(0, PLATEAU, 0)
    this.overhead.aspect = aspect
    this.overhead.updateProjectionMatrix()

    this.first.aspect = aspect
    this.first.updateProjectionMatrix()
  }

  /** 1인칭 카메라를 아바타에 붙인다. 눈높이는 유닛보다 조금 높다. */
  placeFirst(pos: Vec2, yaw: number): void {
    // 눈높이는 **발밑 땅에서부터** 잰다. 절대 높이로 두면 언덕에 올라섰을 때
    // 머리가 땅에 묻힌다.
    this.first.position.set(pos.x, this.terrain.heightAt(pos.x, pos.z) + 4.1, pos.z)
    this.first.rotation.set(0, 0, 0)
    this.first.rotateY(yaw)
    this.first.rotateX(this.pitch)
  }

  addPitch(delta: number): void {
    this.pitch = clamp(this.pitch - delta, -1.15, 0.75)
  }

  /**
   * 화면 좌표 → 지면 위의 한 점.
   *
   * 부감에서 클릭한 곳이 어느 칸인지 알아내는 유일한 경로다. 메시를
   * 레이캐스트하지 않는 것은 나무와 바위에 먼저 맞아서 클릭이 엉뚱한 데로
   * 가기 때문이고, 지형이 생긴 지금은 대신 **높이를 몇 번 되물어** 맞춘다
   * (`Terrain.raise`). 부감이 60도로 누워 있어서 높이 2가 곧 수평 1의
   * 오차가 되므로, 평면 하나로 때리면 클릭이 한 칸 밀리기도 한다.
   */
  screenToGround(x: number, y: number, w: number, h: number): Vec2 | null {
    this.ndc.set((x / w) * 2 - 1, -(y / h) * 2 + 1)
    this.raycaster.setFromCamera(this.ndc, this.overhead)
    const p = this.terrain.raise(this.raycaster.ray, this.hit)
    return p ? { x: p.x, z: p.z } : null
  }
}
