import { buildCost, TOWER_ORDER, getTowerDef } from '../data/towers'
import { getEnemyDef } from '../data/enemies'
import type { Game } from '../game/Game'
import type { Tower } from '../game/Tower'
import { pickSpot, type Spot } from './coverage'

/**
 * 시뮬레이션용 플레이어 AI.
 *
 * 사람의 손맛을 흉내 내려는 것이 아니라, **빌드 방침 하나만 다르게 두고
 * 나머지 조건을 똑같이 맞춘 대조 실험**을 하기 위한 것이다. 그래야
 * "궁수대 몰빵은 막히고 조합은 통한다"는 설계 의도가 실제로 성립하는지
 * 수치로 확인할 수 있다.
 */
export interface Strategy {
  id: string
  label: string
  /** 다음에 지을 타워를 고른다. null이면 더 짓지 않는다. */
  nextTower(game: Game): string | null
  /** 타워 총 개수 상한 — 이보다 많아지면 업그레이드에만 투자한다 */
  buildUntil: number
  /** true면 건설보다 업그레이드를 먼저 시도한다 */
  upgradeFirst: boolean
  /** true면 준비 시간을 기다리지 않고 즉시 다음 웨이브를 부른다 */
  earlyCall: boolean
}

/** 고정 순환 빌드 — 정해진 순서대로 타워를 돌려 짓는다. */
function cycleStrategy(opts: {
  id: string
  label: string
  cycle: string[]
  buildUntil?: number
  upgradeFirst?: boolean
  earlyCall?: boolean
}): Strategy {
  return {
    id: opts.id,
    label: opts.label,
    buildUntil: opts.buildUntil ?? 14,
    upgradeFirst: opts.upgradeFirst ?? false,
    earlyCall: opts.earlyCall ?? false,
    nextTower(game) {
      return opts.cycle[game.towers.length % opts.cycle.length] ?? null
    },
  }
}

/**
 * 다가오는 웨이브의 방어 속성을 보고 카운터를 고르는 전략.
 *
 * 게임이 "의도한 대로 플레이했을 때"의 상한선을 재기 위한 기준선이다.
 * 이것산개 클리어하지 못하면 밸런스가 너무 빡빡하다는 뜻이고,
 * 몰빵 전략과 차이가 없으면 상성 설계가 작동하지 않는다는 뜻이다.
 */
function adaptiveStrategy(maxFrost: number, earlyCall: boolean): Strategy {
  return {
    id: maxFrost === 0 ? 'adaptive-frost0' : `adaptive-frost${maxFrost}`,
    label: `적응형 · 거마작 ${maxFrost}기`,
    buildUntil: 14,
    upgradeFirst: false,
    earlyCall,
    nextTower(game) {
      const wave = game.waves.currentWave
      let total = 0
      let flying = 0
      let armorWeighted = 0
      let resistWeighted = 0
      let fastWeighted = 0

      for (const group of wave.groups) {
        const def = getEnemyDef(group.enemy)
        // HP 비중으로 가중 — 잡몹 20마리보다 탱커 3마리가 방어 판단에 더 중요하다
        const weight = group.count * def.maxHp
        total += weight
        if (def.flying) flying += weight
        armorWeighted += def.armor * weight
        resistWeighted += def.magicResist * weight
        if (def.speed >= 3) fastWeighted += weight
      }
      if (total === 0) return 'archer'

      const flyShare = flying / total
      const avgArmor = armorWeighted / total
      const avgResist = resistWeighted / total
      const fastShare = fastWeighted / total

      const counts = new Map<string, number>()
      for (const t of game.towers) counts.set(t.def.id, (counts.get(t.def.id) ?? 0) + 1)
      const have = (id: string) => counts.get(id) ?? 0

      // 기반 화력이 없으면 상성을 따질 여유가 없다. 가장 싼 궁수대부터 깐다.
      if (game.towers.length < 3) return 'archer'

      // 양면 저항이 두꺼우면 순수 피해(중독)가 유일한 답이다.
      if (
        game.canUse('venom') &&
        game.towers.length >= 6 &&
        avgArmor >= 5 &&
        avgResist >= 0.3 &&
        have('venom') < 2
      ) {
        return 'venom'
      }

      // 감속은 고속 적이나 물량 웨이브에서 다른 타워의 체류 시간을 벌어준다.
      // 몇 기가 적정인지는 이 상한만 바꿔가며 대조 실험으로 확인한다.
      if (game.canUse('frost') && maxFrost > 0 && (fastShare > 0.25 || game.waves.waveNumber >= 5)) {
        const wantFrost = Math.min(maxFrost, 1 + Math.floor(game.waves.waveNumber / 8))
        if (have('frost') < wantFrost) return 'frost'
      }

      // 갑주이 두꺼우면 물리가 죽는다 → 총통
      if (avgArmor >= 6 && have('mage') < have('archer') + 2) return 'mage'
      // 화약 저항이 높으면 마법이 죽는다 → 활·화차 (공중이 없으면 화차가 효율적)
      if (avgResist >= 0.4) {
        if (flyShare < 0.2 && have('cannon') < 3 && game.towers.length >= 5) return 'cannon'
        return 'archer'
      }
      // 공중이 많으면 화차는 의미가 없다
      if (flyShare > 0.35) return have('mage') <= have('archer') ? 'mage' : 'archer'
      // 특이사항 없으면 지상 물량 정리용 징을 섞는다
      if (have('cannon') < 2 && flyShare < 0.15 && game.towers.length >= 5) return 'cannon'
      return have('archer') <= have('mage') ? 'archer' : 'mage'
    },
  }
}

