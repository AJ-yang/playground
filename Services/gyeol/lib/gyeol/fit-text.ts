/**
 * 한 줄이 폭에 들어가도록 글자 크기를 줄인다.
 *
 * 카드의 결 이름과 캐치프레이즈는 **줄바꿈하면 안 된다.** 두 줄이 되는 순간
 * 아래 요소가 전부 밀려 링크를 덮는다. 대신 글자를 줄여 한 줄을 지킨다.
 *
 * 지금 25개 결에는 이 축소가 걸리지 않는다. 가장 긴 「마음이 늦게 도착하는 결」이
 * 78px에서 721px라 920px 안에 들어온다 — 한글 글리프는 폰트 크기보다 좁고
 * 공백은 더 좁아서, 글자 수에 폰트 크기를 곱한 어림짐작은 크게 빗나간다.
 * 그래도 문안은 바뀌는 것이라 방어장치로 남긴다.
 *
 * 최소 크기로도 안 들어가면 넘치게 둔다. 알아볼 수 없을 만큼 줄이느니 조금
 * 넘치는 편이 낫다.
 *
 * @param measure 그 크기로 그렸을 때의 폭을 재는 함수. canvas의 font를 바꿔가며
 *   `measureText`를 부르는 쪽을 넘긴다. 주입받는 이유는 노드에서 테스트하기
 *   위해서다.
 */
export function fitFontSize(
  maxWidth: number,
  maxSize: number,
  minSize: number,
  measure: (size: number) => number,
): number {
  for (let size = maxSize; size > minSize; size--) {
    if (measure(size) <= maxWidth) return size
  }
  return minSize
}
