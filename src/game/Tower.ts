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
  /**
   * 기고(旗鼓)의 지휘를 받아 올라간 공격속도 비율. 0.18이면 +18%.
   *
   * 매 프레임 주변 타워를 훑으면 시뮬레이션 핫 패스가 무거워지므로, 타워 집합이
   * 바뀔 때(건설·판매·업그레이드)만 Game이 다시 계산해 여기에 박아 둔다.
   */
  fireRateBonus = 0

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

  /** 지휘 보정까지 반영된 실제 초당 발사 횟수. */
  get effectiveFireRate(): number {
    return this.stats.fireRate * (1 + this.fireRateBonus)
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
    // 지휘 기물(기고)은 적을 겨누지 않는다. 사거리 0으로 눌러 두는 것보다
    // 여기서 끊는 편이 의도가 분명하고, 타겟 탐색 비용도 아낀다.
    if (this.stats.auraFireRate > 0) return null

    if (this.cooldown > 0) this.cooldown -= dt
    if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - dt * 6)

    const target = this.selectTarget(enemies, tileSize)
    if (!target) return null

    // 사격 여부와 무관하게 포신은 대상을 따라간다.
    this.turretAngle = Math.atan2(target.pos.y - this.pos.y, target.pos.x - this.pos.x)

    if (this.cooldown > 0) return null
    this.cooldown = 1 / this.effectiveFireRate
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
      cavalrySlow: stats.cavalrySlow,
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

    // 감속이 본업이고 단일 대상으로 거는 기물(거마작)은 **감속이 넉넉히
    // 남은 적을 다시 쏘지 않는다.** 감속은 중첩되지 않아 같은 적을 또 맞혀 봐야
    // 남은 지속만 갱신될 뿐인데, 「선두」 우선순위와 겹치면 맨 앞 하나만 계속
    // 다시 묶느라 옆으로 지나가는 적을 통째로 놓친다.
    //
    // 다만 기준을 "안 걸린 적"으로 잡으면 반대로 망가진다 — 모두가 한 번씩만
    // 걸리고, 지속이 끝날 즈음 거마작은 이미 다른 적을 보고 있어 **아무도
    // 계속 묶여 있지 않게 된다.** 오래 붙잡아야 하는 판(정묘호란)에서 조합
    // 빌드가 그것 때문에 무너졌다. 그래서 기준은 "곧 풀릴 적"이다 —
    // 남은 감속이 지속의 40% 아래로 떨어진 적을 우선한다. 새로 들어온 적은
    // 남은 시간이 0이라 자연히 여기 포함된다.
    const spreadSlow = this.stats.slowAmount > 0 && this.stats.splashRadius === 0
    const staleAt = this.stats.slowDuration * 0.4
    let sawFreshTarget = false

    for (const enemy of enemies) {
      if (!enemy.alive) continue
      if (enemy.flyingBlocked(this.def.targetsAir)) continue
      // 아직 경로에 진입하지 않은(스폰 대기 중인) 적은 제외
      if (enemy.distance < 0) continue

      const dSq = dist2(this.pos, enemy.pos)
      if (dSq > rangeSq) continue

      // 감속이 곧 풀릴 적이 사거리 안에 하나라도 있으면 그쪽만 고른다.
      // 하나도 없으면 아래 조건이 계속 거짓이라 평소대로 고르게 된다.
      if (spreadSlow) {
        const stale = enemy.slowRemaining < staleAt
        if (stale && !sawFreshTarget) {
          sawFreshTarget = true
          best = null
        }
        if (sawFreshTarget && !stale) continue
      }

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
