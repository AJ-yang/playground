/**
 * 배포 주소를 한 군데서만 정한다.
 *
 * 공유 카드와 OG 이미지에는 **사람이 눈으로 읽고 손으로 치는 주소가 그림으로**
 * 박힌다. 그림 속 글자라 타입 검사에도 테스트에도 안 걸린다. 예전에는 이 주소가
 * 세 파일에 문자열로 따로 적혀 있었고, 배포를 playground로 옮길 때 셋 다 옛
 * 주소를 가리킨 채로 남을 뻔했다.
 *
 * 값은 `next.config.ts`가 빌드 때 `PAGES_SITE_URL`에서 받아 넣는다. 배포 주소는
 * 빌드 시점에 정해지므로(`basePath`도 마찬가지다) 런타임에 읽을 것이 없다.
 */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3100'

/**
 * 카드에 인쇄할 주소. 스킴을 뗀다 — 클릭하는 링크가 아니라 받아 적는 글자라
 * `https://`가 붙으면 자리만 먹는다.
 */
export const SITE_LABEL = SITE_URL.replace(/^https?:\/\//, '').replace(/\/+$/, '')

export { SITE_URL }
