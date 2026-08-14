'use client'

import { useState } from 'react'

type State = 'idle' | 'copied' | 'failed'

/**
 * 주소 하나를 공유한다. 이미지는 만들지 않는다.
 *
 * 공유 카드(`ShareCardButton`)와 쓰임이 다르다. 카드는 "내 결과를 보여주는"
 * 것이라 이미지가 본체지만, 이쪽은 **상대가 눌러야 의미가 생기는** 초대장이라
 * 주소가 본체다. 이미지를 붙이면 받은 사람이 그림만 보고 넘긴다.
 *
 * 모바일은 공유 시트를 띄우고, 못 쓰는 환경에서는 클립보드로 떨어진다.
 */
export function ShareLinkButton({
  url,
  text,
  label,
  done,
  onShared,
  className = '',
  style,
}: {
  url: string
  /** 공유 시트에 함께 실리는 한 줄 */
  text: string
  label: string
  /** 복사로 떨어졌을 때 보여줄 안내 */
  done: string
  /**
   * 실제로 내보낸 뒤에만 불린다.
   *
   * 공유 시트를 열었다가 닫은 경우는 부르지 않는다 — 그것까지 세면 공유율이
   * 부푼다. 이 컴포넌트는 무엇을 세는지 모르고, 부르는 쪽이 정한다.
   */
  onShared?: (how: 'share' | 'copy') => void
  className?: string
  style?: React.CSSProperties
}) {
  const [state, setState] = useState<State>('idle')

  async function share() {
    const payload = { text, url }

    // canShare로 먼저 확인한다. 지원 여부를 안 보고 부르면 데스크톱에서 던진다.
    if (navigator.canShare?.(payload)) {
      try {
        await navigator.share(payload)
        onShared?.('share')
      } catch {
        // 사용자가 공유 시트를 닫았다. 복사로 넘어가지 않고 멈춘다.
      }
      setState('idle')
      return
    }

    try {
      await navigator.clipboard.writeText(url)
      onShared?.('copy')
      setState('copied')
      setTimeout(() => setState('idle'), 4000)
    } catch {
      // 클립보드 권한이 없다. 주소를 직접 긁어 갈 수 있도록 알린다.
      setState('failed')
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button onClick={share} className={className} style={style}>
        {label}
      </button>
      {state === 'copied' && <p className="break-keep text-sm text-neutral-400">{done}</p>}
      {state === 'failed' && (
        <p className="break-keep text-sm text-neutral-500">
          링크를 복사하지 못했어요. 주소창의 주소를 보내주세요.
        </p>
      )}
    </div>
  )
}
