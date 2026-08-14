'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ShareLinkButton } from '@/components/share/ShareLinkButton'
import { WorkDetailSheet } from '@/components/common/WorkDetailSheet'
import { VELVET } from '@/components/common/cinema'
import { GYEOL_TYPES } from '@/data/gyeol-types'
import { absoluteHref, returnHref } from '@/lib/gyeol/back-link'
import { matchUp } from '@/lib/gyeol/match-up'
import { decodePicks } from '@/lib/gyeol/payload'
import { track } from '@/lib/gyeol/track'
import { useCatalog } from '@/lib/gyeol/use-catalog'
import { matchUpHref, pickWithVsHref } from '@/lib/gyeol/vs-link'
import { workKey, type CatalogEntry, type Gyeol } from '@/lib/gyeol/types'

function tone(hue: number, lightness: number, alpha = 1): string {
  return `hsla(${hue}, 72%, ${lightness}%, ${alpha})`
}

/**
 * 점수를 한 줄로 옮긴다.
 *
 * **낮은 점수를 실패로 쓰지 않는다.** 안 맞는다고 말해버리면 화면이 거기서
 * 끝나는데, 취향이 다른 둘은 서로 보여줄 것이 오히려 많다. 아래 "서로에게
 * 보낼 작품"으로 이어지도록 문장을 연다.
 */
function verdict(score: number): string {
  if (score >= 80) return '같은 걸 보고 같은 데서 웃는 사이'
  if (score >= 60) return '취향이 거의 붙어 있어요'
  if (score >= 40) return '겹치는 데가 분명히 있어요'
  if (score >= 20) return '결은 다르지만 만나는 지점이 있어요'
  return '완전히 다른 결이에요. 서로 보여줄 게 많겠네요'
}

/** 포스터 한 장. 누르면 상세가 열린다. */
function Poster({ work, onOpen }: { work: CatalogEntry; onOpen: (work: CatalogEntry) => void }) {
  return (
    <button
      onClick={() => onOpen(work)}
      title={work.t}
      aria-label={`${work.t} 정보 보기`}
      className="overflow-hidden rounded-md transition hover:opacity-80 focus:ring-2 focus:ring-white/60 focus:outline-none"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://image.tmdb.org/t/p/w185/${work.p}`}
        alt={work.t}
        className="aspect-[2/3] w-full bg-neutral-800 object-cover"
      />
    </button>
  )
}

/** 이모지와 이름으로 한 사람을 가리킨다. 이름 대신 결로 부른다. */
function Side({ gyeol }: { gyeol: Gyeol }) {
  return (
    <div className="flex flex-col items-center gap-1.5 text-center">
      <span className="text-4xl" aria-hidden>
        {gyeol.emoji}
      </span>
      <span className="break-keep text-sm font-bold" style={{ color: tone(gyeol.hue, 74) }}>
        {gyeol.name}
      </span>
    </div>
  )
}

/** 두 축을 각각 막대로 보여준다. 궁합 점수가 어디서 왔는지 숨기지 않는다. */
function Axis({ label, percent, hue, note }: { label: string; percent: number; hue: number; note: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-neutral-300">{label}</span>
        <span className="text-sm font-bold tabular-nums">{percent}%</span>
      </div>
      <span className="mt-1.5 block h-2.5 overflow-hidden rounded-full bg-white/10">
        <span
          className="block h-full rounded-full"
          style={{ width: `${Math.max(percent, 2)}%`, backgroundColor: tone(hue, 58) }}
        />
      </span>
      <p className="mt-1.5 break-keep text-xs text-neutral-500">{note}</p>
    </div>
  )
}

/**
 * 두 사람의 궁합.
 *
 * 양쪽 선택이 모두 주소에 담겨 오므로 서버 없이 계산된다(`vs-link.ts`).
 * `?a=`만 있으면 아직 한쪽뿐이라 초대장으로 뜨고, 받은 사람이 자기 결을
 * 만들면 둘이 합쳐진 주소로 돌아온다.
 */
