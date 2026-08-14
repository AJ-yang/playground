import { describe, expect, it } from 'vitest'
import { fitFontSize } from './fit-text'

/** 글자 하나가 글자 크기만큼의 폭을 차지한다고 보는 가짜 측정기. */
const measurer = (text: string) => (size: number) => text.length * size

describe('fitFontSize', () => {
  it('그대로 들어가면 가장 큰 크기를 쓴다', () => {
    // 5자 × 78px = 390 ≤ 920
    expect(fitFontSize(920, 78, 40, measurer('다섯자입니다'.slice(0, 5)))).toBe(78)
  })

  it('폭을 넘으면 들어갈 때까지 줄인다', () => {
    // 13자 × 78 = 1014 > 920. 13자 × 70 = 910 ≤ 920이라 70이어야 한다.
    const size = fitFontSize(920, 78, 40, measurer('마음이 늦게 도착하는 결'))
    expect(size).toBe(70)
  })

  it('줄여도 안 들어가면 최소 크기에서 멈춘다', () => {
    // 던지거나 0을 내면 글자가 사라진다. 조금 넘치더라도 그려야 한다.
    expect(fitFontSize(100, 78, 40, measurer('아주아주아주아주긴이름입니다'))).toBe(40)
  })

  it('최소 크기가 딱 맞으면 그 값을 낸다', () => {
    // 경계에서 한 칸 더 내려가 minSize 아래로 새지 않는지 본다.
    expect(fitFontSize(400, 78, 40, measurer('열자입니다열자입니다'))).toBe(40)
  })

  it('빈 문자열도 던지지 않는다', () => {
    expect(fitFontSize(920, 78, 40, measurer(''))).toBe(78)
  })
})
