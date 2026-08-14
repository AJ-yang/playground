'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Duel } from '@/components/pick/Duel'
import { VELVET, VELVET_TEXT } from '@/components/common/cinema'
import { RoundIntro } from '@/components/pick/RoundIntro'
import { WorkGrid } from '@/components/pick/WorkGrid'
import { nextDuel } from '@/lib/gyeol/duel'
import { searchWorks } from '@/lib/gyeol/grid'
import { matchGyeol } from '@/lib/gyeol/match'
import { encodePicks } from '@/lib/gyeol/payload'
import { track } from '@/lib/gyeol/track'
import { matchUpHref } from '@/lib/gyeol/vs-link'
import { makeRng, seededShuffle } from '@/lib/rng'
import { GYEOL_TYPES } from '@/data/gyeol-types'
import { useCatalog, usePool } from '@/lib/gyeol/use-catalog'
import { workKey, type CatalogEntry } from '@/lib/gyeol/types'

/**
 * 최소 선택 수. 이 아래로는 결이 거의 갈리지 않는다.
 *
 * 상한은 두지 않는다. 더 고를수록 결이 정확해지는데 막을 이유가 없고,
 * 본 작품이 적은 사람이 막히지 않아야 한다 (PRD 3절).
 */
const MIN_PICKS = 5

/** 2라운드 대결 상한. 이 안에 못 가르면 그대로 결과로 보낸다. */
const MAX_DUELS = 5

/**
 * 작품을 고르는 화면.
 *
 * `?vs=`가 붙어 있으면 친구의 선택을 들고 온 것이다. 다 고르고 나면 자기 결과
 * 대신 **궁합 화면**으로 보낸다 — 그 링크를 누른 이유가 궁합이라, 자기 결과만
 * 띄우면 뭘 하러 왔는지 잊어버린다. 자기 결과는 궁합 화면에서 갈 수 있다.
 */
