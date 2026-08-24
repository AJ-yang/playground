/**
 * 밸런스 회귀 게이트.
 *
 * 이 저장소에서 밸런스를 고칠 때 세 번 같은 방식으로 무너졌다. 셋 다 코드
 * 리뷰로는 안 보였고, 셋 다 시뮬레이터가 잡았다.
 *
 *   1. 거마작을 광역에서 단일 대상으로 바꾸자 S5가 100% → **8%**. 거마작을
 *      아예 안 넣은 62%보다 나빴다.
 *   2. "이미 감속된 적은 건너뛴다"는 그럴듯한 타겟팅 규칙을 넣자 S5의
 *      「여덟 종 전부」가 95% → **17%**.
 *   3. 그 전에도 몰빵 빌드가 무손실로 클리어되던 시기가 있었다.
 *
 * 공통점은 **"기물을 더 지었는데 더 나빠진다"** 는 것이다. 수치를 하나 바꿀
 * 때마다 사람이 시뮬레이터를 돌려야 한다는 게 지금 구조의 위험이라, 그
 * 판단을 자동으로 하게 만든다.
 *
 * 시뮬레이터는 시드가 고정된 결정적 구조라 같은 명령이면 같은 숫자가 나온다.
 * 그래서 통계적 여유가 아니라 **경계값으로** 검사할 수 있다. 다만 임계 부근에서
 * 결과가 비단조적이라 (BALANCE.md 13장) 경계는 측정값에 여유를 두고 잡는다.
 *
 * 규칙은 "지금 숫자"가 아니라 **설계 의도**를 적는다. 의도가 깨질 때만 실패해야
 * 튜닝할 때마다 게이트를 고치는 일이 안 생긴다.
 *
 *   npm run balance
 */

import { STAGES, type StageDef } from '../data/stages'
import { TOWER_DEFS, type TowerDef } from '../data/towers'
import { aggregate, seedFor, simulate, towersAtStage } from './headless'
import { STRATEGIES, findStrategy, type Strategy } from './strategies'

/** 문서(BALANCE.md)가 20판 기준이라 같은 수를 쓴다. */
const RUNS = 20

/** 몰빵 전략은 이름 규칙으로 모은다 — 기물을 늘리면 저절로 검사 대상이 된다. */
const MONO = STRATEGIES.filter((s) => s.id.endsWith('-only')).map((s) => s.id)

/** S3~S6. 튜토리얼(S1)과 "총통 몰빵이 정답"인 S2는 규칙이 다르다. */
const LATE = ['fork', 'highlands', 'anju', 'gate']

/** S2 삼포왜란. 이 판만 몰빵 규칙이 다르다 — 아래 `MONO_NO_GUNPOWDER` 참고. */
const RAMPARTS = 'ramparts'

/**
 * S2에서 **화약을 쓰지 못하는** 몰빵.
 *
 * GDD 4.5의 설계 규칙은 "새로 열린 기물은 다음 스테이지에서 곧바로 필요해야
 * 한다"이고, S1의 보상인 총통이 그 규칙의 첫 사례다. 그래서 S2는 총통 몰빵이
 * 100%인 것이 **의도**이고(그 판의 교훈이 "갑주에는 화약"이다), 나머지 몰빵이
 * 못 넘는 것도 같은 의도의 뒷면이다. 총통만 빼고 이름 규칙으로 모으므로
 * 몰빵 전략을 늘리면 저절로 검사 대상이 된다.
 */
const MONO_NO_GUNPOWDER = MONO.filter((id) => id !== 'mage-only')

type Rule =
  /** 이 전략들은 이 스테이지에서 `max`를 넘으면 안 된다. */
  | { kind: 'ceiling'; what: string; stages: string[]; strategies: string[]; max: number }
  /** 이 전략들은 이 스테이지에서 `min` 아래로 떨어지면 안 된다. */
  | { kind: 'floor'; what: string; stages: string[]; strategies: string[]; min: number }
  /** `strategy`가 `vs`보다 나빠지면 안 된다 — 종을 더해서 손해 보는 것 금지. */
  | { kind: 'notWorse'; what: string; stages: string[]; strategy: string; vs: string; slack: number }