export function MatchUpView() {
  const params = useSearchParams()
  const { catalog } = useCatalog()
  const [open, setOpen] = useState<CatalogEntry | null>(null)

  const a = params.get('a')
  const b = params.get('b')

  const state = useMemo(() => {
    if (a === null && b === null) return { kind: 'empty' as const }
    if (!catalog) return null

    const byKey = new Map(catalog.works.map((w) => [workKey(w), w]))
    const read = (payload: string | null): CatalogEntry[] | null => {
      if (payload === null) return null
      const refs = decodePicks(payload)
      if (refs === null) return null
      const picks = refs.map((r) => byKey.get(workKey(r))).filter((w) => w !== undefined)
      return picks.length === 0 ? null : picks
    }

    const aPicks = read(a)
    const bPicks = read(b)

    // 한쪽만 읽히면 그 사람이 먼저 한 것으로 본다. `?b=`만 남은 링크가
    // 돌아다닐 이유는 없지만, 그때 빈 화면을 보여주는 것보다는 낫다.
    if (aPicks === null || bPicks === null) {
      const one = aPicks ?? bPicks
      const payload = aPicks !== null ? a : b
      if (one === null || payload === null) return { kind: 'broken' as const }
      return { kind: 'invite' as const, picks: one, payload }
    }

    const result = matchUp(aPicks, bPicks, catalog, GYEOL_TYPES)
    const find = (id: string | undefined) => GYEOL_TYPES.find((g) => g.id === id)
    const gyeolA = find(result.scoresA[0]?.id)
    const gyeolB = find(result.scoresB[0]?.id)
    if (gyeolA === undefined || gyeolB === undefined || a === null || b === null) {
      return { kind: 'broken' as const }
    }

    return { kind: 'match' as const, result, gyeolA, gyeolB, aPayload: a, bPayload: b }
  }, [a, b, catalog])

  /*
    궁합이 두 사람 것으로 완성된 순간. 초대장만 뜬 것과는 다르다 —
    이 둘의 차이가 곧 "초대를 받은 사람이 실제로 끝까지 했는가"다.
  */
  const matched = state !== null && state.kind === 'match' ? state.result : null
  const matchedScore = matched?.score ?? null
  const matchedShared = matched?.shared.length ?? 0
  useEffect(() => {
    if (matchedScore === null) return
    track('vs_result', { score: matchedScore, shared: matchedShared })
  }, [matchedScore, matchedShared])

  if (state === null) {
    return <p className="animate-pulse py-20 text-center text-neutral-500">결을 읽는 중…</p>
  }

  if (state.kind === 'empty' || state.kind === 'broken') {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <p className="break-keep text-neutral-300">
          {state.kind === 'empty'
            ? '친구의 결과 링크로 들어오면 궁합을 볼 수 있어요.'
            : '궁합을 읽을 수 없는 주소예요.'}
        </p>
        <Link href="/pick/" className="rounded-full bg-white px-6 py-3 font-bold text-black">
          내 결부터 만들기
        </Link>
      </div>
    )
  }

  // 한쪽만 도착한 상태. 받은 사람에게 자기 결을 만들게 하는 것이 전부다.
  if (state.kind === 'invite') {
    return (
      <>
        <header className="text-center">
          <p className="text-sm text-neutral-500">친구가 결과를 보냈어요</p>
          <h1 className="mt-2 text-2xl font-black break-keep sm:text-3xl">
            당신과 얼마나 맞는지 볼까요?
          </h1>
          <p className="mx-auto mt-4 max-w-md break-keep leading-relaxed text-neutral-400">
            친구가 고른 {state.picks.length}편이 담겨 있어요. 당신도 재미있게 본 작품을 고르면 둘의
            궁합이 나옵니다.
          </p>
        </header>

        <section>
          <h2 className="mb-3 text-sm font-bold text-neutral-400">친구가 고른 작품</h2>
          <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-8">
            {state.picks.map((work) => (
              <Poster key={workKey(work)} work={work} onOpen={setOpen} />
            ))}
          </div>
        </section>

        <div className="flex flex-col items-center gap-3">
          <Link
            href={pickWithVsHref(state.payload)}
            className="rounded-full px-7 py-3.5 font-bold text-white transition hover:brightness-110"
            style={{ backgroundColor: VELVET }}
          >
            내 결 만들러 가기
          </Link>
          <p className="break-keep text-sm text-neutral-500">1분이면 나와요</p>
        </div>

        <WorkDetailSheet work={open} sources={[]} onClose={() => setOpen(null)} />
      </>
    )
  }

  const { result, gyeolA, gyeolB } = state
  const shareUrl = absoluteHref(
    typeof location === 'undefined' ? '' : location.origin,
    process.env.NEXT_PUBLIC_BASE_PATH ?? '',
    matchUpHref(state.aPayload, state.bPayload),
  )

  return (
    <>
      {/*
        두 결의 색을 좌우로 깐다. 궁합 화면의 주인은 한 사람이 아니라 둘이므로
        한쪽 색만 쓰면 그 사람의 페이지처럼 보인다.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[60vh]"
        style={{
          background: `linear-gradient(115deg, ${tone(gyeolA.hue, 22)}, ${tone(gyeolB.hue, 22)}), linear-gradient(to bottom, #000 30%, transparent)`,
          maskImage: 'linear-gradient(to bottom, #000 35%, transparent)',
          WebkitMaskImage: 'linear-gradient(to bottom, #000 35%, transparent)',
        }}
      />

      <header className="text-center">
        <div className="flex items-start justify-center gap-6">
          <Side gyeol={gyeolA} />
          <span className="pt-3 text-2xl text-neutral-600" aria-hidden>
            ×
          </span>
          <Side gyeol={gyeolB} />
        </div>

        <p className="mt-8 text-sm text-neutral-500">두 사람의 궁합</p>
        <p className="mt-1 text-6xl font-black tabular-nums sm:text-7xl">{result.score}</p>
        {/*
          숫자가 아니라 이 문장이 이 화면의 제목이다. 크기는 점수가 더 크지만,
          읽어서 뜻이 통하는 쪽은 여기라 h1을 준다.
        */}
        <h1 className="mt-3 break-keep text-lg font-bold sm:text-xl">{verdict(result.score)}</h1>
      </header>

      <section className="space-y-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <Axis
          label="같은 작품"
          percent={result.overlap}
          hue={gyeolA.hue}
          note={`둘이 고른 작품 중 ${result.shared.length}편이 겹칩니다`}
        />
        <Axis
          label="같은 방향"
          percent={result.direction}
          hue={gyeolB.hue}
          note="겹치는 작품이 없어도 끌리는 이야기의 방향은 같을 수 있어요"
        />
        <p className="break-keep text-xs leading-relaxed text-neutral-600">
          궁합 점수는 위 두 값의 평균이에요.
        </p>
      </section>

      {result.common.length > 0 && (
        <section className="text-center">
          <h2 className="text-sm font-bold text-neutral-400">둘 다 가진 결</h2>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {result.common.map((gyeol) => (
              <span
                key={gyeol.id}
                className="rounded-full px-4 py-2 text-sm font-bold break-keep"
                style={{ backgroundColor: tone(gyeol.hue, 50, 0.18), color: tone(gyeol.hue, 76) }}
              >
                {gyeol.emoji} {gyeol.name}
              </span>
            ))}
          </div>
        </section>
      )}

      {result.shared.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-bold text-neutral-400">
            둘 다 고른 {result.shared.length}편
          </h2>
          <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-8">
            {result.shared.map((work) => (
              <Poster key={workKey(work)} work={work} onOpen={setOpen} />
            ))}
          </div>
        </section>
      )}

      {/*
        이 칸이 궁합 화면의 목적이다. 점수는 열어보게 만들 뿐이고, 대화가
        이어지려면 "이거 봐봐"라고 건넬 것이 있어야 한다.
      */}
      {(result.forA.length > 0 || result.forB.length > 0) && (
        <section>
          <h2 className="mb-1 text-sm font-bold text-neutral-400">서로에게 보낼 작품</h2>
          <p className="mb-4 break-keep text-xs text-neutral-600">
            상대가 재미있게 봤는데 당신은 아직 안 고른 것 중, 당신 결에 가장 가까운 작품이에요
          </p>

          <div className="grid gap-5 sm:grid-cols-2">
            {[
              { to: gyeolA, works: result.forA },
              { to: gyeolB, works: result.forB },
            ].map(({ to, works }) =>
              works.length === 0 ? null : (
                <div key={to.id}>
                  <p className="mb-2 break-keep text-xs font-bold" style={{ color: tone(to.hue, 74) }}>
                    {to.emoji} {to.name}에게
                  </p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {works.map((work) => (
                      <Poster key={workKey(work)} work={work} onOpen={setOpen} />
                    ))}
                  </div>
                </div>
              ),
            )}
          </div>
        </section>
      )}

      <div className="flex flex-col items-center gap-5">
        <ShareLinkButton
          url={shareUrl}
          text={`우리 궁합 ${result.score}점이래요`}
          label="궁합 결과 보내기"
          done="링크를 복사했어요. 붙여넣으면 상대도 같은 화면을 봐요."
          onShared={(how) => track('share_vs', { kind: 'result', how })}
          className="rounded-full bg-white px-6 py-3 font-bold text-black transition hover:bg-neutral-200"
        />

        <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-neutral-400">
          <Link
            href={returnHref({ gyeolId: gyeolA.id, payload: state.aPayload })}
            className="underline"
          >
            {gyeolA.emoji} 결과 보기
          </Link>
          <Link
            href={returnHref({ gyeolId: gyeolB.id, payload: state.bPayload })}
            className="underline"
          >
            {gyeolB.emoji} 결과 보기
          </Link>
        </div>
      </div>

      <WorkDetailSheet work={open} sources={[]} onClose={() => setOpen(null)} />
    </>
  )
}
