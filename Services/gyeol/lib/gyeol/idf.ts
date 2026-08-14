/**
 * 조건 키워드별 IDF를 낸다.
 *
 * 균등 가중을 주면 흔한 키워드로 만든 결이 희귀한 키워드로 만든 결을 이긴다.
 * `murder`·`revenge`는 카탈로그에 널려 있고 `whistleblower`·`concert`는 드물어서,
 * 스펙 작성 시 측정에서 「화가 나는 결」과 「소리에 약한 결」이 한 번도 1위를
 * 못 했다. IDF를 넣자 25개가 전부 등장했다.
 *
 * `+1` 보정은 df가 0인 키워드에서 0으로 나누기를 막는다.
 * 마지막 `+ 1`은 바닥이다. 모든 작품이 가진 키워드는 log(1)=0이 되어 점수에서
 * 사라지는데, 조건에 맞았다는 사실 자체에는 최소 점수를 줘야 한다.
 *
 * @param vocabularySize 어휘 길이
 * @param workKeywordIndices 작품별 조건 키워드 인덱스 목록
 */
export function computeIdf(vocabularySize: number, workKeywordIndices: number[][]): number[] {
  const df = new Array<number>(vocabularySize).fill(0)
  for (const indices of workKeywordIndices) {
    for (const index of new Set(indices)) {
      if (index >= 0 && index < vocabularySize) df[index] += 1
    }
  }
  const total = workKeywordIndices.length
  return df.map((count) => Math.log((total + 1) / (count + 1)) + 1)
}
