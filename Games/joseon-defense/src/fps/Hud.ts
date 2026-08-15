import { DIFFICULTIES } from '../data/difficulty'
import { STAGES, type StageDef } from '../data/stages'
import { TOWER_ORDER, buildCost, getTowerDef, type TowerLevelDef } from '../data/towers'
import { DAMAGE_TYPE_LABEL, TARGET_PRIORITY_LABEL } from '../game/types'
import type { Game } from '../game/Game'
import type { Progress } from '../game/Progress'
import type { AimResult } from './aim'

/**
 * 화면 위에 얹히는 것 전부 — DOM으로 짓는다.
 *
 * 2D 쪽 HUD는 캔버스에 직접 그린다. 3D에서 같은 방식을 쓰면 글자를 그리려고
 * WebGL 위에 또 하나의 캔버스를 겹치고 매 프레임 전체를 다시 칠해야 하는데,
 * 브라우저의 텍스트 레이아웃을 공짜로 쓸 수 있는 자리에서 그럴 이유가 없다.
 * DOM은 **변한 것만** 다시 그리므로 3D 프레임 예산을 거의 먹지 않는다.
 *
 * 대신 규칙 하나를 지킨다 — **DOM 갱신은 값이 바뀔 때만.** 매 프레임
 * `textContent`를 쓰면 값이 같아도 브라우저가 레이아웃을 다시 잰다. 그래서
 * 마지막으로 쓴 값을 기억해 두고 달라졌을 때만 건드린다.
 */

/** 화면 갈래 — 동시에 하나만 열린다. */
export type Screen = 'select' | 'lock' | 'menu' | 'result' | 'play'

export interface HudHandlers {
  startStage(stage: StageDef): void
  setDifficulty(id: string): void
  resetProgress(): void
  resume(): void
  restart(): void
  toSelect(): void
  nextStage(): void
  setSensitivity(value: number): void
}

/**
 * 기물 한 줄 요약.
 *
 * **기물마다 "무엇을 보고 판단하는가"가 다르다.** 기고는 딜이 0이라 피해와
 * 사거리를 적으면 "피해 0 · 사거리 0.1"이라는 무의미한 줄이 뜨고, 거마작은
 * 딜이 아니라 감속량이 값어치다. 그래서 수치를 그대로 나열하지 않고
 * 그 기물의 본업을 앞에 세운다.
 */
function statLine(stats: TowerLevelDef): string {
  if (stats.auraFireRate > 0) {
    return `지휘 공격속도 +${Math.round(stats.auraFireRate * 100)}% · 반경 ${stats.auraRange}칸`
  }
  const parts = [`피해 ${stats.damage}`, `사거리 ${stats.range}`, `${stats.fireRate.toFixed(2)}/초`]
  if (stats.splashRadius > 0) parts.push(`폭발 ${stats.splashRadius}칸`)
  if (stats.slowAmount > 0) {
    const cavalry = Math.min(0.95, stats.slowAmount + stats.cavalrySlow)
    parts.push(
      `감속 −${Math.round(stats.slowAmount * 100)}%` +
        (stats.cavalrySlow > 0 ? ` (기마 −${Math.round(cavalry * 100)}%)` : ''),
    )
  }
  if (stats.poisonDps > 0) parts.push(`중독 ${stats.poisonDps}/초 × ${stats.poisonDuration}초`)
  return parts.join(' · ')
}

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`#${id} 요소를 찾을 수 없습니다`)
  return node as T
}

export class Hud {
  private readonly hud = el('hud')
  private readonly stageName = el('stage-name')
  private readonly stageSub = el('stage-sub')
  private readonly statLives = el('stat-lives')
  private readonly statGold = el('stat-gold')
  private readonly statWave = el('stat-wave')
  private readonly statKills = el('stat-kills')
  private readonly phaseLabel = el('phase-label')
  private readonly phaseDetail = el('phase-detail')
  private readonly phaseBar = el('phase-bar')
  private readonly warning = el('warning')
  private readonly reticle = el('reticle')
  private readonly focus = el('focus')
  private readonly toast = el('toast')
  private readonly palette = el('palette')
  private readonly vignette = el('vignette')

