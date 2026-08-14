/**
 * 계측.
 *
 * PRD 1절이 성공 기준으로 잡은 것은 **공유율과 완주율**이다. 그런데 그것을 잴
 * 수단이 여태 없어서, 무엇을 더 넣어도 먹혔는지 알 수 없는 상태였다. 이 파일이
 * 재는 것은 딱 그 두 비율을 만들 수 있을 만큼이다.
 *
 * ```
 * 완주율 = result    / start(mode=solo)
 *          vs_result / start(mode=vs)
 * 공유율 = (share_card + share_vs) / result
 * ```
 *
 * **완주율은 mode로 갈라서 봐야 한다.** 친구 링크를 타고 온 사람은 다 고르고
 * 나면 자기 결과가 아니라 궁합 화면으로 가므로 `result`를 내지 않는다. 나누지
 * 않고 `result / start`로 계산하면 궁합으로 들어온 사람 수만큼 완주율이 낮게
 * 나오는데, 그 숫자로 그리드를 손보면 엉뚱한 데를 고치게 된다. 그래서 `start`가
 * `mode`를 달고 나간다.
 *
 * **사람을 식별하지 않는다.** 로그인도 저장소도 없는 제품이라 여기서 개인을
 * 따라다니기 시작하면 앞뒤가 안 맞는다. 보내는 것은 위 사건의 발생과, 비율을
 * 읽는 데 필요한 몇 개의 수(고른 편수, 카드 규격, 궁합 점수)뿐이다.
 *
 * **끄면 아무것도 안 나간다.** `NEXT_PUBLIC_GA_ID`가 없으면 스크립트를 아예
 * 안 받고 이 함수들은 전부 no-op이 된다. 브라우저가 추적 거부(DNT)를 켜둔
 * 경우도 같다.
 *
 * ## 다른 도구로 바꾸려면
 *
 * 아래 `send`만 고치면 된다. 사건 이름과 부르는 자리는 그대로 두고 보내는
 * 곳만 바뀐다. 지금 GA4를 쓰는 이유는 공짜이면서 **깔때기(funnel)를 직접
 * 그려주기 때문이다** — 위 두 비율이 정확히 깔때기라서, 이벤트만 세어주는
 * 도구를 쓰면 비율은 손으로 계산해야 한다.
 */

const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? ''

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

/**
 * 재는 사건.
 *
 * 페이지 조회는 여기 없다. 그것은 도구가 알아서 세고, 위 두 비율은 아래
 * 사건만으로 만들어진다 — 화면 구조가 바뀌어도 지표가 안 흔들리도록.
 */
export type TrackEvent =
  /** 1라운드 안내를 지나 실제로 고르기 시작함. 완주율의 분모다 */
  | 'start'
  /** 1라운드를 마치고 2라운드로 넘어감 */
  | 'round1_done'
  /** 결과를 봄. 완주율의 분자이자 공유율의 분모다 */
  | 'result'
  /** 결과 카드를 이미지로 내보냄 */
  | 'share_card'
  /** 궁합 초대 링크를 보냄 */
  | 'share_vs'
  /** 궁합이 두 사람 것으로 완성됨 */
  | 'vs_result'

type Params = Record<string, string | number>

/** 켜져 있고, 브라우저가 추적을 거부하지 않았는가. */
function allowed(): boolean {
  if (GA_ID === '' || typeof window === 'undefined') return false
  return navigator.doNotTrack !== '1'
}

/**
 * 큐를 모듈이 로드될 때 만든다.
 *
 * 컴포넌트의 이펙트보다 먼저 실행되므로, 첫 이벤트가 원격 스크립트 도착
 * 전에 발생해도 큐에 쌓였다가 처리된다. 이펙트 순서에 기대면 결과 화면으로
 * 곧장 들어온 사람의 `result`가 통째로 샌다 — 하필 가장 중요한 사건이다.
 */
if (typeof window !== 'undefined' && allowed()) {
  window.dataLayer ??= []
  // Google 스니펫과 같은 모양이어야 한다. 배열을 넣으면 처리되지 않는다.
  window.gtag ??= function () {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments)
  }
}

/** 이 주소로 계측이 켜져 있는가. 스크립트를 받을지 정하는 데 쓴다 */
export function analyticsId(): string {
  return allowed() ? GA_ID : ''
}

/** 보내는 곳. 도구를 바꾸려면 여기만 고친다 */
function send(event: TrackEvent, params: Params): void {
  window.gtag?.('event', event, params)
}

/**
 * 사건 하나를 보낸다.
 *
 * 꺼져 있으면 조용히 아무 일도 하지 않는다. 부르는 쪽이 켜짐 여부를 따지지
 * 않아도 되도록 — 화면 코드에 `if (계측 켜졌으면)`이 흩어지면 그 조건이
 * 언젠가 화면 동작까지 가른다.
 */
export function track(event: TrackEvent, params: Params = {}): void {
  if (!allowed()) return
  send(event, params)
}
