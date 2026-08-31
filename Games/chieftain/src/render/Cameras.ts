import * as THREE from 'three'
import type { Vec2 } from '../core/vec2'
import { clamp } from '../core/vec2'
import { MAP_H, MAP_W } from '../data/land'
import { PLATEAU, type Terrain } from './terrain'

/**
 * 카메라 둘 — 부감과 1인칭.
 *
 * ## 부감이 고정에서 스크롤로 바뀌었다
 *
 * 아홉 칸짜리 판일 때는 **고정**이었다. 판이 한 화면에 다 들어오니 움직일
 * 이유가 없었고, 배울 것이 하나 줄어드는 것도 값이었다(GDD 6.5).
 *
 * 맵이 300×180으로 넓어지면서 그게 불가능해졌다. 다 넣으려면 유닛이 점이 되고,
 * 유닛이 점이 되면 **발밑 링이 안 보인다** — 이 게임의 시각적 규칙 전달이
 * 통째로 거기 걸려 있다(GDD 6.2).
 *
 * 그래서 **아바타를 따라간다.** 새 조작을 배울 필요가 없다는 성질을 지키면서
 * 스크롤을 얻는 방법이고, 무엇보다 이 게임에서 아바타는 이미 화면의 중심이다 —
 * 지휘 반경이 그를 따라다니므로 그가 있는 곳이 곧 지금 중요한 곳이다.
 * 둘러보고 싶으면 WASD로 밀 수 있고, 손을 떼면 다시 아바타에게 돌아온다.
 *
 * 대가는 정직하게 적어 둔다: 부감이 더 이상 *전부 보는 시점*이 아니다. 강림의
 * 대가가 그만큼 싸졌다는 뜻이고, 이건 GDD 3.3이 세운 대비를 약하게 만든다.
 * 대신 미니맵이 판 전체의 소유권과 아군 위치를 늘 보여 준다.
 */
export class Cameras {
  readonly overhead: THREE.PerspectiveCamera
  readonly first: THREE.PerspectiveCamera

  /** 1인칭 시선. yaw는 Game의 아바타와 공유하고, pitch는 여기만 안다. */
  pitch = 0

  /**
   * 부감이 지금 겨누는 곳.
   *
   * **이제 이것이 유일한 기준이다.** 예전에는 아바타를 따라다니고 손으로 민
   * 양이 0으로 돌아왔는데, 신이 판 밖으로 나가면서 따라갈 몸이 없어졌다.
   * 부감은 이제 그냥 자유롭게 도는 카메라다 — 손으로 밀고, 미니맵을 짚어
   * 옮기고, 올라올 때 마지막으로 서 있던 자리로 간다.
   */
  private focusX = 0
  private focusZ = 0
  /** 카메라를 판 위에 띄우는 높이와 거리. `layout`이 정한다. */
  private lift = 0
  private back = 0

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
    // 화면 세로에 담을 월드 거리. 유닛이 점이 되지 않는 선이 이 값의 유일한
    // 제약이다 — 발밑 링이 보여야 지휘 반경 규칙이 전달된다(GDD 6.2).
    const need = Cameras.VIEW_SPAN / 2
    const vFov = (this.overhead.fov * Math.PI) / 180
    const hFit = need / Math.tan(vFov / 2)
    const wFit = need / (Math.tan(vFov / 2) * aspect)
    const d = Math.max(hFit, wFit)

    // 45도보다 눕히면 앞쪽이 뒤쪽을 가린다. 60도쯤이 균형점이다.
    const tilt = (60 * Math.PI) / 180
    this.lift = Math.sin(tilt) * d
    this.back = Math.cos(tilt) * d

