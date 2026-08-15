import * as THREE from 'three'
import { clamp } from '../core/vec2'
import { TILE_M, type BoardFrame } from './coords'

/**
 * 1인칭 조작 — 시선과 발.
 *
 * 이 게임에서 3D가 값을 하려면 **걸어서 본 것이 판단을 바꿔야** 한다. 그래서
 * 카메라를 자유롭게 띄우지 않고 사람 눈높이에 묶었다. 성벽에 가려 안 보이는
 * 곳이 생기고, 길이 꺾이는 안쪽에 서면 앞뒤가 한 번에 보인다 — 어디에 무엇을
 * 지을지의 판단이 2D와 달라지는 것은 이 제약 덕분이다.
 *
 * 그래서 **뚫고 지나갈 수 없다**. 바위·기물·성벽은 실제로 막고, 지나가는 적도
 * 어깨로 민다. 통과할 수 있으면 눈높이 제약이 무의미해지고, 무엇보다 자기가
 * 지은 기물 안에 서서 화면이 지붕으로 가득 차는 일이 생긴다.
 */

/** 눈높이(미터). 조선 병사의 평균 신장쯤에서 잡았다. */
const EYE_HEIGHT = 1.68
const RADIUS = 0.34
const WALK_SPEED = 5.4
const RUN_SPEED = 9.0
/** 가감속. 0이면 즉시 최고 속도라 얼음판처럼 느껴진다. */
const ACCEL = 34
const FRICTION = 12
const PITCH_LIMIT = Math.PI / 2 - 0.05

export interface Solidity {
  /** 그 타일이 사람을 막는가 (막힌 지형 · 기물) */
  solidTile(col: number, row: number): boolean
  /** 밀어내야 하는 적들의 월드 위치와 반경 */
  crowd(): Array<{ x: number; z: number; r: number }>
}

export class Player {
  readonly position = new THREE.Vector3()
  yaw = 0
  pitch = 0
  /** 마우스 감도. 설정에서 조절한다. */
  sensitivity = 0.0022
  locked = false

  private readonly velocity = new THREE.Vector3()
  private readonly keys = new Set<string>()
  private bobPhase = 0
  private bobAmount = 0

