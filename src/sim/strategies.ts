import { buildCost, TOWER_ORDER, getTowerDef } from '../data/towers'
import { getEnemyDef } from '../data/enemies'
import type { Game } from '../game/Game'
import type { Tower } from '../game/Tower'
import { pickCommandSpot, pickSpot, type SpotIndex } from './coverage'

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

      for (const group of wave.groups) {
        const def = getEnemyDef(group.enemy)
        // HP 비중으로 가중 — 잡몹 20마리보다 탱커 3마리가 방어 판단에 더 중요하다
        const weight = group.count * def.maxHp
        total += weight
        if (def.flying) flying += weight
        armorWeighted += def.armor * weight
        resistWeighted += def.magicResist * weight
      }
      if (total === 0) return 'archer'

      const flyShare = flying / total
      const avgArmor = armorWeighted / total
      const avgResist = resistWeighted / total
      // 살수는 갑주와 산개 둘 다에 깎인다. 둘 다 얇을 때만 값을 하므로
      // "맨몸 물량인가"를 한 수치로 본다 — 이 갈래가 살수를 넣은 이유 그 자체다.
      const softShare = avgArmor < 6 && avgResist < 0.25

      const counts = new Map<string, number>()
      for (const t of game.towers) counts.set(t.def.id, (counts.get(t.def.id) ?? 0) + 1)
      const have = (id: string) => counts.get(id) ?? 0

      // 기반 화력이 없으면 상성을 따질 여유가 없다. 가장 싼 사수부터 깐다.
      if (game.towers.length < 3) return 'archer'

      // 맨몸 물량은 살수의 광역이 가장 싸게 정리한다. 다만 이 AI는 **다가오는
      // 한 웨이브만** 보는데 초반 웨이브는 어느 판이든 맨몸이라, 조건을 느슨하게
      // 두면 3기를 깔아 놓고 뒤쪽 갑주 웨이브에서 통째로 놀린다. 실제로 그렇게
      // 짜 봤더니 S2가 100% → 0%로 무너졌다. 그래서 셋을 요구한다 —
      // 기반이 이미 있고, 맨몸이고, 기병이 아닌 지상 물량일 때만.
      if (
        game.canUse('sword') &&
        softShare &&
        flyShare < 0.3 &&
        game.towers.length >= 5 &&
        have('sword') < 2
      ) {
        return 'sword'
      }

      // 기고는 곱셈이라 곱할 것이 충분히 쌓인 뒤에야 값을 한다. 여덟 기가
      // 넘게 깔린 뒤 한 기만 — 중첩되지 않으므로 두 기째는 낭비다.
      if (game.canUse('banner') && game.towers.length >= 8 && have('banner') < 1) return 'banner'

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

      // 거마작은 기마에게 감속이 훨씬 깊게 걸린다. 그러니 "웨이브가 깊어졌으니
      // 하나 깔자"가 아니라 **말이 오는가**로 판단해야 맞다. 보병만 오는 웨이브에
      // 거마작을 짓는 것은 그냥 화력을 버리는 것이다.
      // 몇 기가 적정인지는 이 상한만 바꿔가며 대조 실험으로 확인한다.
      if (game.canUse('frost') && maxFrost > 0 && game.towers.length >= 5 && flyShare > 0.2) {
        const wantFrost = Math.min(maxFrost, 1 + Math.floor(flyShare * 3))
        if (have('frost') < wantFrost) return 'frost'
      }

      // 갑주가 두꺼우면 관통이 죽는다 → 총통
      if (avgArmor >= 6 && have('mage') < have('archer') + 2) return 'mage'

      // 산개가 높으면 화약이 죽는다 → 관통 계열.
      // 기병이 섞여 있으면 화차가 못 닿으므로 조총으로 간다 — 이 갈래가
      // 조총을 넣은 이유 그 자체라, AI가 그걸 실제로 고르는지 확인하는 자리다.
      if (avgResist >= 0.4) {
        if (game.canUse('musket') && (flyShare > 0.2 || avgArmor >= 8) && have('musket') < 3) {
          return 'musket'
        }
        if (flyShare < 0.2 && have('cannon') < 3 && game.towers.length >= 5) return 'cannon'
        return 'archer'
      }

      // 기병이 많으면 화차는 조준조차 못 한다. 광역을 포기하고 단일로 간다 —
      // 불랑기를 지웠으므로 기마 광역은 살수(사거리 2.3)뿐이고, 그건 위쪽
      // 맨몸 갈래에서만 값을 한다.
      if (flyShare > 0.35) {
        return have('mage') <= have('archer') ? 'mage' : 'archer'
      }

      // 특이사항 없으면 지상 물량 정리용 화차를 섞는다
      if (have('cannon') < 2 && flyShare < 0.15 && game.towers.length >= 5) return 'cannon'
      if (game.canUse('musket') && have('musket') < 2 && game.towers.length >= 8) return 'musket'
      return have('archer') <= have('mage') ? 'archer' : 'mage'
    },
  }
}

