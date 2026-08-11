import { TOWER_DEFS } from '../data/towers'
import { ENEMY_DEFS, getEnemyDef } from '../data/enemies'
import { STAGES, type StageDef } from '../data/stages'
import { getDifficulty } from '../data/difficulty'
import { aggregate, seedFor, simulate, towersAtStage, type Aggregate, type SimResult } from './headless'
import { STRATEGIES, findStrategy, type Strategy } from './strategies'
import { runGate } from './gate'

/**
 * 밸런스 검증 러너.
 *
 * 사용법:
 *   npm run sim                      전체 스테이지 × 전체 전략
 *   npm run sim -- --stage fork      특정 스테이지만
 *   npm run sim -- --runs 50         시드 수 지정
 *   npm run sim -- --only balanced,adaptive-frost1
 *   npm run sim -- --difficulty hard   난이도별 검증 (적 HP 배율의 별칭)
 *   npm run sim -- --markdown        docs/BALANCE.md에 붙일 표로 출력
 *   npm run sim -- --audit           스테이지별 압박·수입 곡선 (시뮬레이션 없이)
 *   npm run sim -- --gate            밸런스 회귀 게이트 (CI용, 어긋나면 종료 코드 1)
 *   npm run sim -- --income 1.3      수입 전역 배율 스윕 (튜닝용)
 */

interface Options {
  runs: number
  only: string[] | null
  stages: string[] | null
  markdown: boolean
  audit: boolean
  /** 설계 의도가 유지되는지만 보고 어긋나면 종료 코드 1. CI가 부르는 모드다. */
  gate: boolean
  /** 수입(현상금·클리어 보상) 전역 배율. 경제 곡선을 스윕할 때 쓰는 튜닝 노브. */
  income: number
  /** 적 HP 전역 배율. 압박 곡선을 스윕할 때 쓰는 튜닝 노브. */
  hp: number
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    runs: 20,
    only: null,
    stages: null,
    markdown: false,
    audit: false,
    gate: false,
    income: 1,
    hp: 1,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--runs' && argv[i + 1]) opts.runs = Number(argv[++i])
    else if (arg === '--only' && argv[i + 1]) opts.only = argv[++i]!.split(',')
    else if (arg === '--stage' && argv[i + 1]) opts.stages = argv[++i]!.split(',')
    else if (arg === '--markdown') opts.markdown = true
    else if (arg === '--audit') opts.audit = true
    else if (arg === '--gate') opts.gate = true
    else if (arg === '--income' && argv[i + 1]) opts.income = Number(argv[++i])
    else if (arg === '--hp' && argv[i + 1]) opts.hp = Number(argv[++i])
    // 난이도는 결국 적 HP 배율 하나이므로 --hp의 별칭으로 둔다.
    // 이름으로 부를 수 있으면 "어려움에서도 조합 빌드가 클리어되는가"를
    // 게임과 같은 어휘로 물어볼 수 있다.
    else if (arg === '--difficulty' && argv[i + 1]) opts.hp = getDifficulty(argv[++i]!).hpScale
  }
  return opts
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
  for (const stage of STAGES) {
    for (const wave of stage.waves) {
      wave.reward = Math.max(5, Math.round((wave.reward * mult) / 5) * 5)
    }
  }
}

/** 적 HP 배율. 수입과 짝을 이루는 반대쪽 튜닝 축이다. */
function applyHpMultiplier(mult: number): void {
  if (mult === 1) return
  for (const def of Object.values(ENEMY_DEFS)) {
    def.maxHp = Math.max(1, Math.round(def.maxHp * mult))
  }
}

function pct(x: number): string {
  return `${(x * 100).toFixed(0)}%`
}

