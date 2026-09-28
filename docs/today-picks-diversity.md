# 오늘의 추천 키워드: 주제별 30개와 최근 추천 이력

기본 목표는 32개 주제별 30개다. 화면의 주제 숫자는 전체 개수이고, 황금 비율·시즌·일반 개수를 별도로 표시한다. 무료 열람은 기존과 같이 주제별 3개다.

`scripts/today-picks-selection.js`는 공개 JSON에 포함된 최근 7일 이력과 직전 추천을 함께 읽는다. 공백·대소문자·전각 차이는 같은 키워드로 처리한다. 새 후보 안에서는 황금 비율을 우선하고 입찰가를 반영한다. 새로운 실측 후보가 모자란 경우에만 오래전에 추천한 키워드부터 채우며, `freshness.status=repeated`와 실제 마지막 추천일을 기록한다. 중복 방지를 위해 점수나 측정치를 임의로 바꾸지 않는다.

공개 결과의 `history.entries`가 다음 회차로 전달되므로 러너나 일일 캐시가 바뀌어도 이력이 유지된다. `novelty`는 전체 신규·재추천 개수, 주제의 `targetCount`·`shortfall`은 목표와 부족분이다. 실패한 실행은 `.partial`까지만 저장하고 공개 파일과 추천 이력을 교체하지 않는다. `selectionVersion=2`와 목표 수가 맞는 같은 회차만 완료로 판단한다.

문서수 캐시는 실제 측정 시각을 유지하며 24시간 이내만 재사용한다. 월 검색량은 창고의 검색광고 데이터이고, 실시간 급등 수치나 수익 보장은 아니다. 새 후보가 적은 주제에서는 반복이 남을 수 있으며, 화면에 이를 숨기지 않는다.

검증: `today-picks-selection.test.ts`, `today-picks-generator.test.ts`, `today-picks-rounds.test.ts`, `today-picks-workflow.test.ts`와 사이트의 `today-picks-model.test.mjs`, `today-picks-ui.test.mjs`.
