import type { Vec2 } from '../core/vec2'
import type { DamageType } from './types'
import type { Enemy } from './Enemy'

export interface ProjectileSpec {
  origin: Vec2
  /** 유도 대상. 광역 탄은 null이며 destination으로만 날아간다. */
  target: Enemy | null
  destination: Vec2
  /** 픽셀/초 */
  speed: number
  damage: number
  damageType: DamageType
  /** 픽셀 단위 폭발 반경. 0이면 단일 대상. */
  splashRadius: number
  slowAmount: number
  slowDuration: number
  /** 기마 대상에 한해 slowAmount에 더해지는 값 (거마작 전용) */
  cavalrySlow: number
  poisonDps: number
  poisonDuration: number
  color: string
  radius: number
}

/**
 * 투사체.
 *
 * 유도탄(단일 대상 기물)은 대상을 계속 쫓고, 광역탄(`splashRadius > 0`인
 * 기물 — 살수·화차)은 발사 시점에 계산한 착탄 지점으로 날아간다. 유도탄의
 * 대상이 비행 중 죽으면 마지막 위치로 향하는 광역 0짜리 탄이 되어 조용히
 * 사라진다.
 *
 * 기물을 이름이 아니라 **속성으로 적는다.** 세계관을 갈아엎을 때마다 이름이
 * 바뀌는데(중세 → 한국 민속 → 조선의 전쟁), 엔진 계층 주석에 이름을 박아 두면
 * 그때마다 실재하지 않는 기물을 가리키는 주석이 남는다.
 */
export class Projectile {
  pos: Vec2
  readonly spec: ProjectileSpec
  private destination: Vec2
  /** 착탄해서 데미지 판정이 필요한 상태 */
  impacted = false
  /** 판정까지 끝나 제거 대기 중 */
  dead = false
  /** 렌더링용 잔상 방향 */
  heading: Vec2 = { x: 1, y: 0 }
  /** 발사한 타워의 ID. 처치 기여도 집계와 기마 판정에 쓴다. */
  sourceTowerId = -1

  constructor(spec: ProjectileSpec) {
    this.spec = spec
    this.pos = { ...spec.origin }
    this.destination = { ...spec.destination }
  }

  update(dt: number): void {
    if (this.dead || this.impacted) return

    // 유도탄은 매 스텝 목표 위치를 갱신한다.
    const target = this.spec.target
    if (target && target.alive) {
      this.destination = { ...target.pos }
    }

    const dx = this.destination.x - this.pos.x
    const dy = this.destination.y - this.pos.y
    const distance = Math.hypot(dx, dy)
    const step = this.spec.speed * dt

    if (distance <= step || distance < 0.5) {
      this.pos = { ...this.destination }
      this.impacted = true
      return
    }

    this.heading = { x: dx / distance, y: dy / distance }
    this.pos = { x: this.pos.x + this.heading.x * step, y: this.pos.y + this.heading.y * step }
  }
}
