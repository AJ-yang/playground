import { TUNING } from '../data/tuning'
import { UNITS } from '../data/units'
import type { Game } from '../game/Game'
import type { Side, Unit } from '../game/types'

/**
 * HUD. 3D 안이 아니라 **캔버스 위에 얹은 DOM**이다.
 *
 * 글자는 브라우저가 제일 잘 그리고, 부감과 1인칭이 같은 코드를 쓸 수 있다.
 * 대신 이 안에는 **판정에 필요한 것만** 둔다 — 규칙 모르는 사람 3명이
 * 판정자이므로(GDD 6.5), 읽어야 이해되는 UI는 실험을 망친다. 규칙은 화면
 * 안에서 보여야 하고, 여기 있는 것은 숫자와 열쇠 안내뿐이다.
 */
export class Hud {
  private readonly root: HTMLElement

  constructor(root: HTMLElement) {
    this.root = root
  }

  render(game: Game, firstPerson: boolean, selected: ReadonlySet<number>, aiming: boolean): void {
    const me = game.humanSide
    const foe = (1 - me) as Side
    const p = game.players[me]
    const q = game.players[foe]

    const commanded = game.commandedCount(me)
    const army = game.countUnits(me)
    const workers = game.countWorkers(me)
    const tiles = game.board.ownedBy(me)
    const foeTiles = game.board.ownedBy(foe)
    const forges = game.forgesOf(me).length

    const queue = p.queue
      .map((it) => `<span class="muted">${UNITS[it.kind].name[0]}</span>`)
      .join('')

    this.root.innerHTML = `
      <div class="panel top-left">
        <div class="row"><span>은</span><b>${Math.floor(p.silver)}</b></div>
        <div class="row"><span>병력</span><b>${army} / ${TUNING.maxUnits}</b></div>
        <div class="row"><span>일꾼</span><b>${workers} / ${TUNING.maxWorkers}</b></div>
        <div class="row"><span>내 땅</span><b>${tiles} <span class="muted">: ${foeTiles}</span></b></div>
        <div class="row">
          <span>지휘 중</span>
          <b style="color:${commanded > 0 ? '#ffe08a' : '#8b949e'}">${commanded}명</b>
        </div>
        ${queue ? `<div class="row"><span>생산</span><span>${queue}</span></div>` : ''}
        ${forges > 0 ? `<div class="row"><span>전진 기지</span><b>${forges}</b></div>` : ''}
        ${descentRow(game, me)}
      </div>

      <div class="panel top-right">
        <div><span class="muted">내 본진</span> <b class="p0">${bar(p.keepHp / TUNING.keepHp)}</b></div>
        <div><span class="muted">적 본진</span> <b class="p1">${bar(q.keepHp / TUNING.keepHp)}</b></div>
        <div class="muted" style="margin-top:6px">${clock(game.telemetry.elapsed)}</div>
      </div>

      ${this.logPanel(game)}

      ${selectionPanel(game, selected)}

      <div class="panel bottom-center">
        ${aiming ? AIM_KEYS : firstPerson ? FIRST_PERSON_KEYS : OVERHEAD_KEYS}
      </div>
    `
  }

  private logPanel(game: Game): string {
    if (game.log.length === 0) return ''
    const items = game.log
      .slice(-3)
      .map((l) => `<div>${l.text}</div>`)
      .join('')
    return `<div class="panel bottom-left">${items}</div>`
  }
}

const OVERHEAD_KEYS = `
  <span class="k">좌클릭</span> 고른다 <span class="muted">(끌면 여럿)</span> &nbsp;·&nbsp;
  <span class="k">우클릭</span> 보낸다 &nbsp;·&nbsp;
  <span class="k">1</span><span class="k">2</span><span class="k">4</span> 생산 &nbsp;·&nbsp;
  <span class="k">Tab</span> <b>강림</b>
`

