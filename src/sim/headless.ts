import { FIXED_DT } from '../core/loop'
import type { StageDef } from '../data/stages'
import { Game } from '../game/Game'
import { rankSpots } from './coverage'
import { act, type Strategy } from './strategies'

/** 한 판의 결과. */
export interface SimResult {
  strategyId: string
  stageId: string
  seed: number
  victory: boolean
  /** 클리어한 웨이브 수 (승리 시 20) */
  wavesCleared: number
  livesLeft: number
  totalKills: number
  totalLeaked: number
  goldEarned: number
  goldSpent: number
  earlyCallBonus: number
  towerCount: number
  /** 타워 종류별 누적 딜 점유율 (0~1) */
  damageShare: Record<string, number>
  /** 타워 종류별 건설 수 */
  towerMix: Record<string, number>
  /** 생명이 처음 깎인 웨이브 (한 번도 안 깎였으면 null) */
  firstLeakWave: number | null
  /** 시뮬레이션 게임 내 경과 시간 (초) */
  gameSeconds: number
  /** 스텝 상한에 걸려 중단됐는가 */
  timedOut: boolean
}

/** 안전장치: 게임 내 시간 기준 상한. 20웨이브는 정상적으로 15분 안에 끝난다. */
const MAX_GAME_SECONDS = 60 * 40

/** 전략이 판단을 내리는 주기 (게임 내 초). 사람의 조작 빈도를 대략 흉내 낸다. */
const THINK_INTERVAL = 0.5

/**
 * 렌더링 없이 한 판을 끝까지 돌린다.
 *
 * 브라우저와 완전히 같은 `Game`을 같은 고정 타임스텝으로 돌리므로,
 * 여기서 나온 수치는 실제 플레이의 수치다. 시드가 같고 전략이 결정적이면
 * 결과도 항상 같다.
 */
export function simulate(
  strategy: Strategy,
  seed: number,
  stage: StageDef,
  availableTowers: readonly string[],
): SimResult {
  const game = new Game(stage, { seed, availableTowers })
  const spots = rankSpots(game)

  let elapsed = 0
  let sinceThink = Infinity
  let firstLeakWave: number | null = null
  let lastLives = game.lives
  let timedOut = false

  while (!game.isOver) {
    if (elapsed >= MAX_GAME_SECONDS) {
      timedOut = true
      break
    }

    sinceThink += FIXED_DT
    if (sinceThink >= THINK_INTERVAL) {
      sinceThink = 0
      act(game, strategy, spots)
      // 살 것을 다 산 뒤에만 조기 소환한다 — 무방비로 부르는 것을 막는다.
      if (strategy.earlyCall && !game.waves.running) game.callNextWave()
    }

    game.update(FIXED_DT)
    elapsed += FIXED_DT

    if (game.lives < lastLives) {
      if (firstLeakWave === null) firstLeakWave = game.waves.waveNumber
      lastLives = game.lives
    }
  }

  const damageByType: Record<string, number> = {}
  const mix: Record<string, number> = {}
  let totalDamage = 0
  for (const tower of game.towers) {
    damageByType[tower.def.id] = (damageByType[tower.def.id] ?? 0) + tower.damageDealt
    mix[tower.def.id] = (mix[tower.def.id] ?? 0) + 1
    totalDamage += tower.damageDealt
  }
  const damageShare: Record<string, number> = {}
  for (const [id, dmg] of Object.entries(damageByType)) {
    damageShare[id] = totalDamage > 0 ? dmg / totalDamage : 0
  }

  const victory = game.phase === 'victory'
  return {
    strategyId: strategy.id,
    stageId: stage.id,
    seed,
    victory,
    wavesCleared: victory ? game.waves.totalWaves : Math.max(0, game.waves.waveNumber - 1),
    livesLeft: game.lives,
    totalKills: game.totalKills,
    totalLeaked: game.totalLeaked,
    goldEarned: game.goldEarned,
    goldSpent: game.goldSpent,
    earlyCallBonus: game.earlyCallBonus,
    towerCount: game.towers.length,
    damageShare,
    towerMix: mix,
    firstLeakWave,
    gameSeconds: Math.round(elapsed),
    timedOut,
  }
}

/** 같은 전략을 여러 시드로 돌린 집계. */
export interface Aggregate {
  strategyId: string
  label: string
  runs: number
  victories: number
  victoryRate: number
  avgWavesCleared: number
  /** 클리어 웨이브의 표준편차 — 운에 얼마나 좌우되는지 */
  stdWavesCleared: number
  minWavesCleared: number
  maxWavesCleared: number
  avgLivesLeft: number
  avgGoldEarned: number
  avgTowers: number
  avgDamageShare: Record<string, number>
  avgTowerMix: Record<string, number>
  medianFirstLeakWave: number | null
  timeouts: number
}

export function aggregate(strategy: Strategy, results: readonly SimResult[]): Aggregate {
  const n = results.length
  const waves = results.map((r) => r.wavesCleared)
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
  const avgWaves = mean(waves)
  const variance = mean(waves.map((w) => (w - avgWaves) ** 2))

  const shareKeys = new Set<string>()
  const mixKeys = new Set<string>()
  for (const r of results) {
    Object.keys(r.damageShare).forEach((k) => shareKeys.add(k))
    Object.keys(r.towerMix).forEach((k) => mixKeys.add(k))
  }
  const avgDamageShare: Record<string, number> = {}
  for (const key of shareKeys) avgDamageShare[key] = mean(results.map((r) => r.damageShare[key] ?? 0))
  const avgTowerMix: Record<string, number> = {}
  for (const key of mixKeys) avgTowerMix[key] = mean(results.map((r) => r.towerMix[key] ?? 0))

  const leaks = results.map((r) => r.firstLeakWave).filter((w): w is number => w !== null).sort((a, b) => a - b)

  return {
    strategyId: strategy.id,
    label: strategy.label,
    runs: n,
    victories: results.filter((r) => r.victory).length,
    victoryRate: n ? results.filter((r) => r.victory).length / n : 0,
    avgWavesCleared: avgWaves,
    stdWavesCleared: Math.sqrt(variance),
    minWavesCleared: Math.min(...waves),
    maxWavesCleared: Math.max(...waves),
    avgLivesLeft: mean(results.map((r) => r.livesLeft)),
    avgGoldEarned: mean(results.map((r) => r.goldEarned)),
    avgTowers: mean(results.map((r) => r.towerCount)),
    avgDamageShare,
    avgTowerMix,
    medianFirstLeakWave: leaks.length ? leaks[Math.floor(leaks.length / 2)]! : null,
    timeouts: results.filter((r) => r.timedOut).length,
  }
}
