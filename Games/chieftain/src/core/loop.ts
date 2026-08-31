/**
 * 고정 타임스텝 게임 루프.
 *
 * 시뮬레이션은 항상 1/60초 단위로 돌리고 렌더링만 실제 프레임 속도를 따른다.
 * 모니터 주사율이나 프레임 드랍과 무관하게 같은 전개가 나와야 하기 때문이다.
 *
 * 이건 취향이 아니라 **PvP를 위한 준비다**(GDD 7.2). 나중에 결정론적 락스텝을
 * 얹으려면 "같은 입력이면 같은 결과"가 성립해야 하고, 그러려면 dt가 프레임마다
 * 흔들려서는 안 된다. 지금 PvP가 없다고 가변 dt로 짜두면 그때 전부 뜯어야 한다.
 */
export const FIXED_DT = 1 / 60

/**
 * 탭 전환 등으로 프레임이 길게 밀렸을 때 따라잡기 폭주를 막는 상한.
 *
 * **렌더 쪽 시계도 같은 상한을 써야 한다.** 시뮬레이션만 막아 두면, 한 프레임이
 * 3초 밀렸을 때 시뮬은 0.25초어치만 따라잡는데 카메라는 3초어치를 한 번에 밀어
 * 판 반대편으로 순간이동한다. 그래서 여기서 내보낸다.
 */
export const MAX_FRAME_TIME = 0.25

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

  /** 0이면 일시정지. */
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
    while (this.accumulator >= FIXED_DT) {
      this.handlers.update(FIXED_DT)
      this.accumulator -= FIXED_DT
    }

    this.handlers.render(this.accumulator / FIXED_DT)
  }
}
