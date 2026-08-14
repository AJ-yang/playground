// lib/gyeol/catalog-order.test.ts
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Catalog } from './types'

/**
 * 그리드는 "ko/m으로 필터하면 앞쪽이 인지도 상위"라는 성질에 의존한다.
 * 색인을 다시 구울 때 수집 순서가 바뀌면 그리드가 조용히 무명작으로 채워진다.
 * 이 실패는 화면을 열어보기 전까지 안 드러나므로 여기서 잠근다.
 */
const PATH = 'public/catalog.json'
const missing = !existsSync(PATH)

describe.skipIf(missing)('색인 순서', () => {
  const catalog = missing ? null : (JSON.parse(readFileSync(PATH, 'utf8')) as Catalog)

  it('네 그룹이 끊기지 않고 이어 붙어 있다', () => {
    // 그룹이 섞이면 filter 결과의 앞쪽이 인지도 상위가 아니게 된다
    const seen = new Set<string>()
    let previous = ''
    for (const work of catalog!.works) {
      const key = `${work.ko}/${work.m}`
      if (key !== previous) {
        expect(seen.has(key), `그룹 ${key}가 두 번 나타난다`).toBe(false)
        seen.add(key)
        previous = key
      }
    }
    expect(seen.size).toBe(4)
  })

  it('각 그룹의 첫 작품이 그 그룹에서 가장 유명하다', () => {
    // vote_count.desc로 수집했으므로 익히 아는 작품이 와야 한다
    const first = (ko: 0 | 1, m: 0 | 1) => catalog!.works.find((w) => w.ko === ko && w.m === m)!.t
    expect(first(1, 0)).toBe('기생충')
    expect(first(1, 1)).toBe('오징어 게임')
    expect(first(0, 0)).toBe('인터스텔라')
  })

  it('네 그룹이 모두 그리드를 채울 만큼 있다', () => {
    for (const ko of [0, 1] as const) {
      for (const m of [0, 1] as const) {
        const count = catalog!.works.filter((w) => w.ko === ko && w.m === m).length
        expect(count, `ko=${ko} m=${m}`).toBeGreaterThanOrEqual(100)
      }
    }
  })
})
