'use client'

import { useState } from 'react'
import {
  CARD_FORMATS,
  drawShareCard,
  loadImage,
  maxPosters,
  posterUrl,
  type CardFormat,
} from '@/lib/gyeol/share-card'
import { track } from '@/lib/gyeol/track'
import type { BreakdownRow } from '@/lib/gyeol/breakdown'
import type { CatalogEntry, Gyeol } from '@/lib/gyeol/types'

const SITE_URL = 'aj-yang.github.io/gyeol'

type State = 'idle' | 'working' | 'failed' | 'copied'

const FORMATS = Object.keys(CARD_FORMATS) as CardFormat[]

/**
 * 결과를 한 장의 이미지로 만들어 공유하거나 내려받는다.
 *
 * 모바일에서 카카오톡으로 바로 보내는 것이 이 기능의 존재 이유이므로
 * `navigator.share`를 먼저 쓴다. 데스크톱은 파일 공유를 지원하지 않으므로
 * 자동으로 다운로드로 떨어진다.
 *
 * **이미지와 함께 주소를 반드시 싣는다.** 예전에는 파일만 넘겼는데, 그러면
 * 단톡방에 카드만 뜨고 받은 사람은 이미지에 인쇄된 주소를 직접 타이핑해야
 * 했다. 카드가 아무리 예뻐도 거기서 유입이 끊긴다.
 *
 * **규격을 고르게 한다.** 보내는 곳마다 크게 보이는 비율이 달라서, 하나로
 * 통일하면 다른 쪽에서는 띠가 남거나 잘린다(`share-card.ts`).
 */
export function ShareCardButton({
  gyeol,
  rows,
  picks,
  decisive,
  shareUrl,
}: {
  gyeol: Gyeol
  rows: BreakdownRow[]
  picks: CatalogEntry[]
  /** 판정을 가른 한 편의 제목. 세로가 긴 규격에만 실린다 */
  decisive?: string
  /** 공유에 실을 결과 주소. 이미지와 같이 나간다 */
  shareUrl: string
}) {
  const [state, setState] = useState<State>('idle')
  const [format, setFormat] = useState<CardFormat>('chat')

  async function makeCard() {
    setState('working')
    const spec = CARD_FORMATS[format]
    try {
      // 못 받은 포스터는 건너뛴다. 한 장 때문에 카드 전체가 실패하면 안 된다.
      const settled = await Promise.allSettled(
        picks.slice(0, maxPosters(spec)).map((work) => loadImage(posterUrl(work))),
      )
      const posters = settled
        .filter((r): r is PromiseFulfilledResult<HTMLImageElement> => r.status === 'fulfilled')
        .map((r) => r.value)

      const canvas = document.createElement('canvas')
      canvas.width = spec.width
      canvas.height = spec.height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('canvas 2d 컨텍스트를 못 얻었다')

      drawShareCard(context, { format, gyeol, rows, posters, decisive, siteUrl: SITE_URL })

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('이미지로 못 바꿨다')

      const file = new File([blob], spec.fileName, { type: 'image/png' })
      const text = `내 결은 「${gyeol.name}」이래요. 너는?`

      // canShare로 먼저 확인한다. 지원 여부를 안 보고 부르면 데스크톱에서 던진다.
      // 이미지와 주소를 같이 받아주는 곳이 우선이고, 안 되면 주소만이라도 보낸다 —
      // 이미지만 가는 것보다 주소만 가는 편이 낫다. 받는 사람이 눌러야 하니까.
      for (const payload of [{ files: [file], text, url: shareUrl }, { text, url: shareUrl }]) {
        if (!navigator.canShare?.(payload)) continue
        try {
          await navigator.share(payload)
          track('share_card', { format, how: 'share' })
          setState('idle')
          return
        } catch {
          // 사용자가 공유 시트를 닫았다. 다음 방법으로 넘어가지 않고 멈춘다.
          // **세지 않는다** — 열어보고 만 것을 공유로 세면 공유율이 부푼다.
          setState('idle')
          return
        }
      }

      // 데스크톱. 이미지는 내려받고 주소는 클립보드에 넣는다. 둘 중 하나만
      // 주면 카드에 인쇄된 주소를 손으로 옮겨 적어야 한다.
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = spec.fileName
      link.click()
      track('share_card', { format, how: 'download' })
      // 곧바로 해제하면 브라우저가 blob을 읽기 전에 무효화되어 다운로드가
      // 취소될 수 있다. 한 틱 뒤로 미룬다.
      setTimeout(() => URL.revokeObjectURL(url), 10_000)

      try {
        await navigator.clipboard.writeText(shareUrl)
        setState('copied')
        setTimeout(() => setState('idle'), 4000)
      } catch {
        // 클립보드 권한이 없는 경우다. 이미지는 이미 받았으니 조용히 넘어간다.
        setState('idle')
      }
    } catch {
      setState('failed')
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {/*
        규격 고르기. 어디에 올리는 것인지를 비율보다 크게 쓴다 — "9:16"만
        보고 무엇인지 아는 사람보다 "인스타 스토리"로 아는 사람이 많다.
      */}
      <div
        role="radiogroup"
        aria-label="카드 규격"
        className="flex gap-1 rounded-full bg-white/10 p-1"
      >
        {FORMATS.map((key) => {
          const spec = CARD_FORMATS[key]
          const active = key === format
          return (
            <button
              key={key}
              role="radio"
              aria-checked={active}
              onClick={() => setFormat(key)}
              className={`rounded-full px-4 py-2 text-sm break-keep transition ${
                active ? 'bg-white font-bold text-black' : 'text-neutral-300 hover:bg-white/10'
              }`}
            >
              {spec.hint} <span className="tabular-nums opacity-60">{spec.label}</span>
            </button>
          )
        })}
      </div>

      <button
        onClick={makeCard}
        disabled={state === 'working'}
        className="rounded-full bg-white px-6 py-3 font-bold text-black transition hover:bg-neutral-200 disabled:opacity-50"
      >
        {state === 'working' ? '만드는 중…' : '이미지로 공유하기'}
      </button>

      {state === 'copied' && (
        <p className="break-keep text-sm text-neutral-400">
          이미지를 저장했어요. 링크도 복사했으니 같이 붙여넣으세요.
        </p>
      )}
      {state === 'failed' && (
        <p className="break-keep text-sm text-neutral-500">이미지를 만들지 못했어요.</p>
      )}
    </div>
  )
}