  private readonly screens: Record<Exclude<Screen, 'play'>, HTMLElement> = {
    select: el('screen-select'),
    lock: el('screen-lock'),
    menu: el('screen-menu'),
    result: el('screen-result'),
  }

  private readonly slots = new Map<string, HTMLElement>()
  private paletteSignature = ''
  private cache = new Map<string, string>()
  private warningKey = ''

  constructor(private readonly handlers: HudHandlers) {
    el('btn-enter').addEventListener('click', () => handlers.resume())
    el('btn-resume').addEventListener('click', () => handlers.resume())
    el('btn-restart').addEventListener('click', () => handlers.restart())
    el('btn-quit').addEventListener('click', () => handlers.toSelect())
    el('btn-again').addEventListener('click', () => handlers.restart())
    el('btn-select').addEventListener('click', () => handlers.toSelect())
    el('btn-next').addEventListener('click', () => handlers.nextStage())
    el('btn-reset').addEventListener('click', () => handlers.resetProgress())
    for (const id of ['btn-to2d', 'btn-to2d-2']) {
      el(id).addEventListener('click', () => {
        window.location.href = './index.html'
      })
    }

    const sens = el<HTMLInputElement>('sens')
    sens.addEventListener('input', () => {
      const value = Number(sens.value)
      el('sens-value').textContent = String(value)
      handlers.setSensitivity(value)
    })
  }

  // ────────────────────────────── 화면 전환 ──────────────────────────────

  show(screen: Screen): void {
    for (const [name, node] of Object.entries(this.screens)) {
      node.classList.toggle('hidden', name !== screen)
    }
    this.hud.classList.toggle('hidden', screen === 'select')
  }

  setSensitivityValue(value: number): void {
    const sens = el<HTMLInputElement>('sens')
    sens.value = String(value)
    el('sens-value').textContent = String(value)
  }

  // ────────────────────────────── 스테이지 선택 ──────────────────────────────

  renderSelect(progress: Progress): void {
    const difficulties = el('difficulty-row')
    difficulties.replaceChildren(
      ...DIFFICULTIES.map((difficulty) => {
        const button = document.createElement('button')
        button.textContent = `${difficulty.name} · ${difficulty.desc}`
        button.classList.toggle('on', progress.difficulty === difficulty.id)
        button.addEventListener('click', () => this.handlers.setDifficulty(difficulty.id))
        return button
      }),
    )

    const list = el('stage-list')
    list.replaceChildren(
      ...STAGES.map((stage) => {
        const unlocked = progress.isUnlocked(stage)
        const best = progress.bestLivesFor(stage.id)
        const card = document.createElement('button')
        card.className = `stage-card${unlocked ? '' : ' locked'}`
        card.disabled = !unlocked

        const idx = document.createElement('div')
        idx.className = 'idx'
        idx.textContent = `STAGE ${stage.index}`
        const title = document.createElement('div')
        title.className = 'ttl'
        title.textContent = `${stage.name} — ${stage.level.name}`
        const sub = document.createElement('div')
        sub.className = 'sub'
        sub.textContent = unlocked ? stage.subtitle : '앞 스테이지를 먼저 넘어야 열립니다'
        card.append(idx, title, sub)

        if (best !== null) {
          const record = document.createElement('div')
          record.className = 'best'
          record.textContent = `최고 기록 — 생명 ${best} 남김`
          card.append(record)
        }
        card.addEventListener('click', () => this.handlers.startStage(stage))
        return card
      }),
    )
  }

  // ────────────────────────────── 플레이 HUD ──────────────────────────────

