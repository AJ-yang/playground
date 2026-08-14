/**
 * 궁합 페이지가 쓰는 주소들.
 *
 * 두 사람의 선택이 모두 질의 문자열에 담긴다. 서버도 저장소도 없으므로 링크
 * 자체가 유일한 전달 수단이다 — 주소가 곧 데이터다.
 *
 * 40편 기준 한쪽이 약 214자라 둘이면 430자 남짓이다. 카카오톡 링크로 문제없는
 * 길이지만, 여기에 더 얹을 것이 생기면 길이를 먼저 재봐야 한다.
 */

/**
 * 친구를 부르는 링크. 내 선택만 담는다.
 *
 * 받은 사람은 여기서 자기 결을 만들고, 그 끝에서 둘이 합쳐진 주소로 간다.
 */
export function inviteHref(mine: string): string {
  return `/vs/?a=${mine}`
}

/** 둘이 다 모인 궁합 주소. */
export function matchUpHref(a: string, b: string): string {
  return `/vs/?a=${a}&b=${b}`
}

/**
 * 친구 선택을 들고 고르러 가는 주소.
 *
 * 고르는 동안 상대의 선택을 잃지 않아야 결과에서 곧장 궁합으로 갈 수 있다.
 * 잃어버리면 다 골라놓고 링크를 다시 받아와야 한다.
 */
export function pickWithVsHref(theirs: string): string {
  return `/pick/?vs=${theirs}`
}
