import type { Gyeol } from './types'

/**
 * 테스트용 결을 만든다.
 *
 * 매칭·대결·후보 선정은 `keywords`와 `genres`만 본다. 카드에만 쓰이는
 * `emoji`·`hue`·`catchphrase`까지 테스트마다 적으면 무엇이 실제 검증 대상인지
 * 가려진다. 기본값을 여기서 채우고, 그 값이 결과에 영향을 주는 테스트만
 * 명시적으로 덮어쓴다.
 */
export function makeGyeol(partial: Partial<Gyeol> & Pick<Gyeol, 'id'>): Gyeol {
  return {
    name: partial.id,
    description: '설명'.repeat(20),
    catchphrase: '한 줄',
    essay: ['해설'],
    signs: ['순간'],
    emoji: '🎬',
    hue: 0,
    keywords: [],
    genres: [],
    ...partial,
  }
}
