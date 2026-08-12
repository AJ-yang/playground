import { STAGES, STARTING_TOWERS, type StageDef } from '../data/stages'
import { DEFAULT_DIFFICULTY, DIFFICULTIES, getDifficulty } from '../data/difficulty'

/**
 * 진행도 — 어떤 스테이지를 깼고 어떤 기물이 열렸는가.
 *
 * 저장소를 주입받는 이유: 헤드리스 시뮬레이터는 localStorage가 없는 Node에서
 * 돌고, 테스트는 매번 깨끗한 상태에서 시작해야 한다. 기본값만 브라우저의
 * localStorage를 쓰고, 그 외에는 메모리 저장소로 대체한다.
 */
export interface ProgressStorage {
  read(key: string): string | null
  write(key: string, value: string): void
}

const STORAGE_KEY = 'joseon-defense/progress/v1'

/** 메모리 저장소 — Node(시뮬레이터)와 테스트용. */
export function memoryStorage(): ProgressStorage {
  const map = new Map<string, string>()
  return {
    read: (k) => map.get(k) ?? null,
    write: (k, v) => void map.set(k, v),
  }
}

/** 브라우저 localStorage. 접근이 막혀 있으면(사생활 모드 등) 메모리로 조용히 대체한다. */
export function browserStorage(): ProgressStorage {
  try {
    const probe = '__kd_probe__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return {
      read: (k) => window.localStorage.getItem(k),
      write: (k, v) => window.localStorage.setItem(k, v),
    }
  } catch {
    return memoryStorage()
  }
}

interface Saved {
  cleared: string[]
  /**
   * 최고 기록 (클리어 시 남은 생명). 키는 `스테이지ID@난이도ID`.
   *
   * 난이도를 키에 넣는 이유: 쉬움에서 20을 남긴 것과 어려움에서 3을 남긴 것을
   * 같은 칸에 적으면 기록이 아무 의미가 없어진다. 반면 **해금(cleared)은
   * 난이도와 무관하게 공유한다** — 난이도는 진입 장벽이지 콘텐츠 잠금이 아니다.
   */
  bestLives: Record<string, number>
  /** 마지막으로 고른 난이도 */
  difficulty: string
}

export class Progress {
  private cleared = new Set<string>()
  private bestLives: Record<string, number> = {}
  /** 현재 선택된 난이도 ID. 판을 시작할 때 체력 배율로 쓰인다. */
  difficulty: string = DEFAULT_DIFFICULTY

  constructor(private readonly storage: ProgressStorage = memoryStorage()) {
    this.load()
  }

  private load(): void {
    const raw = this.storage.read(STORAGE_KEY)
    if (!raw) return
    try {
      const parsed = JSON.parse(raw) as Partial<Saved>
      // 저장된 ID 중 지금 존재하는 스테이지만 받아들인다 — 스테이지를 지우거나
      // 이름을 바꿨을 때 유령 진행도가 남지 않게.
      const valid = new Set(STAGES.map((s) => s.id))
      for (const id of parsed.cleared ?? []) if (valid.has(id)) this.cleared.add(id)
      for (const [key, lives] of Object.entries(parsed.bestLives ?? {})) {
        // 키는 `스테이지ID@난이도ID`. 스테이지 부분만 검증한다.
        const stageId = key.split('@')[0]!
        if (valid.has(stageId) && typeof lives === 'number') this.bestLives[key] = lives
      }
      if (parsed.difficulty && DIFFICULTIES.some((d) => d.id === parsed.difficulty)) {
        this.difficulty = parsed.difficulty
      }
    } catch {
      // 손상된 저장 데이터는 무시하고 처음부터 시작한다.
    }
  }

  private save(): void {
    const data: Saved = {
      cleared: [...this.cleared],
      bestLives: this.bestLives,
      difficulty: this.difficulty,
    }
    this.storage.write(STORAGE_KEY, JSON.stringify(data))
  }

  isCleared(stageId: string): boolean {
    return this.cleared.has(stageId)
  }

  /** 현재 난이도의 체력 배율. */
  get hpScale(): number {
    return getDifficulty(this.difficulty).hpScale
  }

  setDifficulty(id: string): void {
    if (!DIFFICULTIES.some((d) => d.id === id)) return
    this.difficulty = id
    this.save()
  }

  /** 지금 난이도에서의 최고 기록. 다른 난이도의 기록은 보여주지 않는다. */
  bestLivesFor(stageId: string): number | null {
    return this.bestLives[`${stageId}@${this.difficulty}`] ?? null
  }

  /**
   * 선형 해금: 첫 스테이지는 항상 열려 있고, 그 뒤는 바로 앞 스테이지를 깨야 열린다.
   */
  isUnlocked(stage: StageDef): boolean {
    const index = STAGES.indexOf(stage)
    if (index <= 0) return true
    return this.cleared.has(STAGES[index - 1]!.id)
  }

  /** 지금 건설할 수 있는 타워 목록. 클리어한 스테이지의 보상이 누적된다. */
  unlockedTowers(): string[] {
    const towers = [...STARTING_TOWERS]
    for (const stage of STAGES) {
      if (this.cleared.has(stage.id)) towers.push(...stage.unlocksTowers)
    }
    return towers
  }

  /**
   * 스테이지 클리어 기록. 이번에 새로 열린 기물 ID들을 반환한다.
   * 이미 깬 스테이지를 다시 깨면 기록만 갱신하고 빈 배열을 반환한다.
   */
  completeStage(stage: StageDef, livesLeft: number): string[] {
    const first = !this.cleared.has(stage.id)
    this.cleared.add(stage.id)
    const key = `${stage.id}@${this.difficulty}`
    const prev = this.bestLives[key] ?? -1
    if (livesLeft > prev) this.bestLives[key] = livesLeft
    this.save()
    return first ? [...stage.unlocksTowers] : []
  }

  /** 다음에 도전할 스테이지 (열려 있고 아직 못 깬 것). 전부 깼으면 null. */
  nextStage(): StageDef | null {
    for (const stage of STAGES) {
      if (this.isUnlocked(stage) && !this.cleared.has(stage.id)) return stage
    }
    return null
  }

  get clearedCount(): number {
    return this.cleared.size
  }

  /** 진행도 초기화 — 디버그·설정 메뉴용. */
  reset(): void {
    this.cleared.clear()
    this.bestLives = {}
    this.save()
  }
}
