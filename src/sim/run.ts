import { TOTAL_WAVES, WAVES } from '../data/waves'
import { TOWER_DEFS } from '../data/towers'
import { ENEMY_DEFS, getEnemyDef } from '../data/enemies'
import { LEVEL_ONE } from '../data/levels'
import { aggregate, simulate, type Aggregate, type SimResult } from './headless'
import { STRATEGIES, findStrategy, type Strategy } from './strategies'

/**
 * 밸런스 검증 러너.
 *
 * 사용법:
 *   npm run sim                 전략 전체를 기본 시드 수만큼 돌린다
 *   npm run sim -- --runs 50    시드 수 지정
 *   npm run sim -- --only balanced,adaptive
 *   npm run sim -- --markdown   docs/BALANCE.md에 붙일 수 있는 표로 출력
 */

interface Options {
  runs: number
  only: string[] | null
  markdown: boolean
  audit: boolean
  /** 수입(현상금·클리어 보상) 전역 배율. 경제 곡선을 스윕할 때 쓰는 튜닝 노브. */
  income: number
}

function parseArgs(argv: string[]): Options {
  const opts: Options = { runs: 30, only: null, markdown: false, audit: false, income: 1 }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--runs' && argv[i + 1]) opts.runs = Number(argv[++i])
    else if (arg === '--only' && argv[i + 1]) opts.only = argv[++i]!.split(',')
    else if (arg === '--markdown') opts.markdown = true
    else if (arg === '--audit') opts.audit = true
    else if (arg === '--income' && argv[i + 1]) opts.income = Number(argv[++i])
  }
  return opts
}

/**
 * 시뮬레이션 없이 데이터 파일만 읽어 웨이브별 압박과 수입을 뽑는다.
 * "적이 얼마나 세지는가"와 "골드가 얼마나 들어오는가"를 나란히 놓고 봐야
 * 경제 곡선이 난이도 곡선을 따라가는지 판단할 수 있다.
 */
function audit(): void {
  console.log('| W | 적 수 | 총 HP | 현상금 | 클리어 보상 | 누적 수입 | 최대 장갑 | 최대 마저 | 공중 비율 |')
  console.log('|---|---|---|---|---|---|---|---|---|')

  let cumulative = 0
  let totalHp = 0
  let totalBounty = 0
  let totalReward = 0

  for (const wave of WAVES) {
    let count = 0
    let hp = 0
    let bounty = 0
    let maxArmor = 0
    let maxResist = 0
    let flyingHp = 0

    for (const group of wave.groups) {
      const def = getEnemyDef(group.enemy)
      count += group.count
      hp += def.maxHp * group.count
      bounty += def.bounty * group.count
      maxArmor = Math.max(maxArmor, def.armor)
      maxResist = Math.max(maxResist, def.magicResist)
      if (def.flying) flyingHp += def.maxHp * group.count
    }

    cumulative += bounty + wave.reward
    totalHp += hp
    totalBounty += bounty
    totalReward += wave.reward

    console.log(
      `| ${wave.id} | ${count} | ${hp.toLocaleString()} | ${bounty} | ${wave.reward} | ` +
        `${cumulative.toLocaleString()} | ${maxArmor} | ${pct(maxResist)} | ${pct(hp === 0 ? 0 : flyingHp / hp)} |`,
    )
  }

  console.log(
    `\n총 적 HP ${totalHp.toLocaleString()} · 현상금 합 ${totalBounty.toLocaleString()}G · ` +
      `클리어 보상 합 ${totalReward.toLocaleString()}G · 시작 골드 ${LEVEL_ONE.startGold}G`,
  )
  console.log(`이론상 최대 수입 ${(totalBounty + totalReward + LEVEL_ONE.startGold).toLocaleString()}G (조기 소환 보너스 제외)`)

  console.log('\n── 타워 만렙까지의 총 투자 ──')
  for (const id of Object.keys(TOWER_DEFS)) {
    const def = TOWER_DEFS[id]!
    const total = def.levels.reduce((sum, l) => sum + l.cost, 0)
    const l3 = def.levels[2]!
    console.log(
      `${def.name.padEnd(6)} ${String(total).padStart(4)}G · 만렙 DPS ${(l3.damage * l3.fireRate).toFixed(1)}` +
        `${l3.splashRadius > 0 ? ` (광역 ${l3.splashRadius}칸)` : ''}`,
    )
  }
}

/**
 * 수입 배율을 데이터에 직접 적용한다.
 *
 * 밸런스에서 가장 민감한 축이 "총 수입 대비 타워 원가"인데, 이걸 손으로
 * 여러 번 고쳐가며 재는 것은 느리고 실수하기 쉽다. 배율 하나로 스윕해서
 * 목표 구간을 찾은 뒤, 확정된 값만 데이터 파일에 반영하는 순서로 쓴다.
 */