const RULES: readonly Rule[] = [
  {
    kind: 'ceiling',
    what: '한 종만 지어서는 후반을 못 넘는다',
    stages: LATE,
    strategies: MONO,
    max: 0.1,
  },
  {
    kind: 'ceiling',
    what: 'S1이 준 총통은 S2에서 곧바로 필요하다 — 화약 없는 한 종으로는 못 넘는다',
    stages: [RAMPARTS],
    strategies: MONO_NO_GUNPOWDER,
    max: 0.1,
  },
  {
    kind: 'ceiling',
    what: '거마작은 그 자체로 이기는 기물이 아니다 (대조군)',
    stages: ['ramparts', ...LATE],
    strategies: ['frost-only'],
    max: 0.05,
  },
  {
    kind: 'floor',
    what: '조합 빌드는 후반을 넘는다',
    stages: LATE,
    strategies: ['balanced'],
    min: 0.9,
  },
  {
    kind: 'notWorse',
    what: '거마작을 더해서 손해 보지 않는다',
    stages: LATE,
    strategy: 'balanced',
    vs: 'balanced-no-frost',
    slack: 0.05,
  },
  /**
   * 아래 두 규칙은 **종류**가 아니라 **개수** 축이다.
   *
   * 이 저장소에서 밸런스가 무너진 세 번 중 첫 번째가 "거마작을 넣은 빌드가 안
   * 넣은 빌드보다 나쁘다"였는데, 그때 그 사실을 잡아낸 대조군이 적응형 · 거마작
   * N기다(BALANCE 6·8장). 위의 `balanced` 계열 규칙은 같은 성질을 「균형 순환」
   * 한 가지 빌드에서만 지키고 있어서, 배치 규칙이나 감속 수치를 만져 적응형
   * 쪽만 뒤집히면 게이트가 초록인 채로 지나간다.
   *
   * **3기는 일부러 넣지 않았다.** GDD 4.2는 감속이 중첩되지 않으므로 "1~2기가
   * 최적이고 과투자는 손해"라고 못 박는다 — 3기가 2기보다 나쁜 것은 의도된
   * 결과지 회귀가 아니다. 지켜야 하는 것은 **최적 구간(1~2기)이 실제로
   * 최적인가**뿐이다.
   */
  {
    kind: 'notWorse',
    what: 'S2가 준 거마작은 1기만 섞어도 값을 한다 (적응형 빌드)',
    stages: LATE,
    strategy: 'adaptive-frost1',
    vs: 'adaptive-frost0',
    slack: 0.05,
  },
  {
    kind: 'notWorse',
    what: '거마작 2기는 최적 구간이다 — 0기보다 나쁘면 안 된다 (적응형 빌드)',
    stages: LATE,
    strategy: 'adaptive-frost2',
    vs: 'adaptive-frost0',
    slack: 0.05,
  },
  {
    kind: 'notWorse',
    what: '여덟 종을 다 써서 손해 보지 않는다',
    stages: LATE,
    strategy: 'balanced-all7',
    vs: 'balanced-no-frost',
    slack: 0.05,
  },
]

interface Breach {
  rule: string
  detail: string
}

/**
 * 「넓히기 vs 키우기」가 실제로 선택인가 — 수치만으로 검사한다.
 *
 * GDD 3장은 매 웨이브의 결정 중 첫째로 *"업그레이드는 골드 대비 DPS가 좋고,
 * 신규 건설은 커버리지가 넓어진다"* 를 든다. 그런데 그 앞 절반이 오랫동안
 * 사실이 아니었다. 강화의 **한계** 골드당 DPS가 새 기물 1기보다 낮으면
 * 강화는 골드 효율에서도 지는 것이라, 커버리지까지 손해인 쪽이 이길 이유가
 * 하나도 없다. 실제로 그랬다 — 딜 기물 6종 중 5종이 L3에서 그랬고(포수는
 * 2.63배), 시뮬레이션에서도 「키우기 우선」이 S5·S6 클리어율 0%였다.
 *
 * 이건 판을 돌릴 필요가 없다. 표만 읽으면 나오는 산수라 게이트에서 가장 싼
 * 규칙이고, 그래서 수치를 만질 때마다 즉시 걸린다.
 *
 * **상태이상 기물(거마작·별파진·기고)은 제외한다.** 값이 딜이 아니라
 * 감속·중독·오라에 있어서 「골드당 DPS」라는 잣대 자체가 성립하지 않는다.
 * 셋 다 중첩되지 않아 성장축이 강화뿐이라는 별개의 사정도 있어서, 그쪽
 * 가격은 산수가 아니라 시뮬레이션으로 잡는다.
 */
const SUPPORT_TOWERS = new Set(['frost', 'venom', 'banner'])

/** 광역은 한 발이 여러 마리를 때리므로 반경만큼 가중한다. */
function effectiveDps(level: TowerDef['levels'][number]): number {
  return level.damage * level.fireRate * (1 + level.splashRadius)
}

function checkUpgradeCurve(): Breach[] {
  const breaches: Breach[] = []
  for (const def of Object.values(TOWER_DEFS)) {
    if (SUPPORT_TOWERS.has(def.id)) continue
    const base = effectiveDps(def.levels[0]) / def.levels[0].cost
    if (!Number.isFinite(base) || base <= 0) continue

    let prev = effectiveDps(def.levels[0])
    for (let i = 1; i < def.levels.length; i++) {
      const level = def.levels[i]!
      const gained = effectiveDps(level) - prev
      const ratio = gained / level.cost
      prev = effectiveDps(level)
      if (ratio >= base) continue
      breaches.push({
        rule: '강화가 신규 건설보다 골드 효율이 나쁘지 않다',
        detail:
          `${def.name} L${i + 1} — 한계 ${ratio.toFixed(3)} DPS/G < 새 기물 ${base.toFixed(3)} DPS/G ` +
          `(${(base / ratio).toFixed(2)}배 손해). ${level.cost}G → ` +
          `${Math.floor(gained / base)}G 이하로 낮추거나 성능을 올릴 것`,
      })
    }
  }
  return breaches
}