export const STRATEGIES: Strategy[] = [
  cycleStrategy({ id: 'archer-only', label: '사수 몰빵', cycle: ['archer'] }),
  cycleStrategy({ id: 'mage-only', label: '총통 몰빵', cycle: ['mage'] }),
  cycleStrategy({ id: 'cannon-only', label: '화차 몰빵', cycle: ['cannon'] }),
  cycleStrategy({ id: 'frost-only', label: '거마작 몰빵 (대조군)', cycle: ['frost'] }),
  cycleStrategy({ id: 'musket-only', label: '포수 몰빵', cycle: ['musket'] }),
  cycleStrategy({ id: 'sword-only', label: '살수 몰빵', cycle: ['sword'] }),
  cycleStrategy({ id: 'banner-only', label: '기고 몰빵 (대조군)', cycle: ['banner'] }),
  cycleStrategy({
    id: 'balanced-no-frost',
    label: '균형 (사수·총통·화차)',
    cycle: ['archer', 'mage', 'cannon'],
  }),
  cycleStrategy({
    id: 'balanced',
    label: '균형 + 거마작',
    cycle: ['archer', 'mage', 'cannon', 'archer', 'mage', 'frost'],
  }),
  // 신규 기물 두 종이 실제로 자리를 갖는지 보는 대조군 — 옛 다섯 종만 쓰는
  // 빌드와 비교해 "굳이 필요한가"에 수치로 답해야 한다.
  cycleStrategy({
    id: 'balanced-old5',
    label: '균형 · 옛 다섯 종만',
    cycle: ['archer', 'mage', 'cannon', 'frost', 'archer', 'mage', 'venom'],
  }),
  cycleStrategy({
    id: 'balanced-all7',
    label: '균형 · 여덟 종 전부',
    cycle: ['archer', 'sword', 'musket', 'mage', 'cannon', 'frost', 'venom', 'banner'],
  }),
  // 신규 두 종이 실제로 자리를 갖는지 보는 대조군 — 같은 조합에서 이것만
  // 빼고 넣어 비교해야 "굳이 필요한가"에 수치로 답할 수 있다.
  cycleStrategy({
    id: 'balanced-sword',
    label: '균형 + 살수',
    cycle: ['archer', 'mage', 'cannon', 'sword', 'archer', 'mage', 'frost'],
  }),
  cycleStrategy({
    id: 'balanced-banner',
    label: '균형 + 기고',
    cycle: ['archer', 'mage', 'cannon', 'archer', 'mage', 'frost', 'banner'],
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
export function act(game: Game, strategy: Strategy, spots: SpotIndex): boolean {
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

function tryBuild(game: Game, strategy: Strategy, spots: SpotIndex): boolean {
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

  // 자리 고르는 규칙이 기물 성격마다 다르다.
  //  - 기고: 경로가 아니라 **이미 깔린 기물**이 많이 들어오는 곳
  //  - 나머지(거마작 포함): 자기 사거리 기준 커버리지 1위
  //
  // **거마작에 「경로 앞쪽 우선」을 걸었던 것이 오래된 버그였다.** "감속이
  // 뒤쪽 기물 전부에 이득이 되니 앞에 두자"는 논리는 그럴듯했지만, 2갈래
  // 맵에서 경로 앞쪽은 **적도 덜 지나가고 기물도 없는 곳**이라 곱할 것이
  // 없었다. 이 규칙을 끄자 정묘호란의 `균형 + 거마작`이 0% → 100%(생명 15.4)로
  // 뒤집혔다 — 여러 판에 걸쳐 "거마작은 지을수록 진다"고 재고 있던 것이
  // 전부 자리를 잘못 잡은 결과였다는 뜻이다.
  //
  // 감속은 **적이 가장 오래 머무는 곳**에 걸어야 한다. 그건 다른 기물이
  // 노리는 자리와 같고, 그래서 기물이 모이는 곳이기도 하다.
  const first = getTowerDef(towerId).levels[0]
  const spot =
    first.auraFireRate > 0
      ? pickCommandSpot(game, spots, first.auraRange)
      : pickSpot(game, spots.forRange(first.range))
  if (!spot) return false

  return game.tryBuild(towerId, spot.col, spot.row).ok
}

/** 커버리지가 가장 좋은 타워부터 올린다 — 같은 골드로 가장 많은 사격 기회를 산다. */
function tryUpgrade(game: Game, spots: SpotIndex): boolean {
  const coverageOf = new Map<string, number>()
  for (const s of spots.forRange(3.2)) coverageOf.set(`${s.col},${s.row}`, s.coverage)

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