function applyIncomeMultiplier(mult: number): void {
  if (mult === 1) return
  for (const def of Object.values(ENEMY_DEFS)) {
    def.bounty = Math.max(1, Math.round(def.bounty * mult))
  }
  for (const wave of WAVES) {
    wave.reward = Math.max(5, Math.round((wave.reward * mult) / 5) * 5)
  }
}

/** 시드는 고정 규칙으로 만든다 — 같은 명령이면 항상 같은 결과가 나오도록. */
function seedFor(index: number): number {
  return 0x1000 + index * 7919
}

function pct(x: number): string {
  return `${(x * 100).toFixed(0)}%`
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2))
  applyIncomeMultiplier(opts.income)
  if (opts.audit) {
    audit()
    return
  }
  const targets = opts.only
    ? opts.only.map((id) => findStrategy(id)).filter((s): s is Strategy => Boolean(s))
    : STRATEGIES

  if (targets.length === 0) {
    console.error('실행할 전략이 없습니다. --only 값을 확인하세요.')
    process.exit(1)
  }

  const started = Date.now()
  const aggregates: Aggregate[] = []
  const allResults: SimResult[] = []

  for (const strategy of targets) {
    const results: SimResult[] = []
    for (let i = 0; i < opts.runs; i++) results.push(simulate(strategy, seedFor(i)))
    allResults.push(...results)
    const agg = aggregate(strategy, results)
    aggregates.push(agg)
    if (!opts.markdown) {
      console.log(
        `${agg.label.padEnd(24)} 클리어율 ${pct(agg.victoryRate).padStart(4)} · ` +
          `평균 ${agg.avgWavesCleared.toFixed(1)}웨이브 (±${agg.stdWavesCleared.toFixed(1)}, ` +
          `${agg.minWavesCleared}~${agg.maxWavesCleared}) · 남은 생명 ${agg.avgLivesLeft.toFixed(1)}`,
      )
    }
  }

  if (opts.markdown) printMarkdown(aggregates, opts.runs)
  else printDetail(aggregates)

  const timeouts = allResults.filter((r) => r.timedOut).length
  if (timeouts > 0) console.error(`\n⚠ 시간 초과로 중단된 판 ${timeouts}개 — 시뮬레이터 버그 가능성`)
  console.error(`\n${targets.length}개 전략 × ${opts.runs}판 = ${allResults.length}판, ${((Date.now() - started) / 1000).toFixed(1)}초`)
}

function printDetail(aggregates: readonly Aggregate[]): void {
  console.log('\n── 타워 종류별 누적 딜 점유율 ──')
  const ids = Object.keys(TOWER_DEFS)
  for (const agg of aggregates) {
    const parts = ids
      .map((id) => {
        const share = agg.avgDamageShare[id] ?? 0
        const count = agg.avgTowerMix[id] ?? 0
        return count > 0 ? `${TOWER_DEFS[id]!.name} ${pct(share)}(${count.toFixed(1)}기)` : null
      })
      .filter(Boolean)
    console.log(`${agg.label.padEnd(24)} ${parts.join(' · ')}`)
  }

  console.log('\n── 경제 · 첫 유출 ──')
  for (const agg of aggregates) {
    console.log(
      `${agg.label.padEnd(24)} 누적 획득 ${Math.round(agg.avgGoldEarned).toString().padStart(5)}G · ` +
        `타워 ${agg.avgTowers.toFixed(1)}기 · ` +
        `첫 유출 ${agg.medianFirstLeakWave === null ? '없음' : `W${agg.medianFirstLeakWave}`}`,
    )
  }
}

function printMarkdown(aggregates: readonly Aggregate[], runs: number): void {
  console.log(`\n각 전략 ${runs}판 (고정 시드), 총 ${TOTAL_WAVES}웨이브\n`)
  console.log('| 전략 | 클리어율 | 평균 클리어 웨이브 | 최소~최대 | 남은 생명 | 첫 유출 |')
  console.log('|---|---|---|---|---|---|')
  for (const a of aggregates) {
    console.log(
      `| ${a.label} | ${pct(a.victoryRate)} | ${a.avgWavesCleared.toFixed(1)} ± ${a.stdWavesCleared.toFixed(1)} | ` +
        `${a.minWavesCleared}~${a.maxWavesCleared} | ${a.avgLivesLeft.toFixed(1)} | ` +
        `${a.medianFirstLeakWave === null ? '없음' : `W${a.medianFirstLeakWave}`} |`,
    )
  }

  console.log('\n| 전략 | 궁수 | 마법 | 대포 | 얼음 |')
  console.log('|---|---|---|---|---|')
  for (const a of aggregates) {
    const cell = (id: string) => {
      const count = a.avgTowerMix[id] ?? 0
      if (count === 0) return '—'
      return `${pct(a.avgDamageShare[id] ?? 0)} / ${count.toFixed(1)}기`
    }
    console.log(`| ${a.label} | ${cell('archer')} | ${cell('mage')} | ${cell('cannon')} | ${cell('frost')} |`)
  }
  console.log('\n> 각 칸은 `누적 딜 점유율 / 평균 건설 수`')
}

main()
