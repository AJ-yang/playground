# playground

이것저것 만들어 보는 저장소. 갈래별로 폴더를 두고 그 아래에 프로젝트를 하나씩 넣는다.

| 갈래 | 무엇을 넣는가 |
| --- | --- |
| [`Games/`](Games/) | 게임 |
| [`Services/`](Services/) | 도구·웹서비스·API·자동화 |

| 프로젝트 | 무엇 | 상태 |
| --- | --- | --- |
| [`Games/joseon-defense/`](Games/joseon-defense/) | **조선 방어전** — 왜구의 노략에서 병자호란까지, 여섯 전쟁으로부터 성을 지키는 경로형 타워디펜스 | [배포됨](https://aj-yang.github.io/playground/joseon-defense/) |
| [`Games/casino-learning-game/`](Games/casino-learning-game/) | **카지노 게임 배우기** — 걸어다니며 룰을 익히는 학습용 카지노 | [배포됨](https://aj-yang.github.io/playground/casino-learning-game/) |
| [`Services/gyeol/`](Services/gyeol/) | **결(gyeol)** — 영화·드라마 취향에 이름을 붙여주는 서비스 | [배포됨](https://aj-yang.github.io/playground/gyeol/) |

갈래 폴더 밖의 것들은 프로젝트가 아니다.

- [`site/`](site/) — <https://aj-yang.github.io/playground/> 로 배포되는 랜딩
  페이지(`index.html` 한 장). 프로젝트를 추가하면 여기에 카드를 붙인다.
- `.claude/`·`.agents/`·`skills-lock.json` — 이 저장소에서 쓰는 도구 설정
- `.github/workflows/` — 검증(`verify.yml`)과 배포(`deploy.yml`)

## 조선 방어전

TypeScript + HTML5 Canvas, 게임 엔진 의존성 없음. 스프라이트 파일도 없이 손으로
쓴 SVG 패스를 `Path2D`로 그린다.

**놀아 보기** → <https://aj-yang.github.io/playground/joseon-defense/>

```bash
cd Games/joseon-defense
npm install
npm run dev        # http://localhost:5173
npm run balance    # 밸런스 회귀 게이트 — 설계 의도가 깨지면 종료 코드 1
```

이 프로젝트의 특징은 밸런스를 **눈이 아니라 시뮬레이터로** 잡았다는 것이다.
브라우저와 같은 `Game` 클래스를 렌더링 없이 돌려 빌드 방침만 다른 대조군 AI
20종 × 20판 × 6스테이지(2,400판)를 약 100초에 끝낸다. 밸런스가 무너진 세 번이
전부 "기물을 더 지었는데 더 나빠진다"는 같은 모양이었고 코드를 읽어서는 안
보였기 때문에, 그 판단을 CI로 옮겨 뒀다.

자세한 것은 [`Games/joseon-defense/README.md`](Games/joseon-defense/README.md)와
[`Games/joseon-defense/docs/`](Games/joseon-defense/docs/) 아래 문서들:

- [`GDD.md`](Games/joseon-defense/docs/GDD.md) — 설계 의도와 참고 게임 분석
- [`BALANCE.md`](Games/joseon-defense/docs/BALANCE.md) — 밸런스 검증 방법·결과·근거
- [`ROADMAP.md`](Games/joseon-defense/docs/ROADMAP.md) — 다음 작업 계획

## 배포

`main`에 푸시되면 `.github/workflows/deploy.yml`이 GitHub Pages로 올린다. 같은
푸시에서 `verify.yml`이 타입 검사·빌드·밸런스 게이트를 돌린다.

**주소는 저장소 구조를 그대로 따라간다.**

| 저장소 | 주소 |
|---|---|
| `site/index.html` | <https://aj-yang.github.io/playground/> |
| `Games/joseon-defense/dist` | <https://aj-yang.github.io/playground/joseon-defense/> |
| `Games/casino-learning-game/index.html` | <https://aj-yang.github.io/playground/casino-learning-game/> |
| `Services/gyeol/out` | <https://aj-yang.github.io/playground/gyeol/> |

**결은 앞의 셋과 달리 주소가 빌드 시점에 박힌다.** Next.js 정적
내보내기라 `basePath`가 산출물 안에 문자열로 들어가서, 파일을 옮기는 것만으로는
주소가 바뀌지 않는다. 배포 경로를 넣어 다시 굽는다 —
[`Services/README.md`](Services/README.md)에 적어 뒀다. 결은 전에
`aj-yang.github.io/gyeol`에서 서빙됐고, 옛 주소로 뿌려진 공유 링크를 어떻게
할지는 남은 작업이다.

첫 칸(`/playground/`)은 저장소 이름이라 바꿀 수 없다. 대신 그 아래를 저장소
구조와 맞춰 두면 주소에 프로젝트 이름이 드러나고, 프로젝트를 늘려도 서로
자리를 다투지 않는다. 프로젝트를 추가할 때는 `deploy.yml`의 「배포 트리 조립」
단계에 한 줄, `site/index.html`에 카드 하나를 붙이면 된다.