function stageOf(id: string): StageDef {
  const stage = STAGES.find((s) => s.id === id)
  if (!stage) throw new Error(`알 수 없는 스테이지: ${id}`)
  return stage
}

function strategyOf(id: string): Strategy {
  const strategy = findStrategy(id)
  if (!strategy) throw new Error(`알 수 없는 전략: ${id}`)
  return strategy
}

/** 규칙이 실제로 참조하는 (스테이지, 전략) 짝만 돌린다. */
function neededPairs(): Map<string, Set<string>> {
  const need = new Map<string, Set<string>>()
  const add = (stageId: string, strategyId: string) => {
    if (!need.has(stageId)) need.set(stageId, new Set())
    need.get(stageId)!.add(strategyId)
  }
  for (const rule of RULES) {
    const ids = rule.kind === 'notWorse' ? [rule.strategy, rule.vs] : rule.strategies
    for (const stageId of rule.stages) for (const id of ids) add(stageId, id)
  }
  return need
}

function pct(x: number): string {
  return `${(x * 100).toFixed(0)}%`
}

export function runGate(): number {
  const need = neededPairs()
  const rates = new Map<string, number>()
  const key = (stageId: string, strategyId: string) => `${stageId}/${strategyId}`

  let total = 0
  const started = Date.now()

  for (const [stageId, strategyIds] of need) {
    const stage = stageOf(stageId)
    const towers = towersAtStage(stage)
    for (const strategyId of strategyIds) {
      const strategy = strategyOf(strategyId)
      const results = []
      for (let i = 0; i < RUNS; i++) results.push(simulate(strategy, seedFor(i), stage, towers))
      total += RUNS
      rates.set(key(stageId, strategyId), aggregate(strategy, results).victoryRate)
    }
  }

  // 수치만 읽는 규칙이라 판을 돌리기 전에 먼저 본다.
  const breaches: Breach[] = checkUpgradeCurve()
  for (const rule of RULES) {
    for (const stageId of rule.stages) {
      const stage = stageOf(stageId)
      const where = `S${stage.index} ${stage.name}`

      if (rule.kind === 'notWorse') {
        const mine = rates.get(key(stageId, rule.strategy))!
        const base = rates.get(key(stageId, rule.vs))!
        if (mine < base - rule.slack) {
          breaches.push({
            rule: rule.what,
            detail:
              `${where} — ${strategyOf(rule.strategy).label} ${pct(mine)} < ` +
              `${strategyOf(rule.vs).label} ${pct(base)} (허용 여유 ${pct(rule.slack)})`,
          })
        }
        continue
      }

      for (const strategyId of rule.strategies) {
        const rate = rates.get(key(stageId, strategyId))!
        const bad = rule.kind === 'ceiling' ? rate > rule.max : rate < rule.min
        if (!bad) continue
        const bound = rule.kind === 'ceiling' ? `≤ ${pct(rule.max)}` : `≥ ${pct(rule.min)}`
        breaches.push({
          rule: rule.what,
          detail: `${where} — ${strategyOf(strategyId).label} ${pct(rate)} (기대 ${bound})`,
        })
      }
    }
  }

  const secs = ((Date.now() - started) / 1000).toFixed(1)
  console.log(`밸런스 게이트 — ${RULES.length + 1}개 규칙, ${total}판, ${secs}초\n`)

  const curveRule = '강화가 신규 건설보다 골드 효율이 나쁘지 않다'
  const curveHits = breaches.filter((b) => b.rule === curveRule)
  console.log(`${curveHits.length ? '✗' : '✓'} ${curveRule}`)
  for (const b of curveHits) console.log(`    ${b.detail}`)

  for (const rule of RULES) {
    const hit = breaches.filter((b) => b.rule === rule.what)
    console.log(`${hit.length ? '✗' : '✓'} ${rule.what}`)
    for (const b of hit) console.log(`    ${b.detail}`)
  }

  if (breaches.length === 0) {
    console.log('\n설계 의도가 유지되고 있습니다.')
    return 0
  }

  console.log(
    `\n${breaches.length}건이 깨졌습니다. 의도한 변경이라면 src/sim/gate.ts의 규칙을 ` +
      '먼저 고치고, 왜 바뀌었는지 docs/BALANCE.md에 남기세요.',
  )
  return 1
}
