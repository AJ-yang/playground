'use client'

import { useEffect, useState } from 'react'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

/** 빌드 때 구운 `public/providers.json`. 제공처 10여 종이라 1KB도 안 된다. */
export type ProviderMap = {
  /** 데이터를 받은 달. "2026-08" 형태 */
  at: string
  list: Record<string, { n: string; l: string }>
}

let cached: Promise<ProviderMap | null> | null = null

function load(): Promise<ProviderMap | null> {
  cached ??= fetch(`${BASE}/providers.json`)
    .then((response) => {
      if (!response.ok) throw new Error(String(response.status))
      return response.json() as Promise<ProviderMap>
    })
    .catch(() => {
      // 실패를 캐시에 남기면 다시 열어도 영영 안 뜬다.
      cached = null
      return null
    })
  return cached
}

/**
 * 구독 제공처 이름과 로고.
 *
 * 작품 상세를 열 때만 받는다. 제공처 목록은 작품 수와 무관하게 10여 종이라
 * 한 번 받으면 끝이다.
 */
export function useProviders(enabled: boolean) {
  const [map, setMap] = useState<ProviderMap | null>(null)

  useEffect(() => {
    if (!enabled) return
    let alive = true
    load().then((data) => {
      if (alive) setMap(data)
    })
    return () => {
      alive = false
    }
  }, [enabled])

  return map
}

/**
 * 화면에 보여줄 구독 서비스.
 *
 * TMDB는 한국 지역으로 19종을 주는데, 그중 Artify(2편)·Dekkoo(1편)·Cultpix(17편)
 * 같은 것은 국내에서 쓰는 사람이 거의 없다. "Artify에서 볼 수 있어요"는 도움이
 * 되기는커녕 목록만 어지럽힌다.
 *
 * **데이터가 아니라 화면에서 거른다.** 목록을 바꿀 때마다 12,595편을 다시
 * 받으면 20분이 걸리는데, 여기서 거르면 그럴 필요가 없다.
 *
 * 이 목록에 없는 곳에만 있는 작품은 1.8%(120편)이고, 그런 작품은 제공처 줄이
 * 통째로 안 뜬다 — 모르는 서비스 이름 하나보다 아무것도 없는 편이 낫다.
 */
const SHOWN = new Set([
  'Netflix',
  'Watcha',
  'wavve',
  'TVING',
  'Disney Plus',
  'Coupang Play',
  'Apple TV',
  'Amazon Prime Video',
  'Crunchyroll',
  'laftel',
  'MUBI',
])

/** 보여줄 만한 제공처만 남긴다. 남는 것이 없으면 빈 배열이다. */
export function shownProviders(
  ids: number[] | undefined,
  map: ProviderMap | null,
): { id: number; name: string; logo: string }[] {
  if (ids === undefined || map === null) return []
  return ids
    .map((id) => ({ id, entry: map.list[String(id)] }))
    .filter((x) => x.entry !== undefined && SHOWN.has(x.entry.n))
    .map((x) => ({ id: x.id, name: x.entry.n, logo: x.entry.l }))
}

/** "2026-08" → "2026년 8월". 낡아도 거짓말이 되지 않게 화면에 같이 적는다. */
export function formatMonth(at: string): string {
  const [year, month] = at.split('-')
  if (!year || !month) return at
  return `${year}년 ${Number(month)}월`
}
