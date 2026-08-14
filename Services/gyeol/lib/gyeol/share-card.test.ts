import { describe, expect, it } from 'vitest'
import { CARD_FORMATS, maxPosters } from './share-card'

describe('CARD_FORMATS', () => {
  it('규격 이름이 실제 비율과 맞는다', () => {
    // 이름표가 거짓이면 인스타 스토리에 올렸을 때 띠가 남는다. 값을 고칠 때
    // 이름표를 같이 안 고치는 일이 잦아서 여기서 묶어둔다.
    const ratio = (key: keyof typeof CARD_FORMATS) =>
      CARD_FORMATS[key].width / CARD_FORMATS[key].height

    expect(CARD_FORMATS.chat.label).toBe('4:5')
    expect(ratio('chat')).toBeCloseTo(4 / 5)

    expect(CARD_FORMATS.story.label).toBe('9:16')
    expect(ratio('story')).toBeCloseTo(9 / 16)
  })

  it('두 규격의 폭이 같다', () => {
    // 폭이 갈리는 순간 여백·포스터 크기·비율 막대를 규격마다 따로 계산해야
    // 한다. 지금 그리기 코드는 폭이 하나라는 전제 위에 있다.
    expect(CARD_FORMATS.story.width).toBe(CARD_FORMATS.chat.width)
  })

  it('세로가 긴 규격에만 결정적인 한 편을 싣는다', () => {
    // 4:5는 막대와 포스터를 넣고 나면 자리가 없다. 끼우면 링크를 덮는다.
    expect(CARD_FORMATS.chat.showsDecisive).toBe(false)
    expect(CARD_FORMATS.story.showsDecisive).toBe(true)
  })

  it('규격마다 파일 이름이 다르다', () => {
    // 같은 이름이면 두 규격을 다 내려받았을 때 하나가 덮인다.
    expect(CARD_FORMATS.story.fileName).not.toBe(CARD_FORMATS.chat.fileName)
  })
})

describe('maxPosters', () => {
  it('줄 수에 비례해 늘어난다', () => {
    expect(maxPosters(CARD_FORMATS.chat)).toBe(12)
    expect(maxPosters(CARD_FORMATS.story)).toBe(18)
  })
})
