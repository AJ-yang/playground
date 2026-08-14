'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { DecisivePick } from '@/components/result/DecisivePick'
import { GyeolBanner } from '@/components/result/GyeolBanner'
import { GyeolEssay } from '@/components/result/GyeolEssay'
import { ShareCardButton } from '@/components/share/ShareCardButton'
import { ShareLinkButton } from '@/components/share/ShareLinkButton'
import { WorkDetailSheet } from '@/components/common/WorkDetailSheet'
import { GYEOL_TYPES } from '@/data/gyeol-types'
import { absoluteHref, absoluteResultHref, readReturn, returnHref } from '@/lib/gyeol/back-link'
import { breakdown } from '@/lib/gyeol/breakdown'
import { decisivePick } from '@/lib/gyeol/decisive'
import { recommendationSources } from '@/lib/gyeol/details'
import { matchGyeol } from '@/lib/gyeol/match'
import { decodePicks } from '@/lib/gyeol/payload'
import { recommend } from '@/lib/gyeol/recommend'
import { useCatalog } from '@/lib/gyeol/use-catalog'
import { usePickRecommendations } from '@/lib/gyeol/use-detail'
import { track } from '@/lib/gyeol/track'
import { inviteHref } from '@/lib/gyeol/vs-link'
import { workKey, type CatalogEntry, type Gyeol } from '@/lib/gyeol/types'

const RECOMMEND_COUNT = 10

/**
 * 포스터 한 장. 누르면 상세가 열린다.
 *
 * 제목이 포스터 안에만 있어 작은 화면에서는 읽기 어렵다. `title`을 달아
 * 데스크톱에서는 올려두면 뜨게 하고, 스크린리더도 무엇인지 알 수 있게 한다.
 */
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

/**
 * 결과 화면 본문.
 *
 * `/result/?p=`와 결별 정적 페이지(`/r/<결 id>/?p=`)가 함께 쓴다. 후자는 공유
 * 링크의 미리보기를 결마다 다르게 하려고 존재한다 — 정적 배포라 질의 문자열로는
 * og 태그를 바꿀 수 없어서, 결 수만큼 페이지를 미리 구워야 한다.
 *
 * @param gyeolId 이 페이지가 대표하는 결. `?p=`가 없을 때 무엇을 보여줄지에만
 *   쓰인다. 본문의 진짜 근거는 언제나 `?p=`에 담긴 선택이다.
 */
