#!/usr/bin/env python3
"""`assets/backdrop/` 의 실제 지도 스캔과 유물 사진을 타이틀 배경용으로 굽는다.

타이틀 배경은 **손으로 그린 벡터가 아니라 실물 이미지**여야 한다. 대동여지도
같은 실제 고지도를 크게 깔고, 각 방어 기물의 모티브가 된 유물 사진을 흐리게
군데군데 얹는다. 이 스크립트가 그 원본을 받아 게임이 쓸 수 있는 형태로 바꾼다.

굽는 이유는 세 가지다.

1. **배포 형태.** 아티팩트 페이지는 외부 호스트를 전부 막는 CSP 아래서 돈다.
   이미지는 반드시 `data:` URI로 번들 안에 들어가야 한다.
2. **크기.** 고지도 스캔은 수십 MB다. 배경으로 깔리면서 불투명도 0.2로
   덮이는 그림에 그 해상도는 낭비다. 줄이고, 흐리고, 다시 줄인다.
3. **색조.** 출처가 제각각인 사진들은 색 온도가 다 다르다. 그대로 얹으면
   배경이 누더기가 된다. 전부 먹빛-종이빛 2색조로 통일해서 한 장의 종이 위에
   있는 것처럼 보이게 한다.

원본을 넣고 다음을 실행한다.

    python3 tools/bake-backdrop.py

결과는 `src/render/backdropAssets.ts` 한 파일이다. 이 파일은 **생성물이지만
커밋한다** — 빌드하는 쪽에 Pillow를 요구하지 않기 위해서다.

원본이 하나도 없으면 빈 자산을 쓴다. 그러면 타이틀은 예전 벡터 지도로
자동으로 돌아가므로 화면이 깨지지 않는다.
"""

from __future__ import annotations

import base64
import csv
import io
import pathlib
import sys

try:
    from PIL import Image, ImageFilter
except ModuleNotFoundError:
    sys.exit('Pillow가 필요하다:  pip install Pillow')

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets' / 'backdrop'
OUT = ROOT / 'src' / 'render' / 'backdropAssets.ts'
CREDITS = SRC / 'CREDITS.tsv'

# 2색조. 먹과 종이 사이를 잇는다 — 어떤 색 원본이 와도 같은 종이 위로 온다.
INK = (36, 26, 16)
PAPER = (217, 201, 163)

# 지도는 배경 전체를 덮으므로 길게, 유물은 조각으로 얹으므로 짧게.
MAP_LONG_EDGE = 1600
MAP_QUALITY = 62
PLATE_LONG_EDGE = 340
PLATE_QUALITY = 58
PLATE_BLUR = 2.2

# 기물 id는 towers.ts의 id와 맞춘다. 값은 그 기물의 모티브가 된 실물이다.
PLATE_IDS = {
    'archer': '각궁·편전',
    'sword': '환도·등패',
    'mage': '승자총통',
    'cannon': '문종 화차·신기전기',
    'frost': '거마작(拒馬柵)',
    'venom': '비격진천뢰',
    'musket': '조총',
    'banner': '형명(形名) 기고',
}

# 전투를 그린 기록화. 있으면 지도 위에 함께 흩는다. 없어도 그만이다.
SCENE_GLOB = 'scene*'

TOTAL_WARN_BYTES = 3_000_000


def duotone(img: Image.Image) -> Image.Image:
    """명암만 남기고 먹-종이 2색조로 다시 칠한다."""
    grey = img.convert('L')
    lut = []
    for channel in range(3):
        lo, hi = INK[channel], PAPER[channel]
        lut += [round(lo + (hi - lo) * (i / 255)) for i in range(256)]
    return grey.convert('RGB').point(lut)


def fit(img: Image.Image, long_edge: int) -> Image.Image:
    scale = long_edge / max(img.size)
    if scale >= 1:
        return img
    return img.resize(
        (max(1, round(img.width * scale)), max(1, round(img.height * scale))),
        Image.LANCZOS,
    )


