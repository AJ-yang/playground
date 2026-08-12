import type { Vec2 } from '../core/vec2'

export type TileKind = 'buildable' | 'path' | 'blocked'

/**
 * 타일 격자. 어디에 지을 수 있는지, 어디에 이미 타워가 있는지를 관리한다.
 * 픽셀 ↔ 타일 좌표 변환의 단일 창구 역할도 겸한다.
 */
export class Grid {
  readonly tiles: TileKind[]
  /** 타일 인덱스 → 타워 ID. 비어 있으면 undefined. */
  private readonly occupants = new Map<number, number>()

  constructor(
    readonly cols: number,
    readonly rows: number,
    readonly tileSize: number,
  ) {
    this.tiles = new Array(cols * rows).fill('buildable')
  }

  index(col: number, row: number): number {
    return row * this.cols + col
  }

  inBounds(col: number, row: number): boolean {
    return col >= 0 && col < this.cols && row >= 0 && row < this.rows
  }

  setKind(col: number, row: number, kind: TileKind): void {
    if (!this.inBounds(col, row)) return
    this.tiles[this.index(col, row)] = kind
  }

  kindAt(col: number, row: number): TileKind | null {
    if (!this.inBounds(col, row)) return null
    return this.tiles[this.index(col, row)]!
  }

  /** 타워를 새로 지을 수 있는 타일인가. */
  canBuild(col: number, row: number): boolean {
    if (!this.inBounds(col, row)) return false
    if (this.tiles[this.index(col, row)] !== 'buildable') return false
    return !this.occupants.has(this.index(col, row))
  }

  towerIdAt(col: number, row: number): number | undefined {
    if (!this.inBounds(col, row)) return undefined
    return this.occupants.get(this.index(col, row))
  }

  occupy(col: number, row: number, towerId: number): void {
    this.occupants.set(this.index(col, row), towerId)
  }

  vacate(col: number, row: number): void {
    this.occupants.delete(this.index(col, row))
  }

  /** 타일 중심의 픽셀 좌표 (보드 로컬 좌표계). */
  center(col: number, row: number): Vec2 {
    return { x: (col + 0.5) * this.tileSize, y: (row + 0.5) * this.tileSize }
  }

  /** 보드 로컬 픽셀 좌표 → 타일 좌표. 범위 밖이면 null. */
  tileAt(x: number, y: number): Vec2 | null {
    const col = Math.floor(x / this.tileSize)
    const row = Math.floor(y / this.tileSize)
    return this.inBounds(col, row) ? { x: col, y: row } : null
  }

  get widthPx(): number {
    return this.cols * this.tileSize
  }

  get heightPx(): number {
    return this.rows * this.tileSize
  }
}
