import { fitFontSize } from './fit-text'
import type { BreakdownRow } from './breakdown'
import type { CatalogEntry, Gyeol } from './types'

/**
 * 공유 카드 규격.
 *
 * 두 벌을 만드는 이유는 **보내는 곳마다 크게 보이는 비율이 다르기 때문이다.**
 * 카카오톡 대화방은 4:5가 가장 크게 잡히고, 인스타그램 스토리는 9:16이라
 * 4:5를 올리면 위아래에 검은 띠가 남아 초라해진다. 카드가 이 서비스의 유일한
 * 유통 경로라 규격이 안 맞는 것은 그대로 유실이다.
 *
 * **폭은 두 규격이 같다(1080).** 그래서 여백·포스터 크기·비율 막대가 전부
 * 그대로고, 달라지는 것은 세로 길이와 포스터 줄 수뿐이다. 세로로 남는 자리에
 * 무엇을 더 실을지도 여기서 정한다.
 */
export type CardFormat = 'chat' | 'story'

export type CardSpec = {
  width: number
  height: number
  /** 포스터 격자의 줄 수 */
  posterRows: number
  /**
   * 결정적인 한 편을 실을 자리가 있는가.
   *
   * 4:5는 비율 막대와 포스터 격자를 넣고 나면 18px밖에 안 남아서 못 싣는다.
   * 억지로 끼우면 링크를 덮는다.
   */
  showsDecisive: boolean
  /** 규격 고르는 자리에 뜨는 이름 */
  label: string
  /** 어디에 올리는 규격인지 */
  hint: string
  fileName: string
}

export const CARD_FORMATS: Record<CardFormat, CardSpec> = {
  chat: {
    width: 1080,
    height: 1350,
    posterRows: 2,
    showsDecisive: false,
    label: '4:5',
    hint: '카카오톡',
    fileName: 'gyeol.png',
  },
  story: {
    width: 1080,
    height: 1920,
    posterRows: 3,
    showsDecisive: true,
    label: '9:16',
    hint: '인스타 스토리',
    fileName: 'gyeol-story.png',
  },
}

const PADDING = 80
const CARD_WIDTH = CARD_FORMATS.chat.width
const CONTENT_WIDTH = CARD_WIDTH - PADDING * 2
const CENTER = CARD_WIDTH / 2

/** 포스터 격자. 줄 수는 규격이 정한다 */
const POSTER_COLUMNS = 6
const POSTER_GAP = 12
const POSTER_WIDTH = (CONTENT_WIDTH - POSTER_GAP * (POSTER_COLUMNS - 1)) / POSTER_COLUMNS
const POSTER_HEIGHT = POSTER_WIDTH * 1.5
const POSTER_RADIUS = 10

/** 그 규격에 들어가는 포스터 수. 고른 작품을 이만큼만 그린다 */
export function maxPosters(spec: CardSpec): number {
  return POSTER_COLUMNS * spec.posterRows
}

/**
 * 비율 막대. 이름·트랙·퍼센트를 세 칸으로 나눈다.
 *
 * 이름을 트랙 안에 겹쳐 쓰면 채워진 부분의 경계가 글자 한가운데를 가로질러
 * 지저분해진다. 2·3위처럼 비율이 낮을 때 특히 그렇다.
 */
const ROW_HEIGHT = 46
const ROW_GAP = 12
const NAME_COLUMN = 340
const PERCENT_COLUMN = 96
const TRACK_LEFT = PADDING + NAME_COLUMN
const TRACK_WIDTH = CONTENT_WIDTH - NAME_COLUMN - PERCENT_COLUMN
const TRACK_HEIGHT = 26
const TRACK_RADIUS = TRACK_HEIGHT / 2

/** 비율 막대가 없을 때 그 아래 내용이 시작하는 자리 */
const CONTENT_TOP = 452

/** 결정적인 한 편이 차지하는 세로 길이 */
const DECISIVE_HEIGHT = 130

/**
 * 앱과 같은 폰트 스택을 쓴다. 웹폰트가 없으므로 로딩을 기다릴 필요가 없다.
 * 스캐폴드 기본값인 Arial에는 한글 글리프가 없어 폴백으로 밀린다.
 */
const FONT = '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", Pretendard, "Segoe UI", "Malgun Gothic", system-ui, sans-serif'

export type ShareCardData = {
  format: CardFormat
  gyeol: Gyeol
  /** 상위 결 비율. 비어 있으면 막대를 그리지 않는다 */
  rows: BreakdownRow[]
  /** 고른 작품. 앞에서부터 규격이 허용하는 만큼만 그린다 */
  posters: HTMLImageElement[]
  /** 판정을 가른 한 편의 제목. 자리가 있는 규격에서만 실린다 */
  decisive?: string
  siteUrl: string
}