def radial_alpha(size: tuple[int, int]) -> Image.Image:
    """가장자리를 녹인다.

    사진을 직사각형 그대로 얹으면 배경에 액자가 걸린 것처럼 보인다. 가운데는
    불투명하고 테두리로 갈수록 투명해지는 마스크를 씌워 종이에 배어들게 한다.
    """
    w, h = size
    mask = Image.new('L', size, 0)
    px = mask.load()
    cx, cy = (w - 1) / 2, (h - 1) / 2
    for y in range(h):
        dy = (y - cy) / max(cy, 1)
        for x in range(w):
            dx = (x - cx) / max(cx, 1)
            d = (dx * dx + dy * dy) ** 0.5
            # 60%까지는 그대로 두고 거기서부터 바깥으로 사그라든다.
            t = 1.0 if d <= 0.6 else max(0.0, 1.0 - (d - 0.6) / 0.42)
            px[x, y] = round(255 * t * t)
    return mask


def edge_alpha(size: tuple[int, int], feather: float = 0.10) -> Image.Image:
    """네 변만 부드럽게 사그라뜨린다.

    지도는 화면 전체에 깔리므로 직사각형 테두리가 그대로 보이면 배경 위에
    종이 한 장이 **얹혀 있는 것**이 아니라 창이 하나 뚫린 것처럼 보인다.
    유물 사진과 달리 가운데를 파먹으면 안 되므로(지명과 물줄기가 사라진다)
    가장자리만 좁게 녹인다.
    """
    w, h = size
    mask = Image.new('L', size, 255)
    px = mask.load()
    fx = max(1, round(w * feather))
    fy = max(1, round(h * feather))
    for y in range(h):
        ty = min(1.0, min(y, h - 1 - y) / fy)
        for x in range(w):
            tx = min(1.0, min(x, w - 1 - x) / fx)
            t = min(tx, ty)
            px[x, y] = round(255 * t * t)
    return mask


def encode(img: Image.Image, quality: int, alpha: bool) -> str:
    buf = io.BytesIO()
    img.save(buf, format='WEBP', quality=quality, method=6, exact=not alpha)
    return 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode('ascii')


def find(stem: str) -> pathlib.Path | None:
    for path in sorted(SRC.glob(stem + '.*')):
        if path.suffix.lower() in {'.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff'}:
            return path
    return None


def bake_map(path: pathlib.Path) -> tuple[str, int, int]:
    img = duotone(fit(Image.open(path), MAP_LONG_EDGE))
    # 지도는 주인공이라 흐리지 않는다. 뒤로 물러나는 일은 그리는 쪽의
    # 불투명도가 맡는다 — 여기서 뭉개면 지명과 물줄기가 사라진다.
    img.putalpha(edge_alpha(img.size))
    return encode(img, MAP_QUALITY, alpha=True), img.width, img.height


def bake_plate(path: pathlib.Path) -> tuple[str, int, int]:
    img = duotone(fit(Image.open(path), PLATE_LONG_EDGE))
    img = img.filter(ImageFilter.GaussianBlur(PLATE_BLUR))
    img.putalpha(radial_alpha(img.size))
    return encode(img, PLATE_QUALITY, alpha=True), img.width, img.height


def load_credits() -> dict[str, str]:
    """출처·라이선스 표. CC-BY 이미지를 쓴다면 이 표가 있어야 배포할 수 있다."""
    if not CREDITS.exists():
        return {}
    out: dict[str, str] = {}
    with CREDITS.open(encoding='utf-8') as fh:
        for row in csv.reader(fh, delimiter='\t'):
            if not row or row[0].startswith('#'):
                continue
            if len(row) < 3:
                sys.exit(f'CREDITS.tsv 행이 부족하다 (id/출처/라이선스): {row}')
            out[row[0].strip()] = f'{row[1].strip()} — {row[2].strip()}'
    return out


