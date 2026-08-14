'use client'

import { useEffect } from 'react'
import { analyticsId } from '@/lib/gyeol/track'

/**
 * 계측 스크립트를 받아 붙인다.
 *
 * `next/script` 대신 이펙트에서 직접 넣는다. 추적 거부(DNT)를 켠 브라우저에는
 * **스크립트 자체를 안 받아야** 하는데, 그 판단은 `navigator`를 봐야 하므로
 * 서버에서 미리 그릴 수 없다. 렌더 중에 분기하면 정적 HTML과 어긋나 하이드레이션
 * 경고가 뜬다. 계측이 한 틱 늦게 붙는 것은 아무 문제가 없다 — 이벤트는 큐에
 * 쌓였다가 처리된다(`track.ts`).
 *
 * `NEXT_PUBLIC_GA_ID`가 없으면 아무것도 안 붙는다. 그때는 이 컴포넌트가 있어도
 * 네트워크 요청이 한 건도 안 생긴다.
 */
export function Analytics() {
  useEffect(() => {
    const id = analyticsId()
    if (id === '') return

    const script = document.createElement('script')
    script.async = true
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`
    document.head.append(script)

    window.gtag?.('js', new Date())
    window.gtag?.('config', id)

    return () => {
      script.remove()
    }
  }, [])

  return null
}