export function PickView() {
  const router = useRouter()
  const params = useSearchParams()
  /** 친구의 선택. 없으면 혼자 하는 것이다 */
  const vs = params.get('vs')

  // 후보만 먼저 받아 그리드를 띄우고, 색인은 뒤에서 받는다. 색인은 검색·2라운드·
  // 결과 판정에만 필요한데, 그걸 기다리느라 첫 화면이 607KB만큼 늦었다.
  const { pool: candidates, failed: poolFailed } = usePool()
  const { catalog } = useCatalog()
  const failed = poolFailed
  const [picks, setPicks] = useState<CatalogEntry[]>([])
  const [query, setQuery] = useState('')
  /**
   * 진행 단계. 두 라운드가 형식이 달라서 각각 시작 전에 안내를 끼운다.
   * 예고 없이 형식이 바뀌면 사용자가 규칙을 화면에서 역추적해야 한다.
   */
  const [stage, setStage] = useState<'intro' | 'grid' | 'duelIntro' | 'duels'>('intro')
  const [duelsDone, setDuelsDone] = useState(0)
  const [seen, setSeen] = useState<ReadonlySet<string>>(new Set())

  // 세션마다 순서를 바꾸되 리렌더에는 흔들리지 않게 시드를 한 번만 뽑는다.
  const [seed] = useState(() => Math.floor(Math.random() * 2 ** 31))

  const selected = useMemo(() => new Set(picks.map(workKey)), [picks])
  // 후보 선정은 빌드 때 끝났다. 여기서는 세션마다 순서만 바꾼다.
  const pool = useMemo(
    () => (candidates ? seededShuffle(candidates, makeRng(seed)) : []),
    [candidates, seed],
  )
  const searchHits = useMemo(
    () => (catalog ? searchWorks(catalog.works, query, 12) : []),
    [catalog, query],
  )

  // 2라운드는 1라운드가 잡은 기준선 위에서 붙어 있는 결을 가른다.
  const duel = useMemo(() => {
    if (!catalog || stage !== 'duels' || duelsDone >= MAX_DUELS) return null
    return nextDuel(picks, matchGyeol(picks, catalog, GYEOL_TYPES), catalog, GYEOL_TYPES, seen)
  }, [catalog, stage, duelsDone, picks, seen])

  // 대결이 끝났거나 더 물을 것이 없는 상태.
  const duelsOver = stage === 'duels' && catalog !== null && duel === null

  // 렌더 도중에 router.push를 부르면 React가 다른 컴포넌트를 갱신한다고 막는다.
  // "Cannot update a component (Router) while rendering a different component".
  useEffect(() => {
    if (!duelsOver || !catalog) return
    const payload = encodePicks(picks.map((w) => ({ i: w.i, m: w.m })))

    // 친구 링크를 타고 왔으면 궁합으로 간다. 먼저 한 쪽이 앞자리다.
    if (vs !== null) {
      router.push(matchUpHref(vs, payload))
      return
    }

    // 결별 경로로 보낸다. 공유 링크의 미리보기를 결마다 다르게 하려면 결 수만큼
    // 미리 구운 페이지 중 해당하는 것으로 가야 한다 — 정적 배포라 질의 문자열로는
    // og 태그를 바꿀 수 없다.
    const top = matchGyeol(picks, catalog, GYEOL_TYPES)[0]
    router.push(`/r/${top.id}/?p=${payload}`)
  }, [duelsOver, catalog, picks, router, vs])

  function answerDuel(winner: CatalogEntry | null) {
    if (duel === null) return
    setSeen((current) => new Set([...current, workKey(duel.left.work), workKey(duel.right.work)]))
    if (winner !== null) setPicks((current) => [...current, winner])
    setDuelsDone((n) => n + 1)
  }

  function toggle(work: CatalogEntry) {
    const key = workKey(work)
    setPicks((current) =>
      current.some((w) => workKey(w) === key)
        ? current.filter((w) => workKey(w) !== key)
        : [...current, work],
    )
  }

  if (failed) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="break-keep text-neutral-300">작품 목록을 불러오지 못했어요.</p>
        <button
          onClick={() => location.reload()}
          className="rounded-full bg-white px-6 py-3 font-bold text-black"
        >
          다시 시도
        </button>
      </main>
    )
  }

  if (!candidates) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p className="animate-pulse text-neutral-500">작품을 불러오는 중…</p>
      </main>
    )
  }

  // 이동은 위 useEffect가 한다. 여기서는 기다리는 화면만 그린다.
  if (duelsOver) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p className="animate-pulse text-neutral-500">
          {vs === null ? '결을 읽는 중…' : '궁합을 맞춰보는 중…'}
        </p>
      </main>
    )
  }

  if (stage === 'intro') {
    return (
      <RoundIntro
        step={vs === null ? '1라운드' : '궁합 · 1라운드'}
        title="재미있게 본 작품 고르기"
        lead={
          vs === null
            ? '많이 본 영화와 드라마 50편을 보여드려요. 그중 재미있게 본 것을 골라주세요.'
            : '친구의 선택은 이미 받아뒀어요. 이제 당신이 재미있게 본 것을 고르면 둘의 궁합이 나옵니다.'
        }
        rules={[
          '5편 이상 골라야 결과가 나와요. 더 고를수록 정확해집니다.',
          '장르 이름은 일부러 안 붙였어요. 라벨 말고 작품을 보고 고르시라고요.',
          '찾는 작품이 없으면 위쪽 검색으로 직접 추가할 수 있어요.',
        ]}
        note="여기서 고른 것이 기준선이 됩니다. 안 본 작품은 그냥 넘기세요 — 모르는 걸 고르면 결이 흐려져요."
        action="작품 고르러 가기"
        // 완주율의 분모. 랜딩 조회가 아니라 실제로 고르기 시작한 사람을 센다.
        onStart={() => {
          track('start', { mode: vs === null ? 'solo' : 'vs' })
          setStage('grid')
        }}
      />
    )
  }

  if (stage === 'duelIntro') {
    return (
      <RoundIntro
        step="2라운드"
        title="둘 중 하나 고르기"
        lead="이제 두 작품씩 짝지어 보여드려요. 더 끌리는 쪽을 골라주세요. 최대 5번입니다."
        rules={[
          '1라운드에서 비슷하게 나온 결들을 가르는 질문이에요.',
          '안 본 작품이거나 고르기 어려우면 “잘 모르겠어요”를 누르면 됩니다.',
          '넘겨도 결과는 나와요. 다만 덜 뾰족해집니다.',
        ]}
        note="이 라운드에서 정확도가 가장 많이 올라갑니다. 1라운드만으로는 비슷한 결 여럿이 남아 있거든요."
        action="시작하기"
        onStart={() => {
          setSeen(new Set(picks.map(workKey)))
          setStage('duels')
        }}
      />
    )
  }

  if (stage === 'duels') {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-4 py-6">
        <Duel
          duel={duel!}
          round={duelsDone + 1}
          total={MAX_DUELS}
          onPick={(work) => answerDuel(work)}
          onSkip={() => answerDuel(null)}
        />
      </main>
    )
  }

  const remaining = MIN_PICKS - picks.length

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-4 px-4 py-6">
      <header className="sticky top-0 z-10 -mx-4 bg-neutral-950/90 px-4 py-3 backdrop-blur">
        <p className="break-keep text-sm text-neutral-400">재미있게 본 작품을 모두 골라주세요</p>
        <div className="mt-2 flex items-center gap-3">
          {/*
            고른 편수만 커튼색으로 짚는다. 이 화면의 주인공은 포스터라 배경이나
            테두리까지 물들이면 작품이 죽는다. 진행 상태 하나만 눈에 띄면 된다.
          */}
          <span className="shrink-0 text-lg font-bold" style={{ color: VELVET_TEXT }}>
            {picks.length}편
          </span>
          {remaining > 0 ? (
            <span className="break-keep text-sm text-neutral-500">
              {remaining}편 더 고르면 결과를 볼 수 있어요
            </span>
          ) : (
            <>
              <span className="break-keep text-sm text-neutral-500">더 고를수록 정확해져요</span>
              {/* 2라운드는 색인이 있어야 돈다. 보통은 고르는 사이에 도착한다. */}
              <button
                onClick={() => {
                  // 몇 편에서 멈추는지가 곧 그리드 길이와 최소 선택 수를 다시
                  // 정할 근거가 된다.
                  track('round1_done', { picks: picks.length })
                  setStage('duelIntro')
                }}
                disabled={catalog === null}
                className="ml-auto shrink-0 rounded-full px-5 py-2 font-bold text-white transition hover:brightness-110 disabled:opacity-50"
                style={{ backgroundColor: VELVET }}
              >
                {catalog === null ? '준비 중…' : '다음'}
              </button>
            </>
          )}
        </div>

        {/*
          검색을 헤더 안에 두어 스크롤해도 따라오게 한다. 후보 50편은 결마다
          가장 알려진 작품을 뽑느라 영화로 채워지므로, 드라마만 보는 사람은
          여기서 직접 넣어야 한다. 문구로 드라마를 명시하지 않으면 그 길이
          있다는 것 자체를 모른다.
        */}
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={catalog === null}
          placeholder={
            catalog === null ? '검색 준비 중…' : '드라마·영화 제목으로 검색해서 추가'
          }
          className="mt-2 w-full rounded-full bg-neutral-900 px-4 py-2.5 text-sm outline-none placeholder:text-neutral-500 focus:ring-2 disabled:opacity-60"
          style={{ ["--tw-ring-color" as string]: 'rgba(239,90,99,0.55)' }}
        />
      </header>

      {query.trim() !== '' &&
        (searchHits.length > 0 ? (
          <WorkGrid works={searchHits} selected={selected} onToggle={toggle} />
        ) : (
          <p className="break-keep py-4 text-center text-sm text-neutral-600">
            그 제목으로 찾지 못했어요.
          </p>
        ))}

      <WorkGrid works={pool} selected={selected} onToggle={toggle} />
    </main>
  )
}
