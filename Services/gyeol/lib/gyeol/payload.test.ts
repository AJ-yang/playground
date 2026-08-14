// lib/gyeol/payload.test.ts
import { describe, expect, it } from 'vitest'
import { decodePicks, encodePicks, type PickRef } from './payload'

const PICKS: PickRef[] = [
  { i: 496243, m: 0 },
  { i: 93405, m: 1 },
  { i: 1, m: 0 },
]

describe('encodePicks / decodePicks', () => {
  it('넣은 것이 그대로 나온다', () => {
    expect(decodePicks(encodePicks(PICKS))).toEqual(PICKS)
  })

  it('URL에 그대로 실을 수 있는 문자만 쓴다', () => {
    expect(encodePicks(PICKS)).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('30편이 200자를 넘지 않는다', () => {
    const many = Array.from({ length: 30 }, (_, n) => ({ i: 900000 + n, m: (n % 2) as 0 | 1 }))
    expect(encodePicks(many).length).toBeLessThanOrEqual(200)
  })

  it('빈 선택도 왕복한다', () => {
    expect(decodePicks(encodePicks([]))).toEqual([])
  })

  it('망가진 입력에 null을 낸다', () => {
    // 사용자가 URL을 고칠 수 있다. 던지면 결과 화면이 죽는다.
    expect(decodePicks('!!!not base64!!!')).toBeNull()
  })

  it('잘린 varint에 null을 낸다', () => {
    // 마지막 바이트의 continuation 비트가 켜진 채 끝나면 불완전한 것이다.
    // 496243은 varint 3바이트라 마지막 바이트를 떼면 continuation이 켜진 채 끝난다.
    const full = encodePicks([{ i: 496243, m: 0 }])
    const bytes = atob(full.replace(/-/g, '+').replace(/_/g, '/'))
    const truncated = btoa(bytes.slice(0, -1)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(decodePicks(truncated)).toBeNull()
  })

  it('큰 TMDB id도 담는다', () => {
    const big: PickRef[] = [{ i: 9999999, m: 1 }]
    expect(decodePicks(encodePicks(big))).toEqual(big)
  })

  it('순서를 보존한다', () => {
    const decoded = decodePicks(encodePicks(PICKS))!
    expect(decoded.map((p) => p.i)).toEqual([496243, 93405, 1])
  })
})