  /** 해금 상태가 바뀔 때만 기물 목록을 다시 짓는다. */
  private buildPalette(game: Game): void {
    const menu = TOWER_ORDER.filter((id) => game.canUse(id))
    const signature = menu.join(',')
    if (signature === this.paletteSignature) return
    this.paletteSignature = signature
    this.slots.clear()

    this.palette.replaceChildren(
      ...menu.map((id, index) => {
        const def = getTowerDef(id)
        const slot = document.createElement('div')
        slot.className = 'slot'
        slot.innerHTML = `
          <span class="key">${index + 1}</span>
          <div class="swatch" style="background:${def.accent}"></div>
          <div class="name">${def.name}</div>
          <div class="cost">${buildCost(id)}G</div>
          <div class="tag">${DAMAGE_TYPE_LABEL[def.damageType]}${def.targetsAir ? '' : ' · 기마 불가'}</div>
        `
        this.slots.set(id, slot)
        return slot
      }),
    )
  }

  update(game: Game, stage: StageDef, aim: AimResult): void {
    this.buildPalette(game)

    this.set(this.stageName, 'name', `S${stage.index} ${stage.name}`)
    this.set(this.stageSub, 'sub', stage.level.name)
    this.set(this.statLives.querySelector('b')!, 'lives', String(game.lives))
    this.set(this.statGold, 'gold', String(Math.floor(game.gold)))
    this.set(this.statWave, 'wave', `${game.waves.waveNumber}/${game.waves.totalWaves}`)
    this.set(this.statKills, 'kills', String(game.totalKills))
    this.statLives.classList.toggle('danger', game.dangerLevel > 0.5)

    // 준비 시간 / 웨이브 진행. 같은 막대가 두 가지 일을 하되 색으로 갈린다.
    const running = game.waves.running
    if (running) {
      const { spawned, total } = game.waves.spawnProgress
      this.set(this.phaseLabel, 'phase', '교전 중')
      this.set(this.phaseDetail, 'phaseDetail', `남은 적 ${game.enemies.length}`)
      this.bar(total > 0 ? spawned / total : 1)
    } else {
      const remain = Math.max(0, game.waves.prepRemaining)
      this.set(this.phaseLabel, 'phase', '준비')
      this.set(this.phaseDetail, 'phaseDetail', `${remain.toFixed(1)}초 · Space 조기 소환`)
      const prep = game.waves.currentWave.prepTime
      this.bar(prep > 0 ? 1 - remain / prep : 1)
    }
    this.phaseBar.classList.toggle('running', running)

    // 새 위협 경고 — 웨이브가 바뀔 때 한 번만 뜬다.
    const wave = game.waves.currentWave
    const key = `${wave.id}:${wave.warning ?? ''}`
    if (key !== this.warningKey) {
      this.warningKey = key
      this.warning.textContent = wave.warning ?? ''
      this.warning.classList.toggle('show', Boolean(wave.warning))
      if (wave.warning) {
        window.setTimeout(() => this.warning.classList.remove('show'), 4200)
      }
    }

    this.updateFocus(aim)
    this.updatePaletteState(game)
    this.vignette.style.opacity = String(Math.min(0.85, game.damageFlash * 0.6))
  }

  private bar(ratio: number): void {
    const fill = this.phaseBar.firstElementChild as HTMLElement
    const pct = `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`
    if (fill.style.width !== pct) fill.style.width = pct
  }

  private updatePaletteState(game: Game): void {
    for (const [id, slot] of this.slots) {
      slot.classList.toggle('selected', game.selectedBuildId === id)
      slot.classList.toggle('poor', game.gold < buildCost(id))
    }
  }