    this.overhead.aspect = aspect
    this.overhead.updateProjectionMatrix()
    this.first.aspect = aspect
    this.first.updateProjectionMatrix()
    this.placeOverhead()
  }

  /** 화면 세로에 담는 월드 거리. */
  private static readonly VIEW_SPAN = 168

  /** 부감 카메라를 지금 겨누는 곳에 맞춰 세운다. */
  placeOverhead(): void {
    this.overhead.position.set(this.focusX, PLATEAU + this.lift, this.focusZ + this.back)
    this.overhead.lookAt(this.focusX, PLATEAU, this.focusZ)
    this.overhead.updateMatrixWorld()
  }

  /** 그 점으로 화면을 옮긴다. 미니맵 좌클릭과 승천이 쓴다. */
  lookAtPoint(p: Vec2): void {
    this.focusX = clamp(p.x, -MAP_W / 2, MAP_W / 2)
    this.focusZ = clamp(p.z, -MAP_H / 2, MAP_H / 2)
    this.placeOverhead()
  }

  /** 지금 부감이 보고 있는 판 위의 점. 미니맵이 시야 사각형을 여기에 그린다. */
  get focus(): Vec2 {
    return { x: this.focusX, z: this.focusZ }
  }

  /** 화면 세로에 담기는 월드 거리. 미니맵의 사각형 크기가 여기서 나온다. */
  get span(): number {
    return Cameras.VIEW_SPAN
  }

  /**
   * 부감을 손으로 민다. `dx`·`dz`는 화면 방향, `dt`는 프레임 간격.
   *
   * 돌아오지 않는다. 신이 판 밖으로 나간 지금 "돌아갈 곳"이 없고, 미니맵이
   * 판 전체를 보여 주므로 화면을 잃어버릴 걱정도 없다.
   *
   * **길이가 1을 넘으면 잘라 낸다.** 키보드와 화면 가장자리가 같은 프레임에
   * 같은 방향을 밀 수 있는데(왼쪽 키를 누른 채 커서를 왼쪽 끝에 두면 그렇다),
   * 그냥 더하면 그 순간만 두 배로 빨라진다. 부르는 쪽마다 따로 맞추게 두면
   * 언젠가 하나가 빠지므로 여기서 못 박는다.
   */
  panOverhead(dx: number, dz: number, dt: number): void {
    if (dx === 0 && dz === 0) return
    const len = Math.sqrt(dx * dx + dz * dz)
    if (len > 1) {
      dx /= len
      dz /= len
    }
    const SPEED = 150
    this.focusX = clamp(this.focusX + dx * SPEED * dt, -MAP_W / 2, MAP_W / 2)
    this.focusZ = clamp(this.focusZ + dz * SPEED * dt, -MAP_H / 2, MAP_H / 2)
    this.placeOverhead()
  }

  /**
   * 1인칭 카메라를 아바타에 붙인다.
   *
   * 눈높이는 **발밑 땅에서부터** 잰다. 절대 높이로 두면 언덕에 올라섰을 때
   * 머리가 땅에 묻힌다.
   *
   * 값이 4.1에서 EYE로 올라간 이유: 1인칭에서 내 몸을 그리기 시작했는데,
   * 아바타의 실제 키가 6.8이라 4.1은 **가슴 높이**였다. 거기에 카메라를 두면
   * 내 어깨가 화면을 가로지른다. 어깨(4.9)보다 위, 투구 아래에 둔다.
   */
  placeFirst(pos: Vec2, yaw: number): void {
    // 눈은 머리 한가운데가 아니라 **얼굴 앞면**에 있다. 이 한 뼘을 안 밀면
    // 아래를 볼 때마다 자기 가슴 윗면이 화면을 덮는다 — 부감에서 잘 읽히라고
    // 머리를 키우고 목을 짧게 잡은 비율이라 특히 심하다.
    const x = pos.x + Math.sin(yaw) * Cameras.EYE_FORWARD
    const z = pos.z + Math.cos(yaw) * Cameras.EYE_FORWARD
    this.first.position.set(x, this.terrain.heightAt(pos.x, pos.z) + Cameras.EYE, z)
    this.first.rotation.set(0, 0, 0)
    this.first.rotateY(yaw)
    this.first.rotateX(this.pitch)
  }

  /** 아바타 눈높이. 어깨 위, 투구 아래. */
  private static readonly EYE = 5.35
  /** 눈이 얼굴 앞면에 놓이도록 앞으로 미는 거리. */
  private static readonly EYE_FORWARD = 1.15

  /**
   * 걸음 흔들림을 얹는다.
   *
   * `placeFirst` 다음에 부른다 — 흔들림의 위상은 아바타 뼈대가 굴리고 있고,
   * 그 뼈대는 `Actors.sync`에서야 갱신되기 때문이다. 발과 눈이 같은 위상을
   * 쓰므로 어긋날 수가 없다.
   */
  applyFirstBob(bob: { y: number; roll: number }): void {
    this.first.position.y += bob.y
    this.first.rotateZ(bob.roll)
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
