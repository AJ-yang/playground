import type { WaveDef } from '../data/waves'

/** 스폰 예약 1건 — 어떤 적이 어느 경로로 언제 나오는가. */
export interface PendingSpawn {
  enemy: string
  route: number
  /** 웨이브 시작 기준 스폰 시각 (초) */
  at: number
}

/**
 * 웨이브 스케줄러.
 *
 * "언제 무엇이 나오는가"만 담당하고 적을 직접 만들지는 않는다. Game이
 * drainDue()로 이번 스텝에 나와야 할 적 ID를 받아가는 구조라, 나중에
 * 무한 모드나 랜덤 웨이브 생성기를 붙일 때 이 클래스만 교체하면 된다.
 */
export class WaveManager {
  /** 현재(또는 다음) 웨이브 번호. 1부터 시작. */
  waveNumber = 1
  /** 웨이브 진행 중인가 */
  running = false
  /** 준비 시간 남은 초 */
  prepRemaining: number
  /** 현재 웨이브가 시작된 뒤 흐른 시간 */
  private elapsed = 0
  private queue: PendingSpawn[] = []
  private cursor = 0

  constructor(private readonly waves: readonly WaveDef[]) {
    if (waves.length === 0) throw new Error('웨이브가 하나도 없는 스테이지입니다')
    this.prepRemaining = waves[0]!.prepTime
  }

  get totalWaves(): number {
    return this.waves.length
  }

  get currentWave(): WaveDef {
    return this.waves[Math.min(this.waveNumber, this.waves.length) - 1]!
  }

  get isFinalWave(): boolean {
    return this.waveNumber >= this.waves.length
  }

  /** 모든 적을 다 뱉었는가 (아직 살아 있을 수는 있다). */
  get spawnFinished(): boolean {
    return this.cursor >= this.queue.length
  }

  /** 이번 웨이브 총 적 수 / 이미 나온 수 — HUD 진행바용. */
  get spawnProgress(): { spawned: number; total: number } {
    return { spawned: this.cursor, total: this.queue.length }
  }

  /**
   * 웨이브 시작. 준비 시간을 남기고 부른 경우 남은 초를 반환하므로
   * 호출부에서 조기 소환 보너스 골드를 계산할 수 있다.
   */
  start(): number {
    if (this.running) return 0
    const skipped = Math.max(0, this.prepRemaining)
    this.running = true
    this.elapsed = 0
    this.cursor = 0
    this.prepRemaining = 0
    this.queue = this.buildQueue(this.currentWave)
    return skipped
  }

  private buildQueue(wave: WaveDef): PendingSpawn[] {
    const spawns: PendingSpawn[] = []
    for (const group of wave.groups) {
      for (let i = 0; i < group.count; i++) {
        spawns.push({
          enemy: group.enemy,
          route: group.route,
          at: group.delay + i * group.interval,
        })
      }
    }
    spawns.sort((a, b) => a.at - b.at)
    return spawns
  }

  /**
   * 시간을 진행시키고, 이번 스텝에 스폰되어야 할 적 목록을 반환한다.
   * 준비 시간이 다 되면 웨이브를 자동으로 시작한다.
   */
  update(dt: number): PendingSpawn[] {
    if (!this.running) {
      this.prepRemaining -= dt
      if (this.prepRemaining <= 0) this.start()
      return []
    }

    this.elapsed += dt
    const due: PendingSpawn[] = []
    while (this.cursor < this.queue.length && this.queue[this.cursor]!.at <= this.elapsed) {
      due.push(this.queue[this.cursor]!)
      this.cursor++
    }
    return due
  }

  /** 웨이브 클리어 처리. 다음 웨이브 준비 상태로 넘어간다. */
  completeWave(): void {
    this.running = false
    this.waveNumber++
    if (this.waveNumber <= this.waves.length) {
      this.prepRemaining = this.currentWave.prepTime
    } else {
      this.prepRemaining = 0
    }
  }

  reset(): void {
    this.waveNumber = 1
    this.running = false
    this.elapsed = 0
    this.cursor = 0
    this.queue = []
    this.prepRemaining = this.waves[0]!.prepTime
  }
}
