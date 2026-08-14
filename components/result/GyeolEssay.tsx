'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { neighbourHref, type ReturnTo } from '@/lib/gyeol/back-link'
import { GYEOL_TYPES } from '@/data/gyeol-types'
import type { Gyeol } from '@/lib/gyeol/types'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

/** 결마다 가까운 결 id 목록. 빌드 때 구워둔 `public/nearby.json`이다. */
type NearbyMap = Record<string, string[]>

/** 한 번 받으면 다시 받지 않는다. 1KB지만 접었다 펼 때마다 요청할 이유가 없다. */
let cached: Promise<NearbyMap> | null = null

function loadNearby(): Promise<NearbyMap> {
  cached ??= fetch(`${BASE}/nearby.json`)
    .then((response) => {
      if (!response.ok) throw new Error(String(response.status))
      return response.json() as Promise<NearbyMap>
    })
    .catch(() => {
      // 실패를 캐시에 남기면 다시 펼쳐도 영영 안 뜬다.
      cached = null
      return {} as NearbyMap
    })
  return cached
}

function tone(hue: number, lightness: number): string {
  return `hsl(${hue}, 72%, ${lightness}%)`
}

/** 해설에 실을 결 하나. `percent`는 결과 화면에서만 있다. */
export type EssayEntry = { gyeol: Gyeol; percent?: number }

/** 결 하나의 해설 본문. 순위마다 같은 형식으로 반복된다. */
function Entry({ entry, rank, showRank }: { entry: EssayEntry; rank: number; showRank: boolean }) {
  const { gyeol, percent } = entry

  return (
    <div>
      {showRank && (
        <div className="mb-3 flex items-baseline gap-2.5">
          <span
            className="rounded-full px-2.5 py-1 text-xs font-bold"
            style={{ backgroundColor: `hsla(${gyeol.hue}, 72%, 32%, 1)` }}
          >
            {rank}위
          </span>
          <span className="break-keep font-bold">
            {gyeol.emoji} {gyeol.name}
          </span>
          {percent !== undefined && (
            <span className="ml-auto shrink-0 text-sm tabular-nums text-neutral-400">{percent}%</span>
          )}
        </div>
      )}

      {gyeol.essay.map((paragraph) => (
        <p key={paragraph} className="mb-3 break-keep leading-relaxed text-neutral-300">
          {paragraph}
        </p>
      ))}

      <h3 className="mt-5 mb-2.5 text-sm font-bold text-neutral-400">이런 순간에 반응해요</h3>
      <ul className="space-y-2">
        {gyeol.signs.map((sign) => (
          <li key={sign} className="flex gap-2.5 break-keep text-sm text-neutral-300">
            <span aria-hidden style={{ color: tone(gyeol.hue, 68) }}>
              ·
            </span>
            {sign}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * 결 해설. 더 자세히 보고 싶은 사람을 위한 부분이다.
 *
 * **상위 세 결을 모두 싣는다.** 결과 화면은 비율 막대로 세 결을 보여주는데
 * 해설은 1위만 나오면 나머지 둘이 무슨 결인지 알 방법이 없었다. 2·3위도
 * 자기 취향의 일부라 읽을 이유가 있다.
 *
 * 결과 화면에서는 접어 둔다. 결과를 확인하러 온 사람에게 긴 글을 먼저 내밀면
 * 추천과 공유 버튼이 화면 밖으로 밀리기 때문이다. 결 소개 페이지(`?p=` 없이
 * 들어온 경우)에서는 그 글이 본문이므로 처음부터 펼쳐 둔다.
 */
export function GyeolEssay({
  entries,
  open: initiallyOpen = false,
  back = null,
}: {
  /** 1순위부터 순서대로. 결 소개 페이지에서는 하나만 들어온다 */
  entries: EssayEntry[]
  open?: boolean
  /** 이웃 결로 넘어가도 잃지 않을 원래 결과. 이웃 링크에 실어 보낸다 */
  back?: ReturnTo | null
}) {
  const [open, setOpen] = useState(initiallyOpen)
  const [nearby, setNearby] = useState<Gyeol[]>([])

  const primary = entries[0]?.gyeol
  const primaryId = primary?.id

  useEffect(() => {
    if (!open || primaryId === undefined) return
    let alive = true
    loadNearby().then((map) => {
      if (!alive) return
      const ids = map[primaryId] ?? []
      setNearby(ids.map((id) => GYEOL_TYPES.find((g) => g.id === id)).filter((g) => g !== undefined))
    })
    return () => {
      alive = false
    }
  }, [open, primaryId])

  if (primary === undefined) return null

  // 하나뿐이면 순위 딱지가 오히려 방해가 된다.
  const showRank = entries.length > 1

  return (
    <section className="rounded-2xl bg-white/[0.04] p-5">
      {!initiallyOpen && (
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <span className="break-keep font-bold">
            {showRank ? `상위 ${entries.length}개 결 해설 읽기` : '이 결에 대해 더 읽기'}
          </span>
          <span aria-hidden className="shrink-0 text-neutral-500">
            {open ? '접기' : '펼치기'}
          </span>
        </button>
      )}

      {open && (
        <div className={initiallyOpen ? '' : 'mt-5'}>
          {entries.map((entry, index) => (
            <div
              key={entry.gyeol.id}
              // 순위 사이를 선으로 끊어야 어디까지가 한 결의 이야기인지 보인다.
              className={index > 0 ? 'mt-7 border-t border-white/10 pt-6' : ''}
            >
              <Entry entry={entry} rank={index + 1} showRank={showRank} />
            </div>
          ))}

          {nearby.length > 0 && (
            <div className="mt-7 border-t border-white/10 pt-6">
              {/*
                낫표로 감싼다. 결 이름은 모두 "결"로 끝나서 「끝까지 남는 결」과
                같이 쓰면 "끝까지 남는 결과"가 되어 result로 읽힌다.
              */}
              <h3 className="mb-3 break-keep text-sm font-bold text-neutral-400">
                {showRank ? `「${primary.name}」과 가까운 결` : '가까운 결'}
              </h3>
              <div className="flex flex-wrap gap-2">
                {nearby.map((other) => (
                  <Link
                    key={other.id}
                    href={neighbourHref(other.id, back)}
                    className="rounded-full px-3.5 py-2 text-sm break-keep transition hover:brightness-125"
                    style={{ backgroundColor: `hsla(${other.hue}, 72%, 30%, 1)` }}
                  >
                    {other.emoji} {other.name}
                  </Link>
                ))}
              </div>
              {/* 가까움은 손으로 정한 것이 아니라 카탈로그에서 함께 걸린 횟수다. */}
              <p className="mt-3 break-keep text-xs text-neutral-600">
                같은 작품이 두 결에 함께 걸린 횟수로 골랐어요
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
