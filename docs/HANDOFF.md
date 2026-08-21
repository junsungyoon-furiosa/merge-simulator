# Project Handoff

## Current status

- MVP 구현 완료
- 브라우저 전용 실행
- 세 기준 정책 구현
- Worker, 애니메이션, IndexedDB, JSON/CSV 구현
- 단위·UI 테스트 및 프로덕션 빌드 통과

## Implemented subsystems

- src/sim: 엔진, 난수, 세계 생성, 정책, 지표
- src/worker: Worker 프로토콜과 실행
- src/ui: 설정, 비교 결과, Canvas 재생
- src/storage: 저장 및 내보내기

## Known limitations

- 실제 PR 데이터 가져오기 미지원
- master 복구·롤백 미지원
- 사용자 정의 정책 미지원
- 반복 실행은 단일 Worker에서 처리
- 모든 반복의 원시 로그를 영구 저장하지 않음

## Deferred work

- 민감도 분석
- 사용자 정책 DSL
- 다중 Worker 병렬화
- 추가 확률분포
- 대규모 로그 압축
- 실제 데이터 보정

## Last verification

- pnpm lint
- pnpm typecheck
- pnpm test
- pnpm build
- pnpm benchmark

검증 날짜와 결과를 작업할 때마다 갱신한다.
