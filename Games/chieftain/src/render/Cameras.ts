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
   * 세로로 긴 창에서는 세로 화각이 좁아지므로 더 멀리서 봐야 같은 넓이가
   * 들어온다. 이걸 안 하면 좁은 창에서 맵 위아래가 잘린다.
   */
  layout(aspect: number): void {
    this.aspect = aspect
    this.spanCap = Cameras.capFor(aspect)
    this.viewSpan = clamp(this.viewSpan, Cameras.MIN_SPAN, this.spanCap)
    this.overhead.aspect = aspect
    this.overhead.updateProjectionMatrix()
    this.first.aspect = aspect
    this.first.updateProjectionMatrix()
    this.rig()
  }

  /**
   * 가장 멀리 물러설 수 있는 배율. **화면비를 따라간다.**
   *
   * 고정값으로 두면 넓은 창에서는 맵이 다 들어오고도 화면의 4분의 1이 바다이고,
   * 좁은 창에서는 다 들어오지도 않는다. 맵이 딱 들어오는 배율을 구해 5%만
   * 여유를 얹는다 — 그 너머는 바다만 넓어질 뿐이다.
   *
   * `viewSpan`은 화면의 **짧은 쪽**에 담는 거리라 화면비를 기준으로 갈린다
   * (`rig`가 `need`를 어느 축에 걸지 정하는 것과 같은 갈림이다).
   */
  private static capFor(aspect: number): number {
    const fit =
      aspect >= 1
        ? Math.max(MAP_H, MAP_W / aspect)
        : Math.max(MAP_W, MAP_H * aspect)
    return fit * 1.05
  }

  /**
   * 지금 배율과 화면비로 부감 카메라의 높이·거리, 그리고 초점이 갈 수 있는
   * 범위를 다시 잡는다. 배율이 바뀌거나 창이 바뀌면 부른다.
   */
  private rig(): void {
    const need = this.viewSpan / 2
    const vFov = (this.overhead.fov * Math.PI) / 180
    const hFit = need / Math.tan(vFov / 2)
    const wFit = need / (Math.tan(vFov / 2) * this.aspect)
    const d = Math.max(hFit, wFit)

    // 45도보다 눕히면 앞쪽이 뒤쪽을 가린다. 60도쯤이 균형점이다.
    const tilt = (60 * Math.PI) / 180
    this.lift = Math.sin(tilt) * d
    this.back = Math.cos(tilt) * d

    // 지금 화면에 실제로 담기는 절반 크기. 화면비가 1을 넘으면 `need`가 세로,
    // 넘지 않으면 가로가 되므로 두 축을 따로 구한다.
    this.halfH = d * Math.tan(vFov / 2)
    this.halfW = this.halfH * this.aspect

    this.clampFocus()
    this.placeOverhead()
  }

  /**
   * 초점을 맵 안쪽으로 되돌린다.
   *
   * **화면 끝이 맵 끝에 닿으면 멈춘다.** 예전에는 초점만 ±맵 절반으로 잘라서,
   * 끝까지 밀면 화면의 절반 넘게가 빈 바다였다 — 가장자리 스크롤이 생기면서
   * 그 자리에 닿기가 너무 쉬워졌고, 배율을 줄이면 판이 통째로 화면 밖으로
   * 나갈 수도 있다.
   *
   * 딱 맞게 자르지는 않는다. `OVERSCROLL`만큼 여유를 둬서 해안선이 화면
   * 가장자리에 붙지 않게 한다 — 가장 바깥 지역에서 싸울 때 그 부대가 화면
   * 맨 끝에 걸리면 보고 있기가 어렵다.
   *
   * 화면이 맵보다 넓어지면(많이 줄였을 때) 갈 곳이 없으므로 한가운데로 묶인다.
   */
  private clampFocus(): void {
    const limitX = Math.max(0, MAP_W / 2 - this.halfW * (1 - Cameras.OVERSCROLL))
    const limitZ = Math.max(0, MAP_H / 2 - this.halfH * (1 - Cameras.OVERSCROLL))
    this.focusX = clamp(this.focusX, -limitX, limitX)
    this.focusZ = clamp(this.focusZ, -limitZ, limitZ)
  }

  /**
   * 배율을 바꾼다. `notches`가 양수면 멀어지고 음수면 가까워진다.
   *
   * 더하지 않고 **곱한다.** 가까이서 한 칸이 멀리서 한 칸과 같은 비율로
   * 느껴져야 하는데, 더하면 가까울수록 한 칸이 거칠어진다.
   *
   * 바뀌었으면 true. 초점을 커서 아래에 붙들어 두려면 부르는 쪽이 바꾸기 전후의
   * 지면 좌표를 재야 하는데, 안 바뀌었으면 그 일이 통째로 헛돈다.
   */
  zoomBy(notches: number): boolean {
    const next = clamp(
      this.viewSpan * Math.pow(Cameras.ZOOM_STEP, notches),
      Cameras.MIN_SPAN,
      this.spanCap,
    )
    if (next === this.viewSpan) return false
    this.viewSpan = next
    this.rig()
    return true
  }

  /** 초점을 그만큼 옮긴다. 배율을 바꾼 뒤 커서 아래를 붙들 때 쓴다. */
  nudge(dx: number, dz: number): void {
    this.focusX += dx
    this.focusZ += dz
    this.clampFocus()
    this.placeOverhead()
  }

  /**
   * 화면의 짧은 쪽에 담는 월드 거리. 배율이 이 값 하나다.
   *
   * 기본값 168은 유닛이 점이 되지 않는 선에서 잡았다 — 발밑 링이 보여야 지휘
   * 반경 규칙이 전달된다(GDD 6.2). 아래위로 열어 두되, 멀어지는 쪽은 맵이 딱
   * 들어오는 데까지만 간다(`capFor`). 더 가면 유닛이 먼지가 되어 화면이
   * 미니맵의 못생긴 사본이 된다.
   */
  private static readonly DEFAULT_SPAN = 168
  private static readonly MIN_SPAN = 70
  private viewSpan = Cameras.DEFAULT_SPAN
  /** 지금 화면비에서 가장 멀리 물러설 수 있는 배율. `layout`이 정한다. */
  private spanCap = Cameras.DEFAULT_SPAN
  /**
   * 휠 한 칸의 배율.
   *
   * 1.12로 잡았더니 기본에서 상한까지 세 칸이라 한 번 굴리면 끝까지 튀었다.
   * 1.08이면 하한에서 상한까지 열여섯 칸쯤 되어 손으로 고를 수 있다.
   */
  private static readonly ZOOM_STEP = 1.08
  /** 맵 밖으로 내다볼 수 있는 여유. 화면 절반 크기에 대한 비율이다. */
  private static readonly OVERSCROLL = 0.2

  /** 지금 화면에 담기는 절반 크기. `rig`가 정한다. */
  private halfW = 0
  private halfH = 0
  private aspect = 1

  /** 부감 카메라를 지금 겨누는 곳에 맞춰 세운다. */
  placeOverhead(): void {
    this.overhead.position.set(this.focusX, PLATEAU + this.lift, this.focusZ + this.back)
    this.overhead.lookAt(this.focusX, PLATEAU, this.focusZ)
    this.overhead.updateMatrixWorld()
  }

  /** 그 점으로 화면을 옮긴다. 미니맵 좌클릭과 승천이 쓴다. */
  lookAtPoint(p: Vec2): void {
    this.focusX = p.x
    this.focusZ = p.z
    this.clampFocus()
    this.placeOverhead()
  }

  /** 지금 부감이 보고 있는 판 위의 점. 미니맵이 시야 사각형을 여기에 그린다. */
  get focus(): Vec2 {
    return { x: this.focusX, z: this.focusZ }
  }

  /** 화면에 담기는 월드 거리. 미니맵의 사각형 크기가 여기서 나온다. */
  get span(): number {
    return this.viewSpan
  }

  /** 기본 배율에 대한 비율. 1이면 기본, 크면 멀리서 본다. 안개가 이걸 따라간다. */
  get zoom(): number {
    return this.viewSpan / Cameras.DEFAULT_SPAN
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
    // 미는 속도는 **배율을 따라간다.** 화면에 담긴 넓이에 대해 같은 비율로
    // 움직여야 가까이서도 멀리서도 같은 손맛이 난다. 고정 속도로 두면 많이
    // 당겼을 때 판이 총알처럼 튀고, 많이 줄였을 때는 기어간다.
    const speed = 150 * (this.viewSpan / Cameras.DEFAULT_SPAN)
    this.focusX += dx * speed * dt
    this.focusZ += dz * speed * dt
    this.clampFocus()
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
