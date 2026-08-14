import { describe, expect, it } from 'vitest'
import { buildVocabulary } from './vocabulary'
import type { Gyeol } from './types'
import { makeGyeol } from './gyeol.fixture'

const FIXTURE: Gyeol[] = [
  makeGyeol({ id: 'a', name: 'A', keywords: ['revenge', 'murder'], genres: ['범죄'] }),
  makeGyeol({ id: 'b', name: 'B', keywords: ['murder', 'police'], genres: ['미스터리'] }),
]

describe('buildVocabulary', () => {
  it('모든 결의 조건 키워드를 합집합으로 모은다', () => {
    expect(new Set(buildVocabulary(FIXTURE))).toEqual(new Set(['revenge', 'murder', 'police']))
  })

  it('중복을 제거한다', () => {
    const vocab = buildVocabulary(FIXTURE)
    expect(new Set(vocab).size).toBe(vocab.length)
  })

  it('순서가 결정적이다', () => {
    // 색인의 k가 이 배열의 인덱스를 가리키므로 순서가 흔들리면 색인이 통째로 어긋난다
    expect(buildVocabulary(FIXTURE)).toEqual(buildVocabulary(FIXTURE))
    expect(buildVocabulary(FIXTURE)).toEqual([...buildVocabulary(FIXTURE)].sort())
  })
})
