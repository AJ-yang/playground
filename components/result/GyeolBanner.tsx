import type { BreakdownRow } from '@/lib/gyeol/breakdown'
import type { Gyeol } from '@/lib/gyeol/types'

/**
 * 결 고유색. 공유 카드의 `tone()`과 같은 채도를 쓴다.
 *
 * 화면과 카드의 색이 다르면 "내 결의 색"이라는 것이 성립하지 않는다. 카드를
 * 받은 사람이 링크를 타고 왔을 때 같은 색이어야 이어진 것으로 읽힌다.
 */
function tone(hue: number, lightness: number, alpha = 1): string {
  return `hsla(${hue}, 72%, ${lightness}%, ${alpha})`
}

/**
 * 결과 화면 머리. 이모지·이름·캐치프레이즈·설명과 상위 결 비율을 보여준다.
 *
 * 색상은 Tailwind 클래스가 아니라 인라인 스타일로 넣는다. 결마다 색이 달라
 * 클래스 이름을 미리 만들어 둘 수 없고, Tailwind는 실행 중에 만들어진
 * 클래스 이름을 빌드에 포함하지 못한다.
 */
export function GyeolBanner({ gyeol, rows }: { gyeol: Gyeol; rows: BreakdownRow[] }) {
  return (
    <header className="text-center">
      <div className="text-6xl" aria-hidden>
        {gyeol.emoji}
      </div>

      <p className="mt-4 text-sm text-neutral-500">당신이 자꾸 고르는 이야기</p>
      <h1 className="mt-1.5 text-3xl font-black break-keep sm:text-4xl">{gyeol.name}</h1>

      <p
        className="mt-3 break-keep text-lg font-bold sm:text-xl"
        style={{ color: tone(gyeol.hue, 72) }}
      >
        &ldquo;{gyeol.catchphrase}&rdquo;
      </p>

      <p className="mx-auto mt-4 max-w-md break-keep leading-relaxed text-neutral-300">
        {gyeol.description}
      </p>

      {rows.length > 0 && (
        <div className="mx-auto mt-8 max-w-md space-y-2.5">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center gap-3">
              <span className="w-32 shrink-0 truncate text-left text-sm text-neutral-300">
                {row.name}
              </span>
              <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/10">
                <span
                  className="block h-full rounded-full"
                  // 아주 낮은 비율도 점 하나는 남겨 0처럼 보이지 않게 한다.
                  style={{
                    width: `${Math.max(row.percent, 3)}%`,
                    backgroundColor: tone(row.hue, 58),
                  }}
                />
              </span>
              <span className="w-11 shrink-0 text-right text-sm font-bold tabular-nums">
                {row.percent}%
              </span>
            </div>
          ))}
        </div>
      )}
    </header>
  )
}
