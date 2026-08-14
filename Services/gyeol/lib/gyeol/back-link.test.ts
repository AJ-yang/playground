import { describe, expect, it } from 'vitest'
import { absoluteResultHref, neighbourHref, readReturn, returnHref, type ReturnTo } from './back-link'

const mine: ReturnTo = { gyeolId: 'sound', payload: 'AbC-_123' }

describe('neighbourHref', () => {
  it('돌아갈 곳을 달고 이웃 결로 간다', () => {
    expect(neighbourHref('bicker', mine)).toBe('/r/bicker/?from=sound&fp=AbC-_123')
  })

  it('돌아갈 곳이 없으면 그냥 이웃 결로 간다', () => {
    expect(neighbourHref('bicker', null)).toBe('/r/bicker/')
  })

  it('인코딩을 거쳐도 원래 값이 그대로 돌아온다', () => {
    // 정확한 인코딩 형태(+ 냐 %20 이냐)는 중요하지 않다. 읽었을 때 같은 값이
    // 나오는지가 중요하다 — 여기가 깨지면 돌아가는 길이 통째로 죽는다.
    const back = { gyeolId: 'b', payload: 'x y&z=?' }
    const href = neighbourHref('a', back)
    expect(readReturn(new URLSearchParams(href.split('?')[1]))).toEqual(back)
  })
})

describe('returnHref', () => {
  it('원래 결과 주소를 되살린다', () => {
    expect(returnHref(mine)).toBe('/r/sound/?p=AbC-_123')
  })
})

describe('readReturn', () => {
  const params = (q: string) => new URLSearchParams(q)

  it('주소에서 돌아갈 곳을 읽는다', () => {
    expect(readReturn(params('from=sound&fp=AbC'))).toEqual({ gyeolId: 'sound', payload: 'AbC' })
  })

  it('둘 중 하나만 있으면 없는 것으로 본다', () => {
    // 반쪽짜리로 돌아가는 링크를 만들면 눌렀을 때 빈 결과가 뜬다.
    expect(readReturn(params('from=sound'))).toBeNull()
    expect(readReturn(params('fp=AbC'))).toBeNull()
  })

  it('아무것도 없으면 null이다', () => {
    expect(readReturn(params(''))).toBeNull()
  })

  it('빈 값은 없는 것으로 본다', () => {
    expect(readReturn(params('from=&fp=AbC'))).toBeNull()
  })
})

describe('absoluteResultHref', () => {
  it('출처와 basePath를 붙여 완전한 주소를 만든다', () => {
    expect(absoluteResultHref('https://aj-yang.github.io', '/gyeol', mine)).toBe(
      'https://aj-yang.github.io/gyeol/r/sound/?p=AbC-_123',
    )
  })

  it('basePath가 없으면 그대로 붙인다', () => {
    expect(absoluteResultHref('http://localhost:3100', '', mine)).toBe(
      'http://localhost:3100/r/sound/?p=AbC-_123',
    )
  })

  it('슬래시가 겹치지 않는다', () => {
    // 겹치면 //r/... 이 되어 링크가 죽는다.
    expect(absoluteResultHref('https://a.io/', '/gyeol/', mine)).toBe(
      'https://a.io/gyeol/r/sound/?p=AbC-_123',
    )
  })
})