const AIM_KEYS = `
  <b style="color:#ffe08a">내려갈 곳을 짚어라</b> &nbsp;·&nbsp;
  <span class="muted">원 안의 부대가 세진다</span> &nbsp;·&nbsp;
  <span class="k">Esc</span> 그만둔다
`

const FIRST_PERSON_KEYS = `
  <span class="k">WASD</span> 걷는다 &nbsp;·&nbsp;
  <span class="k">마우스</span> 둘러본다 &nbsp;·&nbsp;
  <span class="k">좌클릭</span> 부대를 앞으로 &nbsp;·&nbsp;
  <span class="k">3</span> <b>기지</b> &nbsp;·&nbsp;
  <span class="k">Tab</span> <b>올라간다</b>
`

/**
 * 강림 상태 한 줄.
 *
 * 내려가 있는지, 못 내려가면 얼마나 남았는지. 강림이 순간이동이 된 뒤로
 * **대기시간이 이 게임에서 두 번째로 중요한 숫자**가 되었는데(GDD 3.2),
 * 화면에 없으면 사람은 Tab이 왜 안 먹는지 모른다.
 */
function descentRow(game: Game, me: Side): string {
  const a = game.players[me].avatar
  if (a.embodied) {
    return `<div class="row"><span>강림</span><b style="color:#ffe08a">내려와 있다</b></div>`
  }
  if (a.descendIn > 0) {
    return `<div class="row"><span>강림</span><b class="muted">${a.descendIn.toFixed(1)}초</b></div>`
  }
  return `<div class="row"><span>강림</span><b><span class="k">Tab</span></b></div>`
}

/**
 * 고른 부대의 상태 (하단).
 *
 * 하나면 그놈의 값을 다 펼치고, 여럿이면 종류별로 셋다. 여럿일 때 값을 전부
 * 펼치면 읽을 수 없고, 사람이 실제로 알고 싶은 것은 "지금 몇 명을 쥐고
 * 있는가"와 "얼마나 상했는가"뿐이다.
 */
function selectionPanel(game: Game, selected: ReadonlySet<number>): string {
  if (selected.size === 0) return ''
  const units = game.units.filter((u) => selected.has(u.id) && u.hp > 0)
  if (units.length === 0) return ''

  if (units.length === 1) return oneUnit(game, units[0]!)

  const byKind = new Map<string, number>()
  let hp = 0
  let maxHp = 0
  let commanded = 0
  for (const u of units) {
    byKind.set(u.kind, (byKind.get(u.kind) ?? 0) + 1)
    hp += u.hp
    maxHp += u.maxHp
    if (u.commanded) commanded++
  }
  const kinds = [...byKind]
    .map(([k, n]) => `<b>${UNITS[k as Unit['kind']].name}</b> <span class="muted">×${n}</span>`)
    .join(' &nbsp; ')
  return `
    <div class="panel bottom-sel">
      <div class="sel-head">${units.length}명 골랐다</div>
      <div>${kinds}</div>
      <div class="sel-bars">${meter(hp / maxHp)} <span class="muted">${Math.round(hp)} / ${maxHp}</span></div>
      ${commanded > 0 ? `<div class="muted">지휘 반경 안 <b style="color:#ffe08a">${commanded}명</b></div>` : ''}
    </div>
  `
}

function oneUnit(game: Game, u: Unit): string {
  const def = UNITS[u.kind]
  const boosted = u.commanded
  return `
    <div class="panel bottom-sel">
      <div class="sel-head">
        <b>${def.name}</b>
        ${boosted ? '<span style="color:#ffe08a">· 지휘 반경 안</span>' : ''}
      </div>
      <div class="sel-bars">${meter(u.hp / u.maxHp)} <span class="muted">${Math.round(u.hp)} / ${u.maxHp}</span></div>
      <div class="sel-grid">
        <span class="muted">공격</span><b>${def.civilian ? '—' : def.dps.toFixed(0)}</b>
        <span class="muted">사거리</span><b>${def.civilian ? '—' : def.range.toFixed(1)}</b>
        <span class="muted">속도</span><b>${def.speed.toFixed(0)}</b>
      </div>
      <div class="muted sel-note">${def.blurb}</div>
      ${game.isCivilian(u) ? '<div class="muted sel-note">내 땅에 서 있으면 그 지역의 수입을 올린다.</div>' : ''}
    </div>
  `
}