/**
 * 브라우저에서 TMDB 이미지를 canvas에 그릴 수 있는 형태로 받는다.
 *
 * **`crossOrigin`을 반드시 켠다.** 안 켜면 canvas가 오염되어 `toBlob`이 보안
 * 오류로 실패한다. TMDB는 Origin 헤더가 붙은 요청에 `access-control-allow-origin: *`
 * 를 주므로 익명 CORS로 받을 수 있다.
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`이미지를 못 받았다: ${src}`))
    image.src = src
  })
}

/**
 * 포스터 경로에서 카드용 이미지 주소를 만든다.
 *
 * **질의 문자열을 덧붙여 캐시를 우회한다.** 화면의 `<img>`는 `crossOrigin` 없이
 * 같은 주소를 받으므로 CORS 헤더가 없는 응답이 캐시에 남는다. canvas가 그
 * 캐시를 재사용하려 하면 실패해 카드에서 포스터만 통째로 빠진다.
 *
 * 화면 쪽에 `crossOrigin`을 붙이는 방법도 있지만, 이미 방문한 적 있는 사용자는
 * 오염된 캐시 때문에 **화면의 포스터까지 안 보이게 된다.** 실제로 그렇게
 * 만들었다가 되돌렸다. 공유를 누를 때만 한 번 더 받는 편이 안전하다.
 */
export function posterUrl(work: CatalogEntry): string {
  return `https://image.tmdb.org/t/p/w342/${work.p}?card=1`
}

/**
 * 결 고유색에서 카드 각 부분의 색을 만든다. 채도·명도는 여기서 고정한다.
 *
 * 채도를 높게 잡는다. 낮추면 25개 결이 전부 비슷한 회갈색으로 수렴해서
 * "무슨 색 나왔어"가 성립하지 않는다.
 */
function tone(hue: number, lightness: number, alpha = 1): string {
  return `hsla(${hue}, 72%, ${lightness}%, ${alpha})`
}

/** `roundRect`가 없는 환경에서는 각진 사각형으로 떨어뜨린다. */
function pathRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath()
  if (typeof context.roundRect === 'function') context.roundRect(x, y, width, height, radius)
  else context.rect(x, y, width, height)
}

/**
 * 공유 카드를 그린다.
 *
 * 설명문은 싣지 않는다. 카드는 읽는 것이 아니라 **한눈에 알아보는 것**이라
 * 이모지·이름·캐치프레이즈로 끊고, 긴 설명은 사이트에 남긴다. 대신 상위 결
 * 비율 막대를 넣어 "나는 이런 조합"이 드러나게 한다 — 남과 견줄 것이 있어야
 * 공유할 이유가 생긴다.
 */
