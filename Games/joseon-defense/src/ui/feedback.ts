/**
 * 조작에 대한 응답 — 쪽지(notice)와 확인창(confirm).
 *
 * GDD 8.0: **침묵은 응답이 아니다.** 실패한 클릭은 그 순간·그 자리에 이유를
 * 남긴다. `Game`은 이미 `BuildResult`로 사유 문자열을 만들고 있으므로 여기서
 * 하는 일은 그것을 화면까지 나르는 것뿐이다 — 게임 규칙은 건드리지 않는다.
 *
 * 시간을 `performance.now()`로 재는 이유: 게임 루프의 시간은 일시정지·배속에
 * 묶여 있는데, "방금 왜 안 됐는지"는 판이 멈춰 있어도 읽혀야 한다.
 */

export type NoticeKind = 'fail' | 'info'

export interface Notice {
  /** 화면에 그대로 뜨는 문장. `BuildResult.reason`이 그대로 들어온다. */
  text: string
  kind: NoticeKind
  /** 캔버스 논리 좌표. 조작이 일어난 자리다. null이면 판 위쪽 가운데. */
  at: { x: number; y: number } | null
  bornMs: number
}

/** 쪽지가 화면에 남아 있는 시간(ms). */
export const NOTICE_LIFE_MS = 2400

/**
 * 쪽지 한 장만 들고 있는 상자.
 *
 * 여러 장을 쌓지 않는 이유는, 실패는 대개 같은 이유로 연속해서 나기 때문이다
 * (골드가 모자란 채로 세 번 클릭). 마지막 것만 보여주고 타이머를 되감는 편이
 * 화면도 조용하고 읽기도 쉽다.
 */
export class NoticeBox {
  private notice: Notice | null = null

  constructor(private readonly now: () => number = () => performance.now()) {}

  show(text: string, kind: NoticeKind, at: { x: number; y: number } | null = null): void {
    this.notice = { text, kind, at, bornMs: this.now() }
  }

  clear(): void {
    this.notice = null
  }

  /** 아직 살아 있는 쪽지. 수명이 다했으면 null. */
  current(): Notice | null {
    if (!this.notice) return null
    if (this.now() - this.notice.bornMs > NOTICE_LIFE_MS) this.notice = null
    return this.notice
  }

  /** 0(방금) ~ 1(사라지기 직전). 그리기와 훅이 같은 값을 쓴다. */
  progress(): number {
    if (!this.notice) return 1
    return Math.min(1, (this.now() - this.notice.bornMs) / NOTICE_LIFE_MS)
  }
}

/**
 * 되돌릴 수 없는 조작 앞에 세우는 확인창.
 *
 * GDD 8.1 「되돌릴 수 있다」가 판매 환급까지만 지켜지고 있었다 — 진행 중인
 * 판을 버리는 것이 이 게임에서 유일하게 되돌릴 수 없는 조작인데 확인이 없는
 * 것도 그것 하나였다.
 */
export interface ConfirmPrompt {
  title: string
  detail: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
}
