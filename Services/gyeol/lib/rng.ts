/**
 * mulberry32. 32비트 정수 시드로 결정론적 [0,1) 수열을 낸다.
 *
 * 소수 시드를 거부하는 이유: `>>> 0`은 소수부를 잘라내므로 `Math.random()`을 그대로
 * 넘기면 모든 세션이 시드 0으로 붕괴해 전원이 같은 문항을 받는다. 조용히 무너지는 대신
 * 개발 시점에 터지게 한다. 호출자는 `Math.floor(Math.random() * 2 ** 31)`을 넘겨야 한다.
 */
export function makeRng(seed: number): () => number {
  if (!Number.isInteger(seed)) {
    throw new TypeError(`makeRng seed must be an integer, got ${seed}`)
  }
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function seededShuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
