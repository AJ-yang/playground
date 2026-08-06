import type { Vec2 } from '../core/vec2'
import type { EnemyDef } from '../data/enemies'
import type { DamageType } from './types'
import type { Path } from './Path'

/**
 * 적 개체.
 *
 * 위치는 경로 상의 진행도(distance) 하나로 관리하고, 픽셀 좌표는 매 스텝
 * Path에서 파생시킨다. 감속은 "가장 강한 감속 하나만 적용"하는 방식으로,
 * 얼음탑을 여러 개 겹쳐도 무한히 느려지지 않게 했다.
 */
export class Enemy {
  readonly id: number
  readonly def: EnemyDef
  hp: number
  /** 경로를 따라 진행한 거리 (픽셀) */
  distance: number
  pos: Vec2
  alive = true
  /** 목표 지점에 도달해 생명을 깎았는가 */
  leaked = false

  /** 현재 적용 중인 감속 배율 (1이면 감속 없음) */
  private slowFactor = 1
  private slowTimer = 0
  /** 피격 시 잠깐 밝게 번쩍이는 연출용 타이머 */
  flashTimer = 0

  constructor(id: number, def: EnemyDef, path: Path, spawnOffset = 0) {
    this.id = id
    this.def = def
    this.hp = def.maxHp
    this.distance = -spawnOffset
    this.pos = path.positionAt(0)
  }

  get maxHp(): number {
    return this.def.maxHp
  }

  get hpRatio(): number {
    return Math.max(0, this.hp / this.def.maxHp)
  }

  get isSlowed(): boolean {
    return this.slowTimer > 0
  }

  /** 이 적이 해당 타워의 타겟팅 대상에서 제외되는가 (공중 유닛 판정). */
  flyingBlocked(towerTargetsAir: boolean): boolean {
    return this.def.flying && !towerTargetsAir
  }

  /** 현재 실제 이동 속도 (픽셀/초). */
  currentSpeed(tileSize: number): number {
    return this.def.speed * tileSize * (this.slowTimer > 0 ? this.slowFactor : 1)
  }

  /**
   * 감속 적용. 이미 더 강한 감속이 걸려 있으면 지속시간만 갱신한다.
   * @param amount 0.45면 속도가 45%로 떨어진다는 뜻
   */
  applySlow(amount: number, duration: number): void {
    if (amount <= 0 || duration <= 0) return
    const factor = 1 - amount
    if (this.slowTimer <= 0 || factor < this.slowFactor) {
      this.slowFactor = factor
      this.slowTimer = duration
    } else {
      this.slowTimer = Math.max(this.slowTimer, duration)
    }
  }

  /**
   * 데미지 적용. 방어 계산이 여기 한 곳에만 있어야 밸런스를 추적할 수 있다.
   * @returns 실제로 들어간 데미지
   */
  takeDamage(amount: number, type: DamageType): number {
    if (!this.alive) return 0

    let dealt: number
    switch (type) {
      case 'physical':
        // 장갑은 고정 감소. 완전 무효화는 막되 최소 1로 눌러 존재감은 남긴다.
        dealt = Math.max(1, amount - this.def.armor)
        break
      case 'magic':
        dealt = Math.max(1, amount * (1 - this.def.magicResist))
        break
      case 'pure':
        dealt = amount
        break
    }

    this.hp -= dealt
    this.flashTimer = 0.09
    if (this.hp <= 0) {
      this.hp = 0
      this.alive = false
    }
    return dealt
  }

  update(dt: number, path: Path, tileSize: number): void {
    if (this.slowTimer > 0) this.slowTimer -= dt
    if (this.flashTimer > 0) this.flashTimer -= dt

    this.distance += this.currentSpeed(tileSize) * dt
    this.pos = path.positionAt(this.distance)

    if (this.distance >= path.totalLength) {
      this.leaked = true
      this.alive = false
    }
  }

  /**
   * dt초 뒤 예상 위치. 대포탑처럼 투사체가 느린 타워의 예측 사격에 쓴다.
   * 감속 지속시간까지 고려하지는 않는다 — 그 정도 오차는 광역 폭발이 흡수한다.
   */
  predictPosition(dt: number, path: Path, tileSize: number): Vec2 {
    return path.positionAt(this.distance + this.currentSpeed(tileSize) * dt)
  }
}
