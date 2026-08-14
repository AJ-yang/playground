import { Suspense } from 'react'
import { PickView } from '@/components/pick/PickView'

/**
 * 작품을 고르는 화면.
 *
 * 본문이 통째로 `PickView`에 있는 이유는 `?vs=`(친구의 선택)를 읽어야 하기
 * 때문이다. `useSearchParams`는 클라이언트에서만 값이 정해지므로 정적
 * 프리렌더에는 Suspense 경계가 있어야 한다. 결과 페이지와 같은 구조다.
 */
export default function PickPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center">
          <p className="animate-pulse text-neutral-500">작품을 불러오는 중…</p>
        </main>
      }
    >
      <PickView />
    </Suspense>
  )
}