/** 시뮬레이션 없이 데이터만 읽어 스테이지별 압박과 수입을 뽑는다. */
function audit(): void {
  for (const stage of STAGES) {
    const towers = towersAtStage(stage)
    console.log(`\n## S${stage.index} ${stage.name}`)
    console.log(
      `맵 ${stage.level.name} · 경로 ${stage.level.routes.length}갈래 · ` +
        `시작 ${stage.startGold}G / 생명 ${stage.startLives} · ` +
        `사용 가능 ${towers.map((t) => TOWER_DEFS[t]!.name).join('·')}` +
        `${stage.unlocksTowers.length ? ` → 클리어 시 ${stage.unlocksTowers.map((id) => TOWER_DEFS[id]!.name).join('·')} 해금` : ''}`,
    )
    console.log('| W | 적 수 | 총 HP | 현상금 | 보상 | 누적 수입 | 최대 갑주 | 최대 산개 | 공중 |')
    console.log('|---|---|---|---|---|---|---|---|---|')

    let cumulative = stage.startGold
    let totalHp = 0
    for (const wave of stage.waves) {
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
      console.log(
        `| ${wave.id} | ${count} | ${hp.toLocaleString()} | ${bounty} | ${wave.reward} | ` +
          `${cumulative.toLocaleString()} | ${maxArmor} | ${pct(maxResist)} | ` +
          `${pct(hp === 0 ? 0 : flyingHp / hp)} |`,
      )
    }
    console.log(`총 적 HP ${totalHp.toLocaleString()} · 이론상 최대 수입 ${cumulative.toLocaleString()}G`)
  }

  console.log('\n## 타워 만렙까지의 총 투자')
  for (const id of Object.keys(TOWER_DEFS)) {
    const def = TOWER_DEFS[id]!
    const total = def.levels.reduce((sum, l) => sum + l.cost, 0)
    const l3 = def.levels[2]!
    const extras = [
      l3.splashRadius > 0 ? `광역 ${l3.splashRadius}칸` : null,
      l3.slowAmount > 0 ? `감속 ${pct(l3.slowAmount)}/${l3.slowDuration}s` : null,
      l3.poisonDps > 0 ? `중독 ${l3.poisonDps}/s × ${l3.poisonDuration}s` : null,
    ].filter(Boolean)
    console.log(
      `${def.name.padEnd(7)} ${String(total).padStart(4)}G · 만렙 직접 DPS ${(l3.damage * l3.fireRate).toFixed(1)}` +
        `${extras.length ? ` (${extras.join(' · ')})` : ''}`,
    )
  }
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2))
  applyIncomeMultiplier(opts.income)
  applyHpMultiplier(opts.hp)
  if (opts.audit) {
    audit()
    return
  }
  if (opts.gate) {
    process.exit(runGate())
  }

  const stages = opts.stages
    ? STAGES.filter((s) => opts.stages!.includes(s.id))
    : STAGES
  const strategies = opts.only
    ? opts.only.map((id) => findStrategy(id)).filter((s): s is Strategy => Boolean(s))
    : STRATEGIES

  if (stages.length === 0 || strategies.length === 0) {
    console.error('실행할 스테이지 또는 전략이 없습니다. --stage / --only 값을 확인하세요.')
    process.exit(1)
  }

  const started = Date.now()
  const all: SimResult[] = []

  for (const stage of stages) {
    const towers = towersAtStage(stage)
    const aggregates: Aggregate[] = []

    for (const strategy of strategies) {
      const results: SimResult[] = []
      for (let i = 0; i < opts.runs; i++) {
        results.push(simulate(strategy, seedFor(i), stage, towers))
      }
      all.push(...results)
      aggregates.push(aggregate(strategy, results))
    }

    printStage(stage, towers, aggregates, opts)
  }

  const timeouts = all.filter((r) => r.timedOut).length
  if (timeouts > 0) console.error(`\n⚠ 시간 초과로 중단된 판 ${timeouts}개 — 시뮬레이터 버그 가능성`)
  console.error(
    `\n${stages.length}개 스테이지 × ${strategies.length}개 전략 × ${opts.runs}판 = ${all.length}판, ` +
      `${((Date.now() - started) / 1000).toFixed(1)}초`,
  )
}

function printStage(
  stage: StageDef,
  towers: readonly string[],
  aggregates: readonly Aggregate[],
  opts: Options,
): void {
  const towerNames = towers.map((t) => TOWER_DEFS[t]!.name).join('·')
  const waveCount = stage.waves.length

  if (opts.markdown) {
    console.log(`\n### S${stage.index} ${stage.name} — ${waveCount}웨이브 · 사용 가능 ${towerNames}\n`)
    console.log('| 전략 | 클리어율 | 평균 클리어 웨이브 | 최소~최대 | 남은 생명 | 첫 유출 |')
    console.log('|---|---|---|---|---|---|')
    for (const a of aggregates) {
      console.log(
        `| ${a.label} | ${pct(a.victoryRate)} | ${a.avgWavesCleared.toFixed(1)} ± ${a.stdWavesCleared.toFixed(1)} | ` +
          `${a.minWavesCleared}~${a.maxWavesCleared} | ${a.avgLivesLeft.toFixed(1)} | ` +
          `${a.medianFirstLeakWave === null ? '없음' : `W${a.medianFirstLeakWave}`} |`,
      )
    }
    return
  }

  console.log(`\n━━ S${stage.index} ${stage.name} (${waveCount}웨이브 · ${towerNames}) ━━`)
  for (const a of aggregates) {
    console.log(
      `${a.label.padEnd(24)} 클리어율 ${pct(a.victoryRate).padStart(4)} · ` +
        `평균 ${a.avgWavesCleared.toFixed(1)}웨이브 (±${a.stdWavesCleared.toFixed(1)}, ` +
        `${a.minWavesCleared}~${a.maxWavesCleared}) · 생명 ${a.avgLivesLeft.toFixed(1)} · ` +
        `타워 ${a.avgTowers.toFixed(1)}기 · 획득 ${Math.round(a.avgGoldEarned)}G`,
    )
    const mix = Object.keys(TOWER_DEFS)
      .filter((id) => (a.avgTowerMix[id] ?? 0) > 0)
      .map((id) => `${TOWER_DEFS[id]!.name} ${pct(a.avgDamageShare[id] ?? 0)}(${a.avgTowerMix[id]!.toFixed(1)})`)
      .join(' · ')
    if (mix) console.log(`${''.padEnd(24)}   ${mix}`)
  }
}

main()