export function ResultView({ gyeolId }: { gyeolId?: string }) {
  const params = useSearchParams()
  const payload = params.get('p')
  const { catalog } = useCatalog()

  const [open, setOpen] = useState<CatalogEntry | null>(null)

  const state = useMemo(() => {
    // 선택 없이 들어온 경우. 친구가 공유한 링크의 미리보기만 보고 눌렀거나
    // 결 소개를 직접 연 상황이라, 그 결이 무엇인지 보여주고 초대한다.
    if (payload === null) return { landing: true as const }
    if (!catalog) return null
    const refs = decodePicks(payload)
    if (refs === null) return { broken: true as const }

    const byKey = new Map(catalog.works.map((w) => [workKey(w), w]))
    const picks = refs.map((r) => byKey.get(workKey(r))).filter((w) => w !== undefined)
    if (picks.length === 0) return { broken: true as const }

    const scores = matchGyeol(picks, catalog, GYEOL_TYPES)
    const gyeol = GYEOL_TYPES.find((g) => g.id === scores[0].id)!

    // 판정을 가른 한 편. 없을 수도 있고, 그때는 그 사실을 보여준다.
    const found = decisivePick(picks, catalog, GYEOL_TYPES)
    const without = found === null ? undefined : GYEOL_TYPES.find((g) => g.id === found.without)
    const decisive =
      found !== null && without !== undefined ? { work: found.work, without } : null

    // 공유 카드에 들어갈 상위 3개. 1위만 보여주면 견줄 것이 없다.
    return {
      broken: false as const,
      gyeol,
      picks,
      payload,
      decisive,
      rows: breakdown(scores, GYEOL_TYPES, 3),
    }
  }, [catalog, payload])

  /*
    완주율의 분자이자 공유율의 분모. 결과가 실제로 그려진 순간에만 센다.

    결 소개(`?p=` 없음)와 망가진 주소는 빼야 한다 — 남의 링크를 눌러 소개만
    본 사람까지 세면 완주율이 부풀고, 그 숫자로는 아무 판단도 못 한다.
  */
  const done = state !== null && !('landing' in state) && !state.broken
  const doneGyeol = done ? state.gyeol.id : null
  const donePicks = done ? state.picks.length : 0
  useEffect(() => {
    if (doneGyeol === null) return
    track('result', { gyeol: doneGyeol, picks: donePicks })
  }, [doneGyeol, donePicks])

  // 훅은 조건부로 못 부르므로, 아직 결과가 아닐 때는 빈 배열을 넘긴다.
  // 고른 작품이 든 청크만 받아 추천을 모은다 — 예전에는 430KB를 통째로 받았다.
  const recommendations = usePickRecommendations(
    state !== null && !('landing' in state) && !state.broken ? state.picks : [],
  )

  if (!state) {
    return <p className="animate-pulse py-20 text-center text-neutral-500">결을 읽는 중…</p>
  }

  if ('landing' in state) {
    const gyeol = GYEOL_TYPES.find((g) => g.id === gyeolId)
    if (gyeol === undefined) {
      return (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <p className="break-keep text-neutral-300">결과를 읽을 수 없는 주소예요.</p>
          <Link href="/pick/" className="rounded-full bg-white px-6 py-3 font-bold text-black">
            처음부터 해보기
          </Link>
        </div>
      )
    }
    // 이웃 결을 구경하러 온 경우. 자기 결과로 돌아갈 길을 잃지 않게 한다.
    const back = readReturn(params)

    return (
      <>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[70vh]"
          style={{
            background: `linear-gradient(to bottom, hsla(${gyeol.hue}, 72%, 22%, 1), hsla(${gyeol.hue}, 72%, 8%, 0.6) 55%, transparent)`,
          }}
        />

        {/*
          돌아가는 길은 위에 둔다. 해설이 길어서 아래에만 있으면 다 읽고
          스크롤을 내려야 보이는데, 구경하다 말고 돌아가고 싶을 때가 더 많다.
        */}
        {back !== null && (
          <div className="-mb-4">
            <Link
              href={returnHref(back)}
              className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm break-keep transition hover:bg-white/20"
            >
              <span aria-hidden>←</span> 내 결과로 돌아가기
            </Link>
          </div>
        )}

        <GyeolBanner gyeol={gyeol} rows={[]} />
        <GyeolEssay entries={[{ gyeol }]} open back={back} />

        <div className="flex flex-col items-center gap-3">
          <Link
            href="/pick/"
            className="rounded-full bg-white px-7 py-3.5 font-bold text-black"
          >
            {back === null ? '나는 무슨 결일까?' : '다시 해보기'}
          </Link>
          <p className="break-keep text-sm text-neutral-500">
            {back === null ? '1분이면 나와요' : '고른 작품을 바꿔서 다시 볼 수 있어요'}
          </p>
          {/*
            결 하나만 보고 들어온 사람에게 나머지 24개로 가는 길을 준다.
            이 화면은 검색이나 남의 링크로 닿는 자리라 여기가 입구가 된다.
          */}
          <Link href="/gyeols/" className="mt-1 text-sm text-neutral-400 underline">
            25개 결 전부 보기
          </Link>
        </div>
      </>
    )
  }

  if (state.broken) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <p className="break-keep text-neutral-300">결과를 읽을 수 없는 주소예요.</p>
        <Link href="/pick/" className="rounded-full bg-white px-6 py-3 font-bold text-black">
          처음부터 해보기
        </Link>
      </div>
    )
  }

  const picked = recommendations
    ? recommend(state.picks, recommendations, catalog!.works, RECOMMEND_COUNT)
    : []
  const pickedKeys = new Set(state.picks.map(workKey))

  return (
    <>
      {/*
        결 고유색을 화면 위에서 은은하게 깐다. 카드와 같은 색이라야 카드를
        받고 링크를 타고 온 사람이 이어진 것으로 읽는다. 내용 뒤에 깔리도록
        음수 z-index를 주고 클릭을 막지 않는다.

        `fixed`가 아니라 `absolute`다. 고정하면 아래로 스크롤해도 색이 뷰포트
        위쪽에 계속 붙어 있어, 포스터 목록을 보는 내내 따라다닌다. 이 색은
        머리에 속한 것이라 내용과 함께 밀려나야 한다.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[70vh]"
        style={{
          background: `linear-gradient(to bottom, hsla(${state.gyeol.hue}, 72%, 22%, 1), hsla(${state.gyeol.hue}, 72%, 8%, 0.6) 55%, transparent)`,
        }}
      />

      <GyeolBanner gyeol={state.gyeol} rows={state.rows} />

      {/*
        해설은 비율 막대와 같은 세 결을 싣는다. 1위만 보여주면 나머지 둘이
        무슨 결인지 알 방법이 없어, 막대만 보고 궁금해진 채로 끝난다.
      */}
      <GyeolEssay
        entries={state.rows
          .map((row) => ({
            gyeol: GYEOL_TYPES.find((g) => g.id === row.id),
            percent: row.percent,
          }))
          .filter((e): e is { gyeol: Gyeol; percent: number } => e.gyeol !== undefined)}
        back={{ gyeolId: state.gyeol.id, payload: state.payload }}
      />

      {/*
        결 이름은 25명이 나눠 갖지만 이 칸은 그 사람의 선택에서만 나온다.
        결과가 남의 이야기처럼 읽히는 것을 막는 자리라 해설 바로 뒤에 둔다.
      */}
      <DecisivePick decisive={state.decisive} gyeol={state.gyeol} onOpen={setOpen} />

      <section>
        <h2 className="mb-3 text-sm font-bold text-neutral-400">당신이 고른 {state.picks.length}편</h2>
        <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-8">
          {state.picks.map((work) => (
            <Poster key={workKey(work)} work={work} onOpen={setOpen} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-sm font-bold text-neutral-400">이런 것도 좋아할 거예요</h2>
        <p className="mb-3 break-keep text-xs text-neutral-600">포스터를 누르면 줄거리를 볼 수 있어요</p>
        {recommendations === null ? (
          <p className="text-sm text-neutral-600">추천을 불러오는 중…</p>
        ) : picked.length === 0 ? (
          <p className="break-keep text-sm text-neutral-600">고른 작품이 적어 추천할 것을 찾지 못했어요.</p>
        ) : (
          <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">
            {picked.map((work) => (
              <Poster key={workKey(work)} work={work} onOpen={setOpen} />
            ))}
          </div>
        )}
      </section>

      {/*
        카드 공유와 다른 행동이라 칸을 나눈다. 카드는 "내 결과를 보여주는"
        것이고 이쪽은 **상대가 눌러야 완성되는** 초대장이다. 한 줄에 같이 두면
        둘 다 그냥 공유 버튼으로 보여 하나만 눌린다.
      */}
      <section
        className="rounded-2xl border p-5 text-center"
        style={{
          borderColor: `hsla(${state.gyeol.hue}, 72%, 60%, 0.25)`,
          backgroundColor: `hsla(${state.gyeol.hue}, 72%, 40%, 0.07)`,
        }}
      >
        <h2 className="text-base font-bold">친구와 궁합 보기</h2>
        <p className="mx-auto mt-2 mb-4 max-w-sm break-keep text-sm leading-relaxed text-neutral-400">
          링크를 받은 친구가 자기 결을 만들면 둘의 궁합이 나와요. 겹친 작품과 서로에게 보낼 작품도
          같이요.
        </p>
        <ShareLinkButton
          url={absoluteHref(
            typeof location === 'undefined' ? '' : location.origin,
            process.env.NEXT_PUBLIC_BASE_PATH ?? '',
            inviteHref(state.payload),
          )}
          text={`내 결은 「${state.gyeol.name}」이래요. 우리 궁합 볼래요?`}
          label="궁합 링크 보내기"
          done="링크를 복사했어요. 친구에게 붙여넣어 보내세요."
          onShared={(how) => track('share_vs', { kind: 'invite', how })}
          className="rounded-full bg-white px-6 py-3 font-bold text-black transition hover:bg-neutral-200"
        />
      </section>

      {/*
        공유가 이 서비스가 퍼지는 유일한 경로라 결과 바로 아래, 다시 하기보다
        위에 둔다. 카드에는 고른 작품의 포스터가 들어간다.
      */}
      <div className="flex flex-col items-center gap-5">
        <ShareCardButton
          gyeol={state.gyeol}
          rows={state.rows}
          picks={state.picks}
          // 세로가 긴 규격에만 실린다. 카드에서 가장 개인적인 한 줄이라
          // 자리가 나는 쪽에서는 넣는다.
          decisive={state.decisive?.work.t}
          // 이미지와 함께 보낼 주소. 서버에서는 origin을 알 수 없으므로 빈 값이
          // 되지만, 이 버튼은 클라이언트에서만 눌린다.
          shareUrl={absoluteResultHref(
            typeof location === 'undefined' ? '' : location.origin,
            process.env.NEXT_PUBLIC_BASE_PATH ?? '',
            { gyeolId: state.gyeol.id, payload: state.payload },
          )}
        />
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-neutral-400">
          <Link href="/pick/" className="underline">
            다시 하기
          </Link>
          <Link href="/gyeols/" className="underline">
            25개 결 전부 보기
          </Link>
        </div>
      </div>

      {/*
        추천 근거는 추천된 작품에만 붙인다. 고른 작품에 "고른 X와 닿아
        있어요"가 뜨면 말이 안 된다.
      */}
      <WorkDetailSheet
        work={open}
        sources={
          open !== null && !pickedKeys.has(workKey(open))
            ? recommendationSources(open, state.picks, recommendations ?? {})
            : []
        }
        onClose={() => setOpen(null)}
      />
    </>
  )
}
