import { TUNING } from '../data/tuning'
import { UNITS } from '../data/units'
import type { Game } from '../game/Game'
import type { Side } from '../game/types'

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

  render(game: Game, firstPerson: boolean): void {
    const me = game.humanSide
    const foe = (1 - me) as Side
    const p = game.players[me]
    const q = game.players[foe]

    const commanded = game.commandedCount(me)
    const army = game.countUnits(me)
    const tiles = game.board.ownedBy(me)
    const foeTiles = game.board.ownedBy(foe)

    const queue = p.queue
      .map((it) => `<span class="muted">${UNITS[it.kind].name[0]}</span>`)
      .join('')

    this.root.innerHTML = `
      <div class="panel top-left">
        <div class="row"><span>은</span><b>${Math.floor(p.silver)}</b></div>
        <div class="row"><span>병력</span><b>${army} / ${TUNING.maxUnits}</b></div>
        <div class="row"><span>내 땅</span><b>${tiles} <span class="muted">: ${foeTiles}</span></b></div>
        <div class="row">
          <span>지휘 중</span>
          <b style="color:${commanded > 0 ? '#ffe08a' : '#8b949e'}">${commanded}명</b>
        </div>
        ${queue ? `<div class="row"><span>생산</span><span>${queue}</span></div>` : ''}
      </div>

      <div class="panel top-right">
        <div><span class="muted">내 본진</span> <b class="p0">${bar(p.keepHp / TUNING.keepHp)}</b></div>
        <div><span class="muted">적 본진</span> <b class="p1">${bar(q.keepHp / TUNING.keepHp)}</b></div>
        <div class="muted" style="margin-top:6px">${clock(game.telemetry.elapsed)}</div>
      </div>

      ${this.logPanel(game)}

      <div class="panel bottom-center">
        ${firstPerson ? FIRST_PERSON_KEYS : OVERHEAD_KEYS}
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
  <span class="k">좌클릭</span> 부대를 그 칸으로 &nbsp;·&nbsp;
  <span class="k">우클릭</span> 내가 그 칸으로 <span class="muted">(느리다)</span> &nbsp;·&nbsp;
  <span class="k">1</span> 방패병 <span class="k">2</span> 도끼병 &nbsp;·&nbsp;
  <span class="k">Tab</span> <b>강림</b>
`

const FIRST_PERSON_KEYS = `
  <span class="k">WASD</span> 직접 걷는다 <span class="muted">(빠르다)</span> &nbsp;·&nbsp;
  <span class="k">마우스</span> 둘러본다 <span class="muted">(안 되면 끌어서 / <span class="k">Q</span><span class="k">E</span>)</span> &nbsp;·&nbsp;
  <span class="k">좌클릭</span> 부대를 앞으로 &nbsp;·&nbsp;
  <span class="k">Tab</span> <b>부감으로</b>
`

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
          <div><b>좌클릭</b> 부대 / <b>우클릭</b> 나 / <b>1</b>·<b>2</b> 생산</div>
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