def ts_literal(value: str) -> str:
    return "'" + value.replace('\\', '\\\\').replace("'", "\\'") + "'"


def main() -> None:
    SRC.mkdir(parents=True, exist_ok=True)
    credits = load_credits()
    total = 0

    map_path = find('map')
    map_entry = 'null'
    if map_path:
        data, w, h = bake_map(map_path)
        total += len(data)
        map_entry = f'{{ data: {ts_literal(data)}, w: {w}, h: {h} }}'
        print(f'지도   {map_path.name:<28}{w}×{h}  {len(data) // 1024}KB')

    plates: list[str] = []
    for pid, motif in PLATE_IDS.items():
        path = find(pid)
        if not path:
            continue
        data, w, h = bake_plate(path)
        total += len(data)
        plates.append(
            f'  {{ id: {ts_literal(pid)}, motif: {ts_literal(motif)}, '
            f'data: {ts_literal(data)}, w: {w}, h: {h} }},'
        )
        print(f'기물   {path.name:<28}{w}×{h}  {len(data) // 1024}KB  {motif}')

    for path in sorted(SRC.glob(SCENE_GLOB)):
        if path.suffix.lower() not in {'.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff'}:
            continue
        data, w, h = bake_plate(path)
        total += len(data)
        plates.append(
            f'  {{ id: {ts_literal(path.stem)}, motif: {ts_literal("기록화")}, '
            f'data: {ts_literal(data)}, w: {w}, h: {h} }},'
        )
        print(f'기록화 {path.name:<28}{w}×{h}  {len(data) // 1024}KB')

    used = [p for p in PLATE_IDS if find(p)] + (['map'] if map_path else [])
    missing_credit = [p for p in used if p not in credits]
    if missing_credit:
        print(f'경고: CREDITS.tsv에 출처가 없다 — {", ".join(missing_credit)}', file=sys.stderr)

    credit_lines = ',\n'.join(
        f'  {ts_literal(f"{key}: {value}")}' for key, value in sorted(credits.items())
    )

    body = f'''/**
 * 타이틀 배경에 깔리는 실물 이미지. **생성 파일 — 직접 고치지 않는다.**
 *
 * `assets/backdrop/` 에 원본을 넣고 `python3 tools/bake-backdrop.py` 를
 * 실행하면 이 파일이 다시 만들어진다. 아티팩트 페이지가 외부 호스트를 전부
 * 막는 CSP 아래서 돌기 때문에 이미지는 번들 안에 `data:` URI로 들어간다.
 *
 * 비어 있으면 타이틀은 예전 벡터 지도로 자동으로 돌아간다.
 */

export interface BackdropImage {{
  id: string
  /** 이 사진이 무엇의 실물인지 — 기물 id와 짝이 맞는다. */
  motif: string
  data: string
  w: number
  h: number
}}

export const BACKDROP_MAP: {{ data: string; w: number; h: number }} | null = {map_entry}

export const BACKDROP_PLATES: readonly BackdropImage[] = [
{chr(10).join(plates)}
]

/** 출처와 라이선스. CC-BY 원본을 쓴다면 화면 어딘가에 이 줄이 남아야 한다. */
export const BACKDROP_CREDITS: readonly string[] = [
{credit_lines}
]
'''

    OUT.write_text(body, encoding='utf-8')
    kb = total // 1024
    print(f'\n{OUT.relative_to(ROOT)} 갱신 — 이미지 {len(plates) + (1 if map_path else 0)}장, {kb}KB')
    if total > TOTAL_WARN_BYTES:
        print(f'경고: {kb}KB는 번들에 비해 크다. 해상도나 품질을 낮추는 게 좋다.', file=sys.stderr)
    if not map_path and not plates:
        print('원본이 없다. assets/backdrop/README.md 가 어떤 파일이 필요한지 설명한다.')


if __name__ == '__main__':
    main()