export function drawShareCard(context: CanvasRenderingContext2D, data: ShareCardData): void {
  const spec = CARD_FORMATS[data.format]
  const { hue } = data.gyeol

  // 배경: 결 고유색의 세로 그라데이션
  const background = context.createLinearGradient(0, 0, 0, spec.height)
  background.addColorStop(0, tone(hue, 24))
  background.addColorStop(0.55, tone(hue, 11))
  background.addColorStop(1, tone(hue, 6))
  context.fillStyle = background
  context.fillRect(0, 0, spec.width, spec.height)

  // 이모지 뒤의 부드러운 빛. 상단에 무게를 실어 시선을 잡는다.
  const glow = context.createRadialGradient(CENTER, 180, 0, CENTER, 180, 460)
  glow.addColorStop(0, tone(hue, 62, 0.35))
  glow.addColorStop(1, tone(hue, 62, 0))
  context.fillStyle = glow
  context.fillRect(0, 0, spec.width, 640)

  context.textBaseline = 'top'
  context.textAlign = 'center'

  // 이모지 마크
  context.font = `128px ${FONT}`
  context.fillText(data.gyeol.emoji, CENTER, 96)

  // 결 이름. 긴 이름은 줄바꿈하지 않고 글자를 줄여 한 줄을 지킨다.
  const nameSize = fitFontSize(CONTENT_WIDTH, 78, 46, (size) => {
    context.font = `bold ${size}px ${FONT}`
    return context.measureText(data.gyeol.name).width
  })
  context.font = `bold ${nameSize}px ${FONT}`
  context.fillStyle = '#ffffff'
  context.fillText(data.gyeol.name, CENTER, 254 + (78 - nameSize) / 2)

  // 캐치프레이즈. 결의 목소리라 따옴표로 감싼다.
  const phrase = `"${data.gyeol.catchphrase}"`
  const phraseSize = fitFontSize(CONTENT_WIDTH, 42, 26, (size) => {
    context.font = `${size}px ${FONT}`
    return context.measureText(phrase).width
  })
  context.font = `${phraseSize}px ${FONT}`
  context.fillStyle = tone(hue, 78)
  context.fillText(phrase, CENTER, 362)

  // 비율 막대
  let y = CONTENT_TOP
  for (const row of data.rows) {
    // 결 이름. 칸을 넘치면 글자를 줄인다.
    const rowSize = fitFontSize(NAME_COLUMN - 16, 28, 20, (size) => {
      context.font = `bold ${size}px ${FONT}`
      return context.measureText(row.name).width
    })
    context.font = `bold ${rowSize}px ${FONT}`
    context.fillStyle = 'rgba(255, 255, 255, 0.92)'
    context.textAlign = 'left'
    context.fillText(row.name, PADDING, y + (ROW_HEIGHT - rowSize) / 2 - 2)

    // 바탕 트랙
    const trackTop = y + (ROW_HEIGHT - TRACK_HEIGHT) / 2
    context.fillStyle = 'rgba(0, 0, 0, 0.28)'
    pathRect(context, TRACK_LEFT, trackTop, TRACK_WIDTH, TRACK_HEIGHT, TRACK_RADIUS)
    context.fill()

    // 채워진 부분. 결마다 색이 달라 1·2·3위가 서로 구분된다.
    // 비율이 아주 낮아도 동그라미 하나는 남겨 "0처럼" 보이지 않게 한다.
    const filled = Math.max((TRACK_WIDTH * row.percent) / 100, TRACK_HEIGHT)
    context.fillStyle = tone(row.hue, 58, 1)
    pathRect(context, TRACK_LEFT, trackTop, filled, TRACK_HEIGHT, TRACK_RADIUS)
    context.fill()

    context.font = `bold 30px ${FONT}`
    context.fillStyle = '#ffffff'
    context.textAlign = 'right'
    context.fillText(`${row.percent}%`, CARD_WIDTH - PADDING, y + 8)

    y += ROW_HEIGHT + ROW_GAP
  }

  let contentTop = (data.rows.length > 0 ? y : CONTENT_TOP) + 34

  /*
    결정적인 한 편. 세로가 긴 규격에만 실린다.

    결 이름은 25명이 나눠 갖지만 이 제목은 그 사람의 선택에서만 나온다.
    카드를 받은 사람이 "나도 저거 봤는데"로 반응하는 지점이기도 하다.
  */
  if (spec.showsDecisive && data.decisive !== undefined) {
    context.textAlign = 'center'
    context.font = `28px ${FONT}`
    context.fillStyle = tone(hue, 74)
    context.fillText('이 한 편이 갈랐어요', CENTER, contentTop)

    const title = `「${data.decisive}」`
    const titleSize = fitFontSize(CONTENT_WIDTH, 52, 30, (size) => {
      context.font = `bold ${size}px ${FONT}`
      return context.measureText(title).width
    })
    context.font = `bold ${titleSize}px ${FONT}`
    context.fillStyle = '#ffffff'
    context.fillText(title, CENTER, contentTop + 46)

    contentTop += DECISIVE_HEIGHT
  }

  // 포스터 격자. 마지막 줄이 덜 차도 가운데 정렬해 균형을 맞춘다.
  //
  // 세로 위치는 위 내용과 링크 사이의 한가운데로 잡는다. 위에서만 쌓으면
  // 아래에 큰 구멍이 남고, 아래에서만 역산하면 위와 붙는다.
  const posters = data.posters.slice(0, maxPosters(spec))
  // **실제로 그릴 줄 수로 높이를 잡는다.** 규격이 허용하는 최대 줄 수로
  // 잡으면, 다섯 편만 고른 사람의 카드에서 안 그린 줄만큼의 빈칸이 격자
  // 아래에 그대로 남는다. 세로가 긴 규격일수록 그 구멍이 커진다.
  const usedRows = Math.min(spec.posterRows, Math.ceil(posters.length / POSTER_COLUMNS))
  const gridHeight = POSTER_HEIGHT * usedRows + POSTER_GAP * Math.max(usedRows - 1, 0)
  const spaceBottom = spec.height - PADDING - 150
  const gridTop = Math.max(contentTop, contentTop + (spaceBottom - contentTop - gridHeight) / 2)
  for (let row = 0; row < usedRows; row++) {
    const inRow = posters.slice(row * POSTER_COLUMNS, (row + 1) * POSTER_COLUMNS)
    if (inRow.length === 0) break
    const rowWidth = inRow.length * POSTER_WIDTH + (inRow.length - 1) * POSTER_GAP
    const startX = CENTER - rowWidth / 2
    const top = gridTop + row * (POSTER_HEIGHT + POSTER_GAP)

    inRow.forEach((image, column) => {
      const x = startX + column * (POSTER_WIDTH + POSTER_GAP)
      context.save()
      pathRect(context, x, top, POSTER_WIDTH, POSTER_HEIGHT, POSTER_RADIUS)
      context.clip()
      context.drawImage(image, x, top, POSTER_WIDTH, POSTER_HEIGHT)
      context.restore()
    })
  }

  // 링크. 이미지만 받은 사람이 돌아올 유일한 길이라 눈에 띄게 둔다.
  context.textAlign = 'center'
  context.font = `bold 38px ${FONT}`
  context.fillStyle = '#ffffff'
  context.fillText(data.siteUrl, CENTER, spec.height - PADDING - 96)

  // TMDB 고지. 이미지가 사이트 밖으로 나가므로 여기 박혀 있어야 약관을 지킨다.
  context.font = `24px ${FONT}`
  context.fillStyle = 'rgba(255, 255, 255, 0.38)'
  context.fillText(
    'This product uses the TMDB API but is not endorsed or certified by TMDB.',
    CENTER,
    spec.height - PADDING - 40,
  )
}
