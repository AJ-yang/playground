# Games

| 프로젝트 | 무엇 | 상태 |
| --- | --- | --- |
| [`joseon-defense/`](joseon-defense/) | **조선 방어전** — 왜구의 노략에서 병자호란까지, 여섯 전쟁으로부터 성을 지키는 경로형 타워디펜스 | [배포됨](https://aj-yang.github.io/playground/joseon-defense/) |
| [`casino-learning-game/`](casino-learning-game/) | **카지노 게임 배우기** — 걸어다니며 룰을 익히는 학습용 카지노 | [배포됨](https://aj-yang.github.io/playground/casino-learning-game/) |

**빌드가 있는 프로젝트와 없는 프로젝트가 섞여 있다.** 조선 방어전은 vite로
`dist`를 굽고, 카지노 학습 게임은 `index.html` 한 장이 곧 게임이라 빌드 단계가
없다. 그래서 `deploy.yml`의 조립 단계는 갈래 폴더를 훑지 않고 **프로젝트마다
올릴 것을 따로 적는다.**

## 프로젝트를 추가할 때

저장소 루트 [`README.md`](../README.md)의 「배포」 절을 따른다 — `deploy.yml`의
「배포 트리 조립」 단계에 한 줄, `site/index.html`에 카드 하나, 그리고 위 표와
루트 표에 한 줄씩.
