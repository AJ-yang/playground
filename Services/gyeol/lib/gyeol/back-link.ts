/**
 * 이웃 결을 구경하다가 돌아올 자리.
 *
 * 결 소개 페이지는 `?p=`가 없어야 소개로 뜬다. 그래서 이웃으로 넘어가는 순간
 * 원래 선택이 주소에서 사라지고, 뒤로가기 말고는 돌아올 길이 없어진다. 선택을
 * 다른 이름으로 들고 다니게 해서 어디까지 돌아다니든 자기 결과로 돌아오게 한다.
 */
export type ReturnTo = { gyeolId: string; payload: string }

/** 이웃 결로 가는 주소. 돌아갈 자리를 함께 싣는다. */
export function neighbourHref(targetId: string, back: ReturnTo | null): string {
  if (back === null) return `/r/${targetId}/`
  const query = new URLSearchParams({ from: back.gyeolId, fp: back.payload })
  return `/r/${targetId}/?${query}`
}

/** 원래 결과로 돌아가는 주소. */
export function returnHref(back: ReturnTo): string {
  return `/r/${back.gyeolId}/?p=${back.payload}`
}

/**
 * 주소에서 돌아갈 자리를 읽는다.
 *
 * 둘 중 하나만 있으면 없는 것으로 본다. 반쪽짜리로 링크를 만들면 눌렀을 때
 * 빈 결과 화면이 뜨는데, 그건 돌아갈 길이 없는 것보다 나쁘다.
 */
export function readReturn(params: URLSearchParams): ReturnTo | null {
  const gyeolId = params.get('from')
  const payload = params.get('fp')
  if (!gyeolId || !payload) return null
  return { gyeolId, payload }
}

/**
 * 앱 안의 경로를 공유 가능한 완전한 주소로 만든다.
 *
 * `navigator.share`에 넘기려면 상대 경로로는 안 된다. 받는 쪽에서 누를 수 있는
 * 주소여야 하므로 출처와 basePath를 앞에 붙인다.
 *
 * 슬래시가 겹치지 않게 다듬는다. `https://a.io/` + `/gyeol/`이 그대로 이어지면
 * `//r/...`이 되어 링크가 죽는다.
 */
export function absoluteHref(origin: string, basePath: string, path: string): string {
  const base = `${origin.replace(/\/+$/, '')}/${basePath.replace(/^\/+|\/+$/g, '')}`
  return `${base.replace(/\/+$/, '')}${path}`
}

/** 공유에 실을 결과 주소. */
export function absoluteResultHref(origin: string, basePath: string, back: ReturnTo): string {
  return absoluteHref(origin, basePath, returnHref(back))
}