  /**
   * 조준선 아래 한 줄 — 1인칭에서 가장 많이 읽는 곳.
   *
   * 지금 무엇을 겨누고 있고 무엇을 누를 수 있는지가 여기 다 적혀야 한다.
   * 2D에서는 마우스를 올린 칸과 옆 패널을 같이 볼 수 있었지만, 시선이 곧
   * 조준인 화면에서는 눈이 가운데를 떠나지 못하기 때문이다.
   */
  private updateFocus(aim: AimResult): void {
    let html = ''
    if (aim.kind === 'tower') {
      const tower = aim.tower
      const upgrade = tower.upgradeCost
      html =
        `<div class="title" style="color:${tower.def.accent}">${tower.def.name} <span class="meta">Lv.${tower.level}</span></div>` +
        `<div class="meta">${statLine(tower.stats)}` +
        `${tower.fireRateBonus > 0 ? ` <span style="color:#e6c765">지휘 +${Math.round(tower.fireRateBonus * 100)}%</span>` : ''}</div>` +
        `<div class="meta">처치 ${tower.kills} · 누적 피해 ${Math.round(tower.damageDealt)} · 타겟 ${TARGET_PRIORITY_LABEL[tower.targetPriority]}</div>` +
        `<div class="act">${upgrade === null ? '최대 레벨' : `<kbd>F</kbd> 강화 ${upgrade}G`} · <kbd>X</kbd> 철수 +${tower.sellValue()}G · <kbd>T</kbd> 타겟팅</div>`
    } else if (aim.kind === 'build') {
      const def = getTowerDef(aim.towerId)
      const cost = buildCost(aim.towerId)
      html =
        `<div class="title" style="color:${def.accent}">${def.name}</div>` +
        `<div class="meta">${def.tagline}</div>` +
        `<div class="meta">${statLine(def.levels[0])}</div>` +
        (aim.ok
          ? `<div class="act"><kbd>좌클릭</kbd> 여기에 배치 · ${cost}G</div>`
          : `<div class="bad">${aim.reason}</div>`)
    } else if (aim.kind === 'ground' && aim.hint) {
      html = `<div class="meta">${aim.hint}</div>`
    }

    if (this.cache.get('focus') !== html) {
      this.cache.set('focus', html)
      this.focus.innerHTML = html
    }

    this.reticle.classList.toggle('build', aim.kind === 'build' && aim.ok)
    this.reticle.classList.toggle('blocked', aim.kind === 'build' && !aim.ok)
  }

  /** 짧은 알림. 실패 사유처럼 즉시 사라져야 하는 것만 여기로 보낸다. */
  notify(message: string, tone: 'bad' | 'good' | 'plain' = 'plain'): void {
    const node = document.createElement('div')
    node.textContent = message
    if (tone !== 'plain') node.className = tone
    this.toast.append(node)
    window.setTimeout(() => node.remove(), 2000)
    // 화면이 알림으로 뒤덮이지 않게 최근 것 넷만 남긴다.
    while (this.toast.childElementCount > 4) this.toast.firstElementChild?.remove()
  }

  // ────────────────────────────── 결과 ──────────────────────────────

  showResult(game: Game, unlocked: string[], hasNext: boolean): void {
    const won = game.phase === 'victory'
    const title = el('result-title')
    title.textContent = won ? '승리' : '패배'
    title.className = `result-title ${won ? 'win' : 'lose'}`

    el('result-stats').innerHTML = [
      ['남은 생명', String(game.lives)],
      ['처치', String(game.totalKills)],
      ['유출', String(game.totalLeaked)],
      ['획득 골드', String(Math.floor(game.goldEarned))],
    ]
      .map(([label, value]) => `<div><span>${label}</span><b>${value}</b></div>`)
      .join('')

    const unlocks = el('result-unlocks')
    unlocks.textContent = unlocked.length
      ? `새 기물 해금 — ${unlocked.map((id) => getTowerDef(id).name).join(' · ')}`
      : ''

    el('btn-next').classList.toggle('hidden', !(won && hasNext))
    this.show('result')
  }

  private set(node: HTMLElement, key: string, value: string): void {
    if (this.cache.get(key) === value) return
    this.cache.set(key, value)
    node.textContent = value
  }
}
