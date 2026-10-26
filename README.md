# TFT 패치 분석 자동화

공식 TFT 패치노트와 MetaTFT 통계를 함께 읽고, 이전 패치 대비 덱·챔피언의 개선과 악화를 한국어로 보고합니다.

- 첫 보고: [18.4b → 18.5b 분석](reports/18.5b-analysis.md)
- 전체 비교표: [덱·챔피언 데이터](reports/18.5b-data.md)
- 운영 절차: [RUNBOOK.md](RUNBOOK.md)
- 출처: [Riot 패치 목록](https://teamfighttactics.leagueoflegends.com/en-us/news/tags/patch-notes/), [MetaTFT 덱](https://www.metatft.com/comps), [MetaTFT 챔피언](https://www.metatft.com/units)

## 실행 방식

Codex의 이 대화에 연결된 정기 자동화가 4시간마다 공식 문서와 최신 통계 버전을 확인합니다. GitHub Actions 서버가 상시 수집하는 구조는 아닙니다. 로컬 자동화가 실행될 때 컴퓨터와 앱이 켜져 있어야 합니다. 활성화 여부와 자동화 ID는 `state/monitor.json`에 기록합니다.

새 본 패치·B패치·밸런스 핫픽스는 감지 시 요약을 만들고, 통계가 쌓인 뒤 24시간·72시간 보고로 갱신합니다. 변경이 없으면 알림 없이 종료합니다. 매일 09시 실행에서는 다음 비교에 사용할 기준 통계를 보관합니다. 사이트 장애·필터 변경·데이터 부족을 성공으로 처리하지 않습니다.

## 비교 기준

일반 랭크, 에메랄드 이상, 지역 별도 제한 없음(사이트 기본값). 패치는 단일 버전만 선택합니다. 과거 데이터가 없으면 비교 불가로 표시하고 이미 보관한 스냅샷을 사용합니다. 다른 세트는 새 기준선을 시작합니다.

평균 등수가 낮아지는 방향이 개선입니다. 현재 강한 조합과 이전보다 개선된 조합은 다릅니다. 전체 유닛 평균에는 성급·아이템·경제력·생존자 편향이 있습니다. 덱의 순방률이나 표본 수가 화면에 없으면 추정값으로 채우지 않습니다.

이번 첫 보고는 MetaTFT 공개 화면의 지난 7일 필터를 사용합니다. 실제 집계 기간은 각 패치의 가동 기간에 따라 다르므로 인과 효과나 통계적 유의성을 단정하지 않습니다. 원본 표, 정규화 JSON, 계산된 전체 표를 함께 보관합니다.

## 로컬 재현 (Node.js, 추가 패키지 불필요)

```sh
node scripts/import-capture.mjs
node --test tests/*.test.mjs
node scripts/compare.mjs data/snapshots/18.4b.json data/snapshots/18.5b.json reports/18.5b-data.md
```

`import-capture.mjs`는 2026-10-27 첫 수집 원본을 재현하는 전용 변환기입니다. 반복 수집기가 아니며, 이후 실행에서는 현재 UI와 메타데이터를 확인해 같은 JSON 형식의 새 스냅샷을 만듭니다. 동적 웹사이트 수집·패치 해석은 Codex 정기 자동화가 담당하고, 비교 계산·검증은 `compare.mjs`가 담당합니다.

`data/raw/`는 직접 읽은 MetaTFT 화면의 통계, `data/snapshots/`는 필터·표본·출처를 포함한 JSON입니다. 전체 패치노트 본문은 복제하지 않고 공식 링크와 필요한 변경 요약만 남깁니다.
