/**
 * 고정 타임스텝 게임 루프.
 *
 * 시뮬레이션은 항상 1/60초 단위로 돌리고, 렌더링만 실제 프레임 속도를 따른다.
 * 이렇게 해야 모니터 주사율(60/120/144Hz)이나 프레임 드랍과 무관하게
 * 밸런스가 동일하게 유지된다. 배속(x2, x3)은 한 프레임에 시뮬레이션 스텝을
 * 여러 번 도는 것으로 구현한다.
 */
export const FIXED_DT = 1 / 60

/** 탭 전환 등으로 프레임이 길게 밀렸을 때 따라잡기 폭주를 막는 상한. */
const MAX_FRAME_TIME = 0.25

export interface LoopHandlers {
  /** 시뮬레이션 1스텝. dt는 항상 FIXED_DT. */
  update(dt: number): void
  /** 렌더링. alpha는 마지막 스텝 이후 보간 계수(0~1). */
  render(alpha: number): void
}

export class GameLoop {
  private accumulator = 0
  private lastTime = 0
  private rafId = 0
  private running = false

  /** 시뮬레이션 배속. 0이면 일시정지. */
  timeScale = 1

  constructor(private readonly handlers: LoopHandlers) {}

  start(): void {
    if (this.running) return
    this.running = true
    this.lastTime = performance.now()
    this.accumulator = 0
    this.rafId = requestAnimationFrame(this.tick)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.rafId)
  }

  private tick = (now: number): void => {
    if (!this.running) return
    this.rafId = requestAnimationFrame(this.tick)

    let frameTime = (now - this.lastTime) / 1000
    this.lastTime = now
    if (frameTime > MAX_FRAME_TIME) frameTime = MAX_FRAME_TIME

    this.accumulator += frameTime * this.timeScale

    // 배속이 높아도 한 프레임에 도는 스텝 수를 제한해 스파이럴을 막는다.
    let steps = 0
    const maxSteps = Math.max(1, Math.ceil(this.timeScale) * 8)
    while (this.accumulator >= FIXED_DT && steps < maxSteps) {
      this.handlers.update(FIXED_DT)
      this.accumulator -= FIXED_DT
      steps++
    }
    if (steps >= maxSteps) this.accumulator = 0

    this.handlers.render(this.accumulator / FIXED_DT)
  }
}
