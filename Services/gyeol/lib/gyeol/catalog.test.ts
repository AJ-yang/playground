import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GYEOL_TYPES } from '../../data/gyeol-types'
import { matchGyeol } from './match'
import { buildVocabulary } from './vocabulary'
import type { Catalog } from './types'

/**
 * 합성 픽스처가 아니라 실제로 배포되는 public/catalog.json을 검증한다.
 *
 * 다른 테스트는 작은 픽스처를 쓰기 때문에 실제 색인이 성겨져 결이 뭉개지는
 * 상황을 잡지 못한다. 이 실패는 조용해서, 색인을 다시 구울 때마다 여기서
 * 걸리지 않으면 아무도 눈치채지 못한다.
 *
 * 색인은 gitignore 대상이라 클론 직후에는 없다. 그때는 건너뛴다.
 */
const PATH = 'public/catalog.json'
const missing = !existsSync(PATH)

describe.skipIf(missing)('public/catalog.json', () => {
  const catalog = missing ? null : (JSON.parse(readFileSync(PATH, 'utf8')) as Catalog)

  it('어휘가 결 조건과 일치한다', () => {
    // 어긋나면 CatalogEntry.k가 통째로 다른 키워드를 가리킨다
    expect(catalog!.vocabulary).toEqual(buildVocabulary(GYEOL_TYPES))
  })

  it('idf가 어휘와 같은 길이다', () => {
    expect(catalog!.idf).toHaveLength(catalog!.vocabulary.length)
  })

  it('모든 idf가 유한한 양수다', () => {
    // NaN이나 Infinity가 하나만 섞여도 매칭 점수 전체가 오염된다
    for (const value of catalog!.idf) {
      expect(Number.isFinite(value)).toBe(true)
      expect(value).toBeGreaterThan(0)
    }
  })

  it('모든 작품이 포스터를 가진다', () => {
    for (const work of catalog!.works) {
      expect(work.p, work.t).toMatch(/^\S+\.(jpg|png|webp)$/)
    }
  })

  it('조건 키워드 인덱스가 어휘 범위 안이다', () => {
    const max = catalog!.vocabulary.length
    for (const work of catalog!.works) {
      for (const index of work.k) expect(index, work.t).toBeLessThan(max)
    }
  })

  it('한국 작품이 900편 이상이다', () => {
    // 단일 하한 300을 쓰면 194편으로 줄어 한국 사용자에게 그리드를 못 깐다
    expect(catalog!.works.filter((w) => w.ko === 1).length).toBeGreaterThanOrEqual(900)
  })

  it('조건 키워드를 가진 작품이 절반을 넘는다', () => {
    // 이 아래로 떨어지면 결이 장르 보정만으로 갈려 결과가 뭉개진다
    const matched = catalog!.works.filter((w) => w.k.length > 0).length
    expect(matched / catalog!.works.length).toBeGreaterThan(0.5)
  })

  it('25개 결이 전부 최소 30편에는 걸린다', () => {
    // 스펙 12절의 미해결 항목. 표본의 한국 비중이 48%라 한국 특화 결
    // (옛 옷을 입은, 계단을 오르내리는)이 과대평가됐을 수 있다.
    for (const gyeol of GYEOL_TYPES) {
      const hits = catalog!.works.filter(
        (work) => matchGyeol([work], catalog!, [gyeol])[0].score > 0,
      ).length
      expect(hits, gyeol.id).toBeGreaterThanOrEqual(30)
    }
  })
})