function meter(ratio: number): string {
  const r = Math.max(0, Math.min(1, ratio))
  const color = r > 0.55 ? '#8fd18a' : r > 0.25 ? '#e8c46a' : '#e8776a'
  return `<span class="bar"><i style="width:${(r * 100).toFixed(0)}%;background:${color}"></i></span>`
}

function bar(ratio: number): string {
  const n = 10
  const full = Math.round(Math.max(0, Math.min(1, ratio)) * n)
  return '█'.repeat(full) + '░'.repeat(n - full)
}

function clock(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * 시작·종료 배너.
 *
 * 시작 배너에 규칙을 **길게 적지 않는다.** 세 줄을 넘기면 아무도 안 읽고,
 * 읽게 만들면 "설명 없이 쥐어주고 관찰한다"는 판정 조건이 깨진다. 열쇠만
 * 알려주고 나머지는 화면 안에서 알아채게 둔다.
 */
export class Banner {
  constructor(private readonly root: HTMLElement) {}

  showStart(onStart: () => void): void {
    this.root.innerHTML = `
      <div>
        <h1>족장</h1>
        <p>내가 어디 서 있느냐가 전투력이다.</p>
        <button id="start">시작</button>
        <div class="keys">
          <div><b>Tab</b> — 내 몸으로 들어간다</div>
          <div><b>좌클릭</b> 부대 / <b>우클릭</b> 나 / <b>1</b>·<b>2</b> 병력 / <b>3</b> 기지</div>
        </div>
      </div>
    `
    this.root.classList.add('show')
    this.root.querySelector<HTMLButtonElement>('#start')!.onclick = () => {
      this.hide()
      onStart()
    }
  }

  /**
   * 종료 배너에는 **관찰 지표를 같이 띄운다**(GDD 6.5).
   *
   * 판정자는 옆에서 화면을 보고 있는 사람이지만, 강림 횟수가 화면에 남아
   * 있으면 판정이 기억이 아니라 숫자가 된다. "한 번도 안 내려갔다"를
   * 나중에 부인할 수 없게 만드는 장치다.
   */
  showEnd(game: Game, onRestart: () => void): void {
    const won = game.end?.winner === game.humanSide
    const t = game.telemetry
    const share = t.elapsed > 0 ? Math.round((t.timeInFirstPerson / t.elapsed) * 100) : 0
    this.root.innerHTML = `
      <div>
        <h1>${won ? '이겼다' : '졌다'}</h1>
        <p>${won ? '상대의 롱하우스가 무너졌다.' : '내 롱하우스가 무너졌다.'}</p>
        <button id="again">다시</button>
        <div class="keys">
          <div>강림 <b>${t.descents}회</b> · 1인칭으로 보낸 시간 <b>${share}%</b></div>
          <div>${verdict(t.descents, share)}</div>
        </div>
      </div>
    `
    this.root.classList.add('show')
    this.root.querySelector<HTMLButtonElement>('#again')!.onclick = () => {
      this.hide()
      onRestart()
    }
  }

  hide(): void {
    this.root.classList.remove('show')
    this.root.innerHTML = ''
  }
}

/** GDD 6.5의 두 불합격 조건을 그대로 옮긴 것이다. */
function verdict(descents: number, sharePercent: number): string {
  if (descents === 0) return '<span class="muted">한 번도 내려가지 않았다</span>'
  if (sharePercent >= 85) return '<span class="muted">거의 내려가 있었다</span>'
  return '<span class="muted">오르내렸다</span>'
}
