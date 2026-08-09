"""빌드된 번들을 단일 HTML 페이지로 인라인해 아티팩트로 올릴 수 있게 만든다.

    npm run build && python3 tools/build-artifact-page.py

산출물은 joseon-defense.html 하나뿐이고 외부 요청이 전혀 없다. 개발 환경의
네트워크 정책상 에셋 사이트에 닿지 못해 아트를 전부 손으로 그린 패스로 둔
것이 여기서 이득이 됐다 — 폰트도 이미지도 없으니 통째로 한 파일에 들어간다.

페이지에는 캔버스 하나만 둔다. 설명을 곁들이던 판본도 있었지만, 이 페이지를
여는 사람이 원하는 것은 게임이지 게임에 대한 글이 아니다. 읽을거리는
docs/GDD.md와 docs/BALANCE.md에 있다.
"""

import glob
import pathlib

bundle = pathlib.Path(glob.glob("dist/assets/index-*.js")[0]).read_text()

# 게임 코드는 건드리지 않는다. 캔버스는 대체 요소라 width/height 속성
# (1230×678, dpr 배율은 양쪽에 똑같이 걸린다)에서 고유 비율을 얻으므로,
# width만 100%로 주고 height를 auto로 두면 비율이 유지된 채 커진다.
# main.ts가 캔버스에 인라인 style을 px로 박기 때문에 !important가 필요하고,
# 입력은 getBoundingClientRect의 실제 폭 비율로 좌표를 환산하므로
# CSS로 늘려도 클릭 판정이 그대로 맞는다.
#
# 높이를 vh로 잡지 않는 이유: 아티팩트는 iframe 안에서 돌고 호스트가 문서
# 높이를 재서 iframe 크기를 정한다. 높이가 vh에 걸리면 iframe 높이 → vh →
# 문서 높이가 서로를 물어 한번 작아지면 계속 작아진다. 높이를 폭에서만
# 파생시키면 그 고리가 끊긴다.
page = f"""<meta charset="utf-8">
<title>조선 방어전 — 조선 전쟁 타워디펜스</title>
<style>
  :root {{ color-scheme: dark; }}

  html, body {{
    margin: 0;
    padding: 0;
    background: #0b0e14;
  }}

  canvas#game {{
    display: block;
    width: 100% !important;
    height: auto !important;
    touch-action: none;
    cursor: crosshair;
  }}

  canvas#game:focus-visible {{ outline: 2px solid #f0c674; outline-offset: -2px; }}
</style>

<canvas id="game" tabindex="0" aria-label="조선 방어전 게임 화면"></canvas>

<script type="module">
{bundle}
</script>
"""

out = pathlib.Path("joseon-defense.html")
out.write_text(page)
print(out, f"{out.stat().st_size / 1024:.0f}KB")