export const STRATEGIES: Strategy[] = [
  cycleStrategy({ id: 'archer-only', label: '궁수대 몰빵', cycle: ['archer'] }),
  cycleStrategy({ id: 'mage-only', label: '총통 몰빵', cycle: ['mage'] }),
  cycleStrategy({ id: 'cannon-only', label: '화차 몰빵', cycle: ['cannon'] }),
  cycleStrategy({ id: 'frost-only', label: '거마작 몰빵 (대조군)', cycle: ['frost'] }),
  cycleStrategy({
    id: 'balanced-no-frost',
    label: '균형 (궁수대·총통·화차)',
    cycle: ['archer', 'mage', 'cannon'],
  }),
  cycleStrategy({
    id: 'balanced',
    label: '균형 + 거마작',
    cycle: ['archer', 'mage', 'cannon', 'archer', 'mage', 'frost'],
  }),
  // 거마작 투자량 대조군 — "서포터가 실제로 값을 하는가, 몇 기가 적정인가"
  adaptiveStrategy(0, false),
  adaptiveStrategy(1, false),
  adaptiveStrategy(2, false),
  adaptiveStrategy(3, false),
  // 투자 성향 대조군 — 넓히기 vs 키우기
  cycleStrategy({
    id: 'wide',
    label: '넓히기 우선 (건설 20기)',
    cycle: ['archer', 'mage', 'cannon', 'frost'],
    buildUntil: 20,
  }),
  cycleStrategy({
    id: 'tall',
    label: '키우기 우선 (6기 만렙)',
    cycle: ['archer', 'mage', 'cannon', 'frost'],
    buildUntil: 6,
    upgradeFirst: true,
  }),
  // 조기 소환 보너스 대조군
  { ...adaptiveStrategy(2, true), id: 'adaptive-early', label: '적응형 · 거마작 2기 + 조기 소환' },
]

export function findStrategy(id: string): Strategy | undefined {
  return STRATEGIES.find((s) => s.id === id)
}

/**
 * 전략의 한 번의 판단. 더 이상 살 것이 없을 때까지 골드를 소진한다.
 * @returns 무언가 구매했으면 true
 */
export function act(game: Game, strategy: Strategy, spots: readonly Spot[]): boolean {
  let acted = false
  // 한 틱에 무한히 도는 것을 막는 안전장치 (자리도 골드도 유한하므로 실제로는 금방 끝난다)
  for (let guard = 0; guard < 40; guard++) {
    if (strategy.upgradeFirst && tryUpgrade(game, spots)) {
      acted = true
      continue
    }
    if (tryBuild(game, strategy, spots)) {
      acted = true
      continue
    }
    if (!strategy.upgradeFirst && tryUpgrade(game, spots)) {
      acted = true
      continue
    }
    break
  }
  return acted
}

function tryBuild(game: Game, strategy: Strategy, spots: readonly Spot[]): boolean {
  if (game.towers.length >= strategy.buildUntil) return false

  let towerId = strategy.nextTower(game)
  if (!towerId || !TOWER_ORDER.includes(towerId)) return false
  // 아직 해금되지 않은 타워를 고르면 쓸 수 있는 것 중 가장 싼 것으로 대체한다.
  // 전략을 스테이지마다 새로 쓰는 대신 이렇게 눌러야 대조 실험이 성립한다.
  if (!game.canUse(towerId)) {
    const fallback = [...game.availableTowers].sort((a, b) => buildCost(a) - buildCost(b))[0]
    if (!fallback) return false
    towerId = fallback
  }
  if (game.gold < buildCost(towerId)) return false

  // 거마작는 감속이 뒤쪽 타워 전부에 이득이 되므로 경로 앞쪽에 놓는다.
  const preferEarly = getTowerDef(towerId).levels[0].slowAmount > 0
  const spot = pickSpot(game, spots, preferEarly)
  if (!spot) return false

  return game.tryBuild(towerId, spot.col, spot.row).ok
}

/** 커버리지가 가장 좋은 타워부터 올린다 — 같은 골드로 가장 많은 사격 기회를 산다. */
function tryUpgrade(game: Game, spots: readonly Spot[]): boolean {
  const coverageOf = new Map<string, number>()
  for (const s of spots) coverageOf.set(`${s.col},${s.row}`, s.coverage)

  let best: Tower | null = null
  let bestScore = -1
  for (const tower of game.towers) {
    if (tower.isMaxLevel) continue
    if (game.gold < tower.upgradeCost!) continue
    const score = coverageOf.get(`${tower.col},${tower.row}`) ?? 0
    if (score > bestScore) {
      best = tower
      bestScore = score
    }
  }
  if (!best) return false
  return game.upgradeTower(best).ok
}
