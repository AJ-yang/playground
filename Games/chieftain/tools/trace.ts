/**
 * 결정론 대조 하네스 (TypeScript 쪽).
 *
 * 같은 시드로 판을 굴리며 **매 틱 전체 상태를 정해진 형식으로 뱉는다.** C# 포팅이
 * 같은 것을 뱉는지 `diff`로 비교하기 위한 것이고, 어긋나면 diff의 첫 줄이 곧
 * "몇 번째 틱, 어느 값에서 갈라졌는가"가 된다.
 *
 * 부동소수는 **비트 패턴으로 찍는다.** 십진수로 찍으면 반올림이 차이를 덮어서,
 * 마지막 비트만 어긋난 진짜 발산을 놓친다 — 락스텝에서는 그 한 비트가 판을 가른다.
 *
 * 실행: esbuild로 묶어서 node로 돌린다(`tools/trace.sh`).
 */
import { FIXED_DT } from '../src/core/loop'
import { Ai } from '../src/game/Ai'
import { Game } from '../src/game/Game'
import type { Side } from '../src/game/types'

const buf = new ArrayBuffer(8)
const dv = new DataView(buf)

/** double을 IEEE 754 비트 그대로 16자리 16진수로. */
function d(v: number): string {
  dv.setFloat64(0, v)
  return dv.getBigUint64(0).toString(16).padStart(16, '0')
}

function b(v: boolean): string {
  return v ? '1' : '0'
}

const seed = Number(process.argv[2] ?? 12345)
const ticks = Number(process.argv[3] ?? 1800)

const game = new Game({ seed, humanSide: 0 })
const ai = new Ai(game, 1 as Side)

const out: string[] = []

function dump(tick: number): void {
  out.push(`T ${tick} ${d(game.telemetry.elapsed)} ${game.phase}`)

  for (const p of game.players) {
    const a = p.avatar
    const q = p.queue.map((i) => `${i.kind}:${d(i.remain)}`).join(',')
    out.push(
      `P ${p.side} ${d(p.silver)} ${d(p.keepHp)} ${d(a.pos.x)} ${d(a.pos.z)} ${d(a.yaw)} ` +
        `${b(a.driving)} ${a.moveTarget ? `${d(a.moveTarget.x)}/${d(a.moveTarget.z)}` : '-'} ` +
        `${d(p.rally.x)} ${d(p.rally.z)} ${p.rallyTile} ${p.focusId} [${q}]`,
    )
  }

  for (const u of game.units) {
    out.push(
      `U ${u.id} ${u.faction} ${u.kind} ${d(u.pos.x)} ${d(u.pos.z)} ${d(u.hp)} ${u.tile} ` +
        `${d(u.facing)} ${d(u.swingIn)} ${b(u.commanded)} ${b(u.fighting)} ${u.destTile} ` +
        `${u.path.length} ${d(u.thinkIn)} ${d(u.lunge)} ${d(u.flash)} ${d(u.guard)} ${u.anchorTile}`,
    )
  }

  for (const t of game.board.tiles) {
    const c = t.neutral
    out.push(
      `L ${t.def.id} ${d(t.hold)} ${t.owner} ${b(t.outpost)} ` +
        `${c ? `${c.kind}/${b(c.cleared)}/${c.lastDamager}/${c.guards.length}` : '-'} ` +
        `${b(t.seen[0])}${b(t.seen[1])}`,
    )
  }

  for (const bd of game.buildings) {
    out.push(
      `B ${bd.id} ${bd.side} ${bd.tile} ${d(bd.pos.x)} ${d(bd.pos.z)} ${d(bd.hp)} ${d(bd.raising)}`,
    )
  }

  out.push(`V ${[...game.visible[0]].sort((x, y) => x - y).join(',')} | ${[...game.visible[1]].sort((x, y) => x - y).join(',')}`)
}

dump(0)
for (let i = 1; i <= ticks; i++) {
  // main.ts와 같은 순서다 — AI가 먼저 명령을 내리고 그다음 판이 한 스텝 간다.
  ai.update(FIXED_DT)
  game.update(FIXED_DT)
  dump(i)
}

process.stdout.write(out.join('\n') + '\n')
