# Repository Instructions

## Project purpose

MergeLab은 PR 병합 정책을 비교하는 브라우저 전용 이산사건
시뮬레이터다. 정책의 우열을 자동으로 판정하지 않는다.

요구사항의 기준 문서:
- outputs/PR_MERGE_SIMULATOR_SPEC.md

## Architecture boundaries

- React + TypeScript + Vite를 유지한다.
- 시뮬레이션 코어는 UI에 의존하지 않는 순수 TypeScript로 유지한다.
- 계산은 Dedicated Web Worker에서 실행한다.
- 서버, 로그인, 중앙 데이터베이스를 추가하지 않는다.
- 정책에는 숨겨진 결함 정보와 미래 난수를 노출하지 않는다.
- 모든 결과 지표는 이벤트 로그에서 계산한다.
- LLM 판단만으로 PR을 격리하지 않는다.

## Required validation

코드를 변경한 후 관련 범위에 맞게 다음을 실행한다.

- pnpm lint
- pnpm typecheck
- pnpm test
- pnpm build
- UI 흐름 변경 시 pnpm test:e2e
- 엔진 성능 변경 시 pnpm benchmark

## Performance budget

- PR 1,000개
- 정책당 100회 반복
- 정책 3개 비교
- 일반 데스크톱 브라우저에서 30초 이내

## Change discipline

- 시뮬레이션 규칙을 변경하면 요구사항 문서와 테스트도 갱신한다.
- 난수 소비 순서를 변경할 때 재현성 테스트를 확인한다.
- 새 정책은 기존 정책 인터페이스로 구현한다.
- 실제 데이터 보정과 정책 자동 추천은 현재 범위 밖이다.
