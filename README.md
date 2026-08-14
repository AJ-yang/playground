# playground

이것저것 만들어 보는 저장소. 갈래별로 폴더를 두고 그 아래에 프로젝트를 하나씩 넣는다.

| 갈래 | 무엇을 넣는가 | 기준 |
| --- | --- | --- |
| [`Games/`](Games/) | 놀라고 만든 것 | **재밌나?** |
| [`Services/`](Services/) | 쓰라고 만든 것 — 도구·웹서비스·API·자동화 | **되나?** |

**갈래는 취향 분류가 아니라 판단 기준의 분류다.** 재미로 평가하는 것과 쓸모로
평가하는 것은 검증 방법도, 문서에 남겨야 하는 것도 다르다. 그래서 갈라 둔다.

| 프로젝트 | 무엇 | 상태 |
| --- | --- | --- |
| [`Games/joseon-defense/`](Games/joseon-defense/) | **조선 방어전** — 왜구의 노략에서 병자호란까지, 여섯 전쟁으로부터 성을 지키는 경로형 타워디펜스 | [배포됨](https://aj-yang.github.io/playground/joseon-defense/) |
| [`Games/casino-learning-game/`](Games/casino-learning-game/) | **카지노 게임 배우기** — 걸어다니며 룰을 익히는 학습용 카지노 | [배포됨](https://aj-yang.github.io/playground/casino-learning-game/) |
| [`Services/gyeol/`](Services/gyeol/) | **결(gyeol)** — 영화·드라마 취향에 이름을 붙여주는 서비스 | [배포됨](https://aj-yang.github.io/gyeol/) · 자체 저장소에서 배포 |

저장소 루트의 `.claude/`·`.agents/`·`skills-lock.json`은 프로젝트가 아니라 이
저장소에서 쓰는 도구 설정이다.

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

**`Services/gyeol/`은 이 표에 없다.** 소스만 여기 있고 배포는 원본
저장소(`AJ-yang/gyeol`)의 `gh-pages`가 계속 맡는다 — 빌드에 필요한 카탈로그가
`.gitignore` 대상이라 이 저장소의 CI로는 만들 수 없고, 주소를 옮기면 이미 뿌린
공유 링크가 죽는다. 자세한 것은 [`Services/README.md`](Services/README.md).

첫 칸(`/playground/`)은 저장소 이름이라 바꿀 수 없다. 대신 그 아래를 저장소
구조와 맞춰 두면 주소에 프로젝트 이름이 드러나고, 프로젝트를 늘려도 서로
자리를 다투지 않는다. 프로젝트를 추가할 때는 `deploy.yml`의 「배포 트리 조립」
단계에 한 줄, `site/index.html`에 카드 하나를 붙이면 된다.
