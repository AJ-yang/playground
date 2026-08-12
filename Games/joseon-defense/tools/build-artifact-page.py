import glob, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
bundle = pathlib.Path(glob.glob(str(ROOT / 'dist/assets/index-*.js'))[0]).read_text()

# 설명을 전부 걷어내고 캔버스만 남긴다. 게임 코드는 손대지 않았다 —
# main.ts가 캔버스에 인라인 style.width/height(px)를 박기 때문에 페이지 쪽에서
# 다시 덮어써야 한다. 아래 맞춤 스크립트를 번들 '뒤'의 모듈로 두는 이유가 그것이다
# (모듈 스크립트는 문서 순서대로 실행되므로 main.ts의 초기 지정 다음에 돈다).
# 입력은 getBoundingClientRect의 실제 폭·높이 비율로 좌표를 환산하므로
# 어떤 크기로 늘리든 클릭 판정이 그대로 맞는다.

page = f'''<meta charset="utf-8">
<!-- 아티팩트 호스트가 같은 값을 넣어 주지만, 단독 파일로 열어도
     좁은 화면 판정이 맞도록 직접 박아 둔다. 이게 없으면 폰에서도
     레이아웃 폭이 980px로 잡혀 안내가 뜨지 않는다. -->
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>조선 방어전 — 조선 전쟁 타워디펜스</title>
<style>
  :root {{ color-scheme: dark; }}

  html, body {{
    margin: 0;
    padding: 0;
    background: #0b0e14;
  }}

  body {{
    display: flex;
    align-items: center;
    justify-content: center;
  }}

  /* 단독 탭으로 열렸을 때만 화면 높이를 채운다. iframe 안에서는 아래 참조. */
  html.standalone, html.standalone body {{ height: 100%; }}
  html.standalone body {{ min-height: 100vh; min-height: 100svh; overflow: hidden; }}

  canvas#game {{
    display: block;
    touch-action: none;
    cursor: crosshair;
  }}

  canvas#game:focus-visible {{ outline: 2px solid #f0c674; outline-offset: -2px; }}

  /* ── 좁은 화면 안내 ───────────────────────────────────────────
     이 게임은 1230×678, 비율 1.81의 가로 레이아웃이다. 세로로 든 폰
     폭에 맞추면 배율이 0.32배까지 떨어져 HUD 글자가 4px가 된다 —
     읽는 것도 40px 타일을 손가락으로 찍는 것도 불가능하다. 그래서
     막지 않고 알려만 주고, 원하면 그대로 진행할 수 있게 둔다.
     방향(orientation)이 아니라 폭으로 판정하는 이유: 아티팩트는
     iframe 안에서 돌고 그 iframe은 폭에서 높이가 나오므로 항상
     가로로 잡힌다. 폰을 돌려 패널이 넓어지면 안내가 사라진다. */
  #rotate {{ display: none; }}

  @media (max-width: 700px) and (pointer: coarse) {{
    html:not(.rotate-dismissed) #rotate {{
      display: flex;
      position: fixed;
      inset: 0;
      z-index: 10;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: rgba(11, 14, 20, 0.94);
      -webkit-backdrop-filter: blur(2px);
      backdrop-filter: blur(2px);
    }}
  }}

  #rotate > div {{
    max-width: 30ch;
    text-align: center;
    font: 15px/1.7 -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Pretendard',
      'Malgun Gothic', system-ui, sans-serif;
    color: #e6edf3;
  }}

  #rotate .icon {{ font-size: 34px; display: block; margin-bottom: 10px; }}
  #rotate .lede {{ font-size: 17px; font-weight: 700; margin: 0 0 8px; }}
  #rotate .sub {{ font-size: 13px; color: #8b949e; margin: 0 0 18px; }}

  #rotate button {{
    font: inherit;
    font-size: 13px;
    color: #e6edf3;
    background: #171f2b;
    border: 1px solid #222c3a;
    border-radius: 8px;
    padding: 9px 18px;
    cursor: pointer;
  }}
</style>

<canvas id="game" tabindex="0" aria-label="조선 방어전 게임 화면"></canvas>

<div id="rotate">
  <div>
    <span class="icon">⟳</span>
    <p class="lede">가로로 돌려 주세요</p>
    <p class="sub">
      가로 화면에 맞춰 만든 게임입니다. 이 폭에서는 글자가 4px까지 줄어
      읽기 어렵습니다.
    </p>
    <button id="rotate-dismiss" type="button">그대로 하기</button>
  </div>
</div>

<script type="module">
{bundle}
</script>

<script type="module">
  const canvas = document.getElementById('game')
  const root = document.documentElement

  // 캔버스는 대체 요소라 width/height 속성에서 고유 비율이 나온다.
  // dpr 배율은 양쪽에 똑같이 걸리므로 비율은 그대로다.
  const ratio = canvas.width / canvas.height

  // iframe 안에서는 높이를 기준으로 삼지 않는다. 호스트가 '문서 높이'를 재서
  // iframe 높이를 정하기 때문에, 높이를 화면 높이에 맞추면
  // iframe 높이 → 화면 높이 → 문서 높이가 서로를 물어 한번 작아진 크기에
  // 그대로 잠긴다. 폭에서만 높이를 파생시키면 그 고리가 끊긴다.
  const embedded = window.self !== window.top
  root.classList.toggle('standalone', !embedded)

  let applied = -1

  function fit() {{
    const avail = root.clientWidth
    if (!avail) return
    // 단독 실행일 때만 높이에도 맞춰 한 화면에 넣는다.
    const w = embedded ? avail : Math.min(avail, window.innerHeight * ratio)
    // 같은 값을 다시 쓰지 않는다 — 아래 ResizeObserver가 제 꼬리를 물지 않도록.
    if (Math.abs(w - applied) < 0.5) return
    applied = w
    canvas.style.setProperty('width', w + 'px', 'important')
    canvas.style.setProperty('height', w / ratio + 'px', 'important')
  }}

  // 첫 호출은 레이아웃이 확정되기 전이라 innerHeight를 잘못 읽는다
  // (폰 가로에서 342 대신 413으로 잡혀 높이 맞춤이 통째로 빗나갔다).
  // 그래서 프레임 하나 뒤와 load 시점에 한 번씩 더 잰다.
  fit()
  requestAnimationFrame(fit)
  addEventListener('load', fit)
  addEventListener('resize', fit)
  // iOS는 회전 직후 innerHeight가 아직 옛 값이라 한 박자 늦게 다시 잰다.
  addEventListener('orientationchange', () => setTimeout(fit, 150))
  // 주소창이 접히거나 호스트가 iframe을 줄이는 것은 resize로 안 올 수 있다.
  window.visualViewport?.addEventListener('resize', fit)
  new ResizeObserver(fit).observe(root)

  document.getElementById('rotate-dismiss').addEventListener('click', () => {{
    root.classList.add('rotate-dismissed')
    fit()
    canvas.focus()
  }})
</script>
'''

out = ROOT / 'joseon-defense.html'
out.write_text(page)
print(out, f'{out.stat().st_size / 1024:.0f}KB')
