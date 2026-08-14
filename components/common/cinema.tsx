/**
 * 상영 전 화면들이 공유하는 생김새.
 *
 * 홈과 라운드 안내가 같은 언어를 쓰게 하려고 한곳에 모은다. 각자 비슷하게
 * 그려두면 한쪽만 고쳤을 때 조용히 어긋난다.
 *
 * **벨벳 레드는 결과 이전에만 쓴다.** 결 고유색은 결과가 나온 뒤에 등장하는
 * 것이라, 그 전 화면에서 미리 쓰면 색이 무엇을 뜻하는지가 흐려진다. 극장
 * 커튼색을 빌려 "아직 상영 전"이라는 별도의 톤을 만들고, 결과에서 색이 바뀌는
 * 것 자체가 "나왔다"는 신호가 된다.
 *
 * **채워진 면과 글씨에 다른 값을 쓴다.** 하나로 통일하면 둘 중 하나가 반드시
 * 안 보인다 — 버튼에 쓸 만큼 진한 빨강(#C1272D)은 검은 배경 위 작은 글씨로
 * 3.39:1이라 AA(4.5) 미달이고, 글씨에 쓸 만큼 밝은 빨강은 흰 글씨를 얹을 수
 * 없다. 아래 값은 모두 계산해서 고른 것이다.
 */

/** 채워진 면. 흰 글씨와 5.84:1 */
export const VELVET = '#C1272D'

/** 어두운 배경 위 글씨·아이콘. #0a0a0a와 5.95:1 */
export const VELVET_TEXT = '#EF5A63'

/** 옅게 깔아 쓰는 배경. 배지와 강조에 쓴다 */
export const VELVET_SOFT = 'rgba(193,39,45,0.18)'

/** 세로선·테두리처럼 존재만 알리면 되는 곳 */
export const VELVET_LINE = 'rgba(239,90,99,0.45)'

/**
 * 커튼에 닿은 빛.
 *
 * 위쪽에서 퍼지는 붉은 빛으로 시선을 가운데로 모은다. 내용 뒤에 깔리도록
 * 음수 z-index를 주고 클릭을 막지 않는다.
 */
export function ProjectorBeam() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10"
      style={{
        background:
          'radial-gradient(120% 70% at 50% -10%, rgba(193,39,45,0.28), rgba(120,20,26,0.12) 42%, transparent 70%)',
      }}
    />
  )
}

/**
 * 35mm 필름 가장자리.
 *
 * 배경색으로 뚫은 구멍이라야 필름으로 읽힌다. 밝은 줄무늬를 반복하면 바코드가
 * 된다 — 실제로 그렇게 만들었다가 고쳤다. 그래서 그라데이션 대신 구멍을 직접
 * 그린다. 개수가 고정이라 폭이 달라져도 간격이 일정하다.
 */
export function Perforations({ className }: { className: string }) {
  return (
    <div aria-hidden className={`flex items-center justify-between px-3 ${className}`}>
      {Array.from({ length: 13 }, (_, i) => (
        <span key={i} className="h-2 w-[7px] rounded-[2px] bg-neutral-950" />
      ))}
    </div>
  )
}

/** 상영 전 화면의 주 버튼. 커튼색 바탕에 흰 글씨다. */
export function VelvetButton({
  children,
  onClick,
  className = '',
}: {
  children: React.ReactNode
  onClick?: () => void
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-8 py-4 text-lg font-bold text-white transition hover:brightness-110 active:scale-[0.99] ${className}`}
      style={{ backgroundColor: VELVET }}
    >
      {children}
    </button>
  )
}
