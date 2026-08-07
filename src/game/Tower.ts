import type { Vec2 } from '../core/vec2'
import { dist2 } from '../core/vec2'
import { getTowerDef, SELL_REFUND_RATIO, type TowerDef, type TowerLevelDef } from '../data/towers'
import type { TargetPriority } from './types'
import type { Enemy } from './Enemy'
import { Projectile, type ProjectileSpec } from './Projectile'

export const MAX_TOWER_LEVEL = 3

/**
 * 건설된 타워 1기.
 *
 * 타워는 스스로 데미지를 적용하지 않는다. 항상 투사체를 만들어 반환하고,
 * 실제 판정은 Game이 한 곳에서 처리한다. 판정 경로를 하나로 모아둬야
 * 밸런스를 추적할 수 있고, 나중에 관통·연쇄 같은 특수 효과를 붙이기도 쉽다.
 */
export class Tower {
  readonly id: number
  readonly def: TowerDef
  readonly col: number
  readonly row: number
  readonly pos: Vec2

  /** 1 ~ MAX_TOWER_LEVEL */
  level = 1
  targetPriority: TargetPriority = 'first'
  /** 지금까지 이 타워에 투자한 총 골드 (판매 환급 계산용) */
  investedGold: number

  private cooldown = 0
  /** 포신이 향하는 각도 (라디안). 연출용. */
  turretAngle = -Math.PI / 2
  /** 발사 반동 애니메이션 타이머 */
  recoil = 0
  /** 누적 처치 수 — 선택 시 패널에 표시 */
  kills = 0
  /** 누적 입힌 데미지 */
  damageDealt = 0

  constructor(id: number, towerId: string, col: number, row: number, pos: Vec2) {
    this.id = id
    this.def = getTowerDef(towerId)
    this.col = col
    this.row = row
    this.pos = pos
    this.investedGold = this.def.levels[0].cost
  }

  get stats(): TowerLevelDef {
    return this.def.levels[this.level - 1]!
  }

  get isMaxLevel(): boolean {
    return this.level >= MAX_TOWER_LEVEL
  }

  /** 다음 레벨 비용. 만렙이면 null. */
  get upgradeCost(): number | null {
    return this.isMaxLevel ? null : this.def.levels[this.level].cost
  }

  get nextStats(): TowerLevelDef | null {
    return this.isMaxLevel ? null : this.def.levels[this.level]!
  }

  /** 사거리 (픽셀) */
  rangePx(tileSize: number): number {
    return this.stats.range * tileSize
  }

  upgrade(): void {
    if (this.isMaxLevel) return
    this.investedGold += this.def.levels[this.level].cost
    this.level++
    // 업그레이드 직후 곧바로 한 발 나가도록 쿨다운을 비운다.
    this.cooldown = 0
  }

  sellValue(): number {
    return Math.floor(this.investedGold * SELL_REFUND_RATIO)
  }

  cycleTargetPriority(order: readonly TargetPriority[]): void {
    const i = order.indexOf(this.targetPriority)
    this.targetPriority = order[(i + 1) % order.length]!
  }

  /**
   * 한 스텝 진행. 사거리 안에 적이 있고 쿨다운이 끝났으면 투사체를 반환한다.
   */
  update(dt: number, enemies: readonly Enemy[], tileSize: number): Projectile | null {
    if (this.cooldown > 0) this.cooldown -= dt
    if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - dt * 6)

    const target = this.selectTarget(enemies, tileSize)
    if (!target) return null

    // 사격 여부와 무관하게 포신은 대상을 따라간다.
    this.turretAngle = Math.atan2(target.pos.y - this.pos.y, target.pos.x - this.pos.x)

    if (this.cooldown > 0) return null
    this.cooldown = 1 / this.stats.fireRate
    this.recoil = 1
    return this.fire(target, tileSize)
  }

  private fire(target: Enemy, tileSize: number): Projectile {
    const stats = this.stats
    const speedPx = stats.projectileSpeed * tileSize
    const isSplash = stats.splashRadius > 0

    // 광역탄은 유도되지 않으므로 비행 시간만큼 앞을 겨눈다.
    let destination = { ...target.pos }
    if (isSplash) {
      const flightTime = Math.hypot(target.pos.x - this.pos.x, target.pos.y - this.pos.y) / speedPx
      destination = target.predictPosition(flightTime, tileSize)
    }

    const spec: ProjectileSpec = {
      origin: { ...this.pos },
      target: isSplash ? null : target,
      destination,
      speed: speedPx,
      damage: stats.damage,
      damageType: this.def.damageType,
      splashRadius: stats.splashRadius * tileSize,
      slowAmount: stats.slowAmount,
      slowDuration: stats.slowDuration,
      poisonDps: stats.poisonDps,
      poisonDuration: stats.poisonDuration,
      color: this.def.accent,
      radius: isSplash ? 5 : 3.5,
    }
    return new Projectile(spec)
  }

  /** 타겟팅 우선순위 규칙에 따라 사거리 안에서 한 명을 고른다. */
  private selectTarget(enemies: readonly Enemy[], tileSize: number): Enemy | null {
    const rangeSq = this.rangePx(tileSize) ** 2
    let best: Enemy | null = null
    let bestScore = 0

    for (const enemy of enemies) {
      if (!enemy.alive) continue
      if (enemy.flyingBlocked(this.def.targetsAir)) continue
      // 아직 경로에 진입하지 않은(스폰 대기 중인) 적은 제외
      if (enemy.distance < 0) continue

      const dSq = dist2(this.pos, enemy.pos)
      if (dSq > rangeSq) continue

      let score: number
      switch (this.targetPriority) {
        case 'first':
          // 마을에 가까운 적 = 남은 거리가 작은 적. 경로 길이가 서로 달라도
          // 이 기준이면 다중 경로 맵에서 의미가 흔들리지 않는다.
          score = -enemy.remaining
          break
        case 'last':
          score = enemy.remaining
          break
        case 'strongest':
          score = enemy.hp
          break
        case 'closest':
          score = -dSq
          break
      }

      if (!best || score > bestScore) {
        best = enemy
        bestScore = score
      }
    }
    return best
  }
}