  /**
   * @param getFrame 지금 판의 좌표계. 스테이지를 바꾸면 맵이 통째로 갈리므로
   *   값이 아니라 **접근자**로 받는다 — 한 번 붙잡아 두면 다음 판에서 옛 맵의
   *   경계로 사람을 가둔다.
   */
  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly getFrame: () => BoardFrame,
    private readonly world: Solidity,
  ) {}

  /** 스테이지 시작 위치 — 마을(경로의 끝) 앞에 등을 지고 선다. */
  spawnAt(worldX: number, worldZ: number, facing: number): void {
    this.position.set(worldX, EYE_HEIGHT, worldZ)
    this.yaw = facing
    // 조금 숙이고 시작한다. 정면을 그대로 보면 시선이 닿는 땅이 이십 미터
    // 밖이라, 첫 기물을 지으려면 무조건 고개를 내려야 한다.
    this.pitch = -0.24
    this.velocity.set(0, 0, 0)
    this.syncCamera()
  }

  attach(element: HTMLElement): () => void {
    const onMouseMove = (event: MouseEvent): void => {
      if (!this.locked) return
      this.yaw -= event.movementX * this.sensitivity
      this.pitch = clamp(this.pitch - event.movementY * this.sensitivity, -PITCH_LIMIT, PITCH_LIMIT)
    }
    const onKeyDown = (event: KeyboardEvent): void => void this.keys.add(event.code)
    const onKeyUp = (event: KeyboardEvent): void => void this.keys.delete(event.code)
    // 창을 벗어나면 눌린 키가 영영 눌린 채로 남는다 — 돌아왔을 때 혼자
    // 앞으로 걸어가는 사고가 여기서 난다.
    const onBlur = (): void => void this.keys.clear()
    const onLockChange = (): void => {
      this.locked = document.pointerLockElement === element
      if (!this.locked) this.keys.clear()
    }

    document.addEventListener('mousemove', onMouseMove)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    document.addEventListener('pointerlockchange', onLockChange)

    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('pointerlockchange', onLockChange)
    }
  }

  get isMoving(): boolean {
    return this.velocity.lengthSq() > 1
  }

  update(dt: number): void {
    const forward = Number(this.held('KeyW', 'ArrowUp')) - Number(this.held('KeyS', 'ArrowDown'))
    const strafe = Number(this.held('KeyD', 'ArrowRight')) - Number(this.held('KeyA', 'ArrowLeft'))
    const running = this.held('ShiftLeft', 'ShiftRight')
    const top = running ? RUN_SPEED : WALK_SPEED

    // 시선 기준 이동. yaw가 0일 때 -Z를 보므로 전진 벡터도 거기서 온다.
    const sin = Math.sin(this.yaw)
    const cos = Math.cos(this.yaw)
    let wishX = -sin * forward + cos * strafe
    let wishZ = -cos * forward - sin * strafe
    const wishLen = Math.hypot(wishX, wishZ)
    if (wishLen > 0) {
      // 대각선이 빠른 고전 버그를 막는다.
      wishX /= wishLen
      wishZ /= wishLen
      this.velocity.x += wishX * ACCEL * dt
      this.velocity.z += wishZ * ACCEL * dt
      const speed = Math.hypot(this.velocity.x, this.velocity.z)
      if (speed > top) {
        this.velocity.x *= top / speed
        this.velocity.z *= top / speed
      }
    } else {
      const drop = Math.max(0, 1 - FRICTION * dt)
      this.velocity.x *= drop
      this.velocity.z *= drop
    }

    // 축을 따로 밀고 따로 되돌린다. 한 번에 밀면 벽에 비스듬히 닿았을 때
    // 미끄러지지 못하고 그 자리에 붙는다.
    this.moveAxis('x', this.velocity.x * dt)
    this.moveAxis('z', this.velocity.z * dt)
    this.pushOutOfCrowd()
    this.clampToField()

    // 걸을 때 눈높이가 미세하게 오르내린다. 없으면 미끄러지듯 움직여
    // 사람이 아니라 카메라가 떠다니는 느낌이 든다.
    const speed = Math.hypot(this.velocity.x, this.velocity.z)
    this.bobPhase += dt * (6 + speed * 0.9)
    this.bobAmount += (Math.min(1, speed / WALK_SPEED) - this.bobAmount) * Math.min(1, dt * 8)
    this.syncCamera()
  }

  private held(...codes: string[]): boolean {
    for (const code of codes) if (this.keys.has(code)) return true
    return false
  }

  private moveAxis(axis: 'x' | 'z', delta: number): void {
    if (delta === 0) return
    const before = this.position[axis]
    this.position[axis] = before + delta

    // 몸 반경이 걸치는 타일만 본다 — 최대 네 칸이다.
    const frame = this.getFrame()
    const minTile = frame.tileAt(this.position.x - RADIUS, this.position.z - RADIUS)
    const maxTile = frame.tileAt(this.position.x + RADIUS, this.position.z + RADIUS)
    for (let row = minTile.row; row <= maxTile.row; row++) {
      for (let col = minTile.col; col <= maxTile.col; col++) {
        if (!this.world.solidTile(col, row)) continue
        this.position[axis] = before
        this.velocity[axis] = 0
        return
      }
    }
  }

  /** 적과 겹치면 어깨로 밀린다. 적의 진로는 바뀌지 않는다 — 밀리는 쪽은 나다. */
  private pushOutOfCrowd(): void {
    for (const body of this.world.crowd()) {
      const dx = this.position.x - body.x
      const dz = this.position.z - body.z
      const reach = body.r + RADIUS
      const d2 = dx * dx + dz * dz
      if (d2 >= reach * reach || d2 < 1e-6) continue
      const d = Math.sqrt(d2)
      const push = (reach - d) / d
      this.position.x += dx * push
      this.position.z += dz * push
    }
  }

  private clampToField(): void {
    const frame = this.getFrame()
    const halfW = frame.widthM / 2 - RADIUS
    const halfD = frame.depthM / 2 - RADIUS
    // 길이 드나드는 문 밖으로는 반 칸까지만 나갈 수 있게 둔다 — 문 앞에
    // 서서 오는 적을 마주 볼 수 있어야 하지만, 맵 밖 들판으로 걸어 나가면
    // 지형이 없다.
    this.position.x = clamp(this.position.x, -halfW - TILE_M * 0.5, halfW + TILE_M * 0.5)
    this.position.z = clamp(this.position.z, -halfD - TILE_M * 0.5, halfD + TILE_M * 0.5)
  }

  private syncCamera(): void {
    const bob = Math.sin(this.bobPhase) * 0.045 * this.bobAmount
    const sway = Math.cos(this.bobPhase * 0.5) * 0.02 * this.bobAmount
    this.camera.position.set(this.position.x, this.position.y + bob, this.position.z)
    this.camera.rotation.set(this.pitch, this.yaw, sway * 0.5, 'YXZ')
  }
}
