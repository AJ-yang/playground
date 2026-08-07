import type { Vec2 } from '../core/vec2'
import type { EnemyDef } from '../data/enemies'
import type { DamageType } from './types'
import type { Path } from './Path'

/**
 * 적 개체.
 *
 * 자기가 달리는 경로를 직접 들고 있다. 맵에 경로가 여러 개가 되면서 "이 적이
 * 어느 길로 가는가"를 호출부마다 넘겨주는 방식은 인자만 늘고 실수하기 쉬웠다.
 *
 * 위치는 경로 상의 진행도(distance) 하나로 관리하고, 픽셀 좌표는 매 스텝
 * Path에서 파생시킨다. 상태 이상(감속·중독)은 모두 "가장 강한 것 하나만 적용"
 * 하는 방식이라, 같은 종류의 타워를 겹쳐 지어도 효과가 무한히 쌓이지 않는다.
 */
export class Enemy {
  readonly id: number
  readonly def: EnemyDef
  readonly path: Path
  hp: number
  /** 경로를 따라 진행한 거리 (픽셀) */
  distance: number
  pos: Vec2
  alive = true
  /** 목표 지점에 도달해 생명을 깎았는가 */
  leaked = false
  /** 중독으로 죽었는가 — 처치 보상 처리를 구분하기 위해 */
  killedByPoison = false

  /** 현재 적용 중인 감속 배율 (1이면 감속 없음) */
  private slowFactor = 1
  private slowTimer = 0
  /** 현재 적용 중인 중독 초당 피해 */
  private poisonDps = 0
  private poisonTimer = 0
  /** 중독을 건 타워 ID. 지속 피해를 그 타워의 기여도로 정산하기 위해 필요하다. */
  poisonSourceTowerId = -1
  /** 이번 스텝에 중독으로 들어간 피해 — Game이 읽어 타워에 귀속시킨다. */
  poisonTickDamage = 0
  /** 피격 시 잠깐 밝게 번쩍이는 연출용 타이머 */
  flashTimer = 0

  /**
   * 길 폭 안에서 좌우로 밀린 정도 (픽셀). **렌더링에서만** 쓴다.
   *
   * 같은 타이밍에 나온 두 마리가 경로 위 같은 지점에 겹쳐 서면 몇 마리인지
   * 안 읽힌다. 진행 방향으로만 흩뿌리던 것을 수직 방향으로도 흩어 해결했는데,
   * `pos` 자체를 옮기면 타워 사거리 판정이 바뀌어 밸런스가 흔들린다.
   * 그래서 시뮬레이션은 여전히 경로 중심선 하나로 돌고, 그림만 밀린다.
   */
  readonly lateral: number

  /**
   * 난이도 체력 배율. 정의값(`def.maxHp`)이 아니라 **이 값을 곱한 것**이
   * 실제 최대 체력이다. 데이터는 그대로 두고 판마다 스케일만 바꾸는 구조라,
   * 밸런스 표를 난이도별로 복제하지 않아도 된다.
   */
  readonly maxHp: number

  constructor(
    id: number,
    def: EnemyDef,
    path: Path,
    spawnOffset = 0,
    lateral = 0,
    hpScale = 1,
  ) {
    this.id = id
    this.def = def
    this.path = path
    this.maxHp = def.maxHp * hpScale
    this.hp = this.maxHp
    this.distance = -spawnOffset
    this.lateral = lateral
    this.pos = path.positionAt(0)
  }

  get hpRatio(): number {
    return Math.max(0, this.hp / this.maxHp)
  }

  get isSlowed(): boolean {
    return this.slowTimer > 0
  }

  get isPoisoned(): boolean {
    return this.poisonTimer > 0
  }

  /**
   * 왕성까지 남은 거리.
   *
   * 선두/후미 타겟팅의 기준이다. 경로가 여러 개면 길이가 서로 다르므로
   * 진행 거리(distance)를 그대로 비교하면 짧은 경로의 적이 항상 뒤처진
   * 것처럼 보인다. "얼마나 남았는가"로 비교해야 맵이 몇 갈래든 의미가 같다.
   */
  get remaining(): number {
    return this.path.totalLength - this.distance
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

  /** 중독 적용. 감속과 같은 규칙 — 더 센 것만 덮어쓰고, 약한 것은 지속만 늘린다. */
  applyPoison(dps: number, duration: number, sourceTowerId = -1): void {
    if (dps <= 0 || duration <= 0) return
    if (dps > this.poisonDps) {
      this.poisonDps = dps
      this.poisonTimer = duration
      this.poisonSourceTowerId = sourceTowerId
    } else {
      this.poisonTimer = Math.max(this.poisonTimer, duration)
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

  update(dt: number, tileSize: number): void {
    if (this.slowTimer > 0) this.slowTimer -= dt
    if (this.flashTimer > 0) this.flashTimer -= dt

    // 중독은 순수 피해라 장갑·마법저항을 통과한다.
    this.poisonTickDamage = 0
    if (this.poisonTimer > 0) {
      this.poisonTimer -= dt
      const tick = Math.min(this.hp, this.poisonDps * dt)
      this.poisonTickDamage = tick
      this.hp -= this.poisonDps * dt
      if (this.hp <= 0) {
        this.hp = 0
        this.alive = false
        this.killedByPoison = true
        return
      }
    }

    this.distance += this.currentSpeed(tileSize) * dt
    this.pos = this.path.positionAt(this.distance)

    if (this.distance >= this.path.totalLength) {
      this.leaked = true
      this.alive = false
    }
  }

  /**
   * dt초 뒤 예상 위치. 대포탑처럼 투사체가 느린 타워의 예측 사격에 쓴다.
   * 감속 지속시간까지 고려하지는 않는다 — 그 정도 오차는 광역 폭발이 흡수한다.
   */
  predictPosition(dt: number, tileSize: number): Vec2 {
    return this.path.positionAt(this.distance + this.currentSpeed(tileSize) * dt)
  }
}
