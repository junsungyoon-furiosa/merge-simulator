# Merge Simulator

PR 병합 정책을 동일한 숨겨진 PR 세계에서 반복 실행해 안전성, 속도, 처리량과 자원 사용량을 비교하는 브라우저 전용 시뮬레이터입니다.

## 실행

Node.js 24와 pnpm 11이 필요합니다.

```bash
pnpm install
pnpm dev
```

프로덕션 빌드는 `pnpm build`로 생성합니다. 별도 서버, 로그인 또는 중앙 데이터베이스는 사용하지 않으며 설정과 결과는 브라우저 IndexedDB에 저장됩니다.

## 검증

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm benchmark
```

브라우저 테스트를 처음 실행할 때는 `pnpm exec playwright install chromium`이 필요할 수 있습니다.

## 구조

- `src/sim`: 재현 가능한 난수, 숨겨진 PR 세계, 이산사건 엔진, 정책, 지표
- `src/worker`: Dedicated Web Worker 프로토콜과 클라이언트
- `src/ui`: 시나리오 편집, 정책 비교, Canvas 타임라인
- `src/storage`: IndexedDB와 JSON/CSV 입출력

요구사항 원문은 `outputs/PR_MERGE_SIMULATOR_SPEC.md`에 있습니다.
