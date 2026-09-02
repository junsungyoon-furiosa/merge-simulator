# 환경값 근거 UI 구현 계획

- 상태: 구현 완료
- 작성일: 2026-09-01
- 선행 설계: `outputs/ENVIRONMENT_EVIDENCE_UI_DESIGN.md`
- 대상 스키마: ScenarioConfig schema v1

## 1. 목표

환경 파라미터 아홉 개의 현실 의미, 시뮬레이션 의미, 관측·추정값 상태와 긴 산출근거를 표시하고, 값이 준비된 프로필은 현재 시나리오에 개별 또는 일괄 적용할 수 있게 한다.

초기 Bors 프로필에는 확정된 관측·추정 숫자가 없다. 첫 배포에서는 근거 문서를 탐색할 수 있지만 적용 버튼은 비활성화된다. 적용 로직과 다이얼로그는 추정값을 가진 테스트 fixture로 완성해 두며, 나중에 프로필 데이터만 채우면 UI 코드 수정 없이 활성화돼야 한다.

## 2. 범위

포함:

- 시뮬레이션과 환경값 근거 화면 전환
- PR 2개, CI 4개, LLM 3개 목록과 상세
- 문서 상태와 추정값 상태 표시
- Markdown 기반 긴 산출근거와 표
- 개별 적용, 전체 적용과 변경 미리보기
- 파라미터별 출처와 적용 당시 값 저장
- 적용 후 수동 수정 상태 판별
- 최초 공개 ScenarioConfig schema v1과 일간 도착 프로필
- JSON, IndexedDB, 실험 스냅샷과 Replay 출처 보존
- 데스크톱·모바일 UI와 접근성
- 단위·컴포넌트·E2E 테스트와 명세 갱신

제외:

- Bors DB와 orchestrator 직접 연결
- 원시 데이터 수집·업로드·집계
- 프로필 생성·편집·비교 UI
- UI에서 Markdown 편집
- 정책 설정 자동 변경과 최적 정책 추천
- 실제 관측·추정 숫자 산출

## 3. 구현 원칙

1. 시뮬레이션 코어는 calibration 콘텐츠와 UI에 의존하지 않는다.
2. 파라미터 경로, 적용, 표시와 비교는 중앙 레지스트리에 한 번만 정의한다.
3. 프로필 타입은 아홉 개 항목의 존재와 값 종류를 검증한다.
4. 적용값이 없는 항목은 문서만 표시하고 적용 대상에서 제외한다.
5. 프로필 적용은 실험 설계값과 정책 설정을 변경하지 않는다.
6. 출처 메타데이터는 엔진 난수, 이벤트와 지표에 영향을 주지 않는다.
7. 개발 중 생성된 이전 저장 형식은 폐기하고 최초 공개 schema v1만 허용한다.
8. Markdown raw HTML은 렌더링하지 않는다.

## 4. Markdown 처리 결정

`react-markdown`과 `remark-gfm`을 의존성에 추가한다.

- Markdown 파일은 Vite `?raw` import로 문자열로 가져온다.
- `remark-gfm`으로 표와 GFM 목록을 지원한다.
- `skipHtml`을 활성화한다.
- `rehype-raw`와 `dangerouslySetInnerHTML`은 사용하지 않는다.
- 외부 링크에는 `rel="noreferrer"`를 지정한다.
- 환경값 화면 전체를 lazy load하여 Markdown 렌더러와 문서를 별도 chunk에 둔다.

공식 문서는 `react-markdown`이 기본적으로 raw HTML을 직접 실행하지 않는 경로이며 `remark-gfm`으로 GFM을 확장할 수 있다고 설명한다. 구현 시 pnpm이 선택한 현재 호환 버전을 lockfile에 고정한다.

참고: https://github.com/remarkjs/react-markdown/blob/main/readme.md

## 5. 목표 파일 구조

```text
src/
  calibration/
    model.ts
    parameterRegistry.ts
    applyCalibration.ts
    profiles/
      borsProduction2026Q2.ts
    evidence/
      registry.ts
      arrival-interval.md
      individual-defect-rate.md
      ci-failure-duration.md
      ci-success-duration.md
      ci-false-negative-rate.md
      ci-false-positive-rate.md
      llm-hit-rate.md
      llm-false-accusation-rate.md
      llm-duration.md
  ui/
    EnvironmentEvidencePage.tsx
    EnvironmentEvidencePage.test.tsx
    CalibrationApplyDialog.tsx
    environment-evidence.css
  test/
    calibration.test.ts
```

기존 변경 대상:

- `package.json`, `pnpm-lock.yaml`
- `src/sim/model.ts`
- `src/storage/schema.ts`, `export.ts`, `database.ts`
- `src/ui/App.tsx`, `App.test.tsx`, `ScenarioEditor.tsx`
- `src/ui/styles.css`
- `src/test/storage.test.ts`, `engine.test.ts`
- `e2e/smoke.spec.ts`
- `outputs/PR_MERGE_SIMULATOR_SPEC.md`

## 6. 작업 순서

### 작업 1. calibration 도메인 타입

`src/calibration/model.ts`에 다음을 정의한다.

- `DocumentationStatus`
- `EstimateState<T>` 판별 유니언
- `EvidenceSource`
- `ParameterEvidence<T>`와 `ParameterEvidenceMap`
- `CalibrationProfile`

완료 조건:

- `none` 상태에는 `estimate`를 넣을 수 없다.
- `provisional`과 `recommended`에는 올바른 타입의 값이 필수다.
- 프로필은 아홉 개 항목을 모두 포함한다.
- duration에는 `DurationInterval`만 허용한다.

### 작업 2. ScenarioConfig schema v1 모델

`src/sim/model.ts`에 `EnvironmentParameterId`, `EnvironmentParameterValueMap`과 저장용 snapshot 타입을 함께 둔다. 프로필 전용 타입은 이 공유 타입을 import한다.

```ts
type ParameterCalibrationSourceMap = {
  [K in EnvironmentParameterId]?: {
    profileId: string;
    profileVersion: number;
    appliedValue: EnvironmentParameterValueMap[K];
  };
};

interface ScenarioCalibration {
  parameters: ParameterCalibrationSourceMap;
}
```

구현 항목:

- `ScenarioConfig.schemaVersion`을 1로 확정
- `calibration?: ScenarioCalibration` 추가
- `DEFAULT_SCENARIO`은 일간 KST 도착 프로필을 포함한 v1이며 calibration은 없음
- 엔진 파일에는 calibration import나 분기 추가 금지

순환 의존성을 피하기 위해 파라미터 ID·값 매핑과 저장 snapshot 타입은 sim 모델에 두고, 프로필·문서 전용 타입은 calibration 모듈에 둔다. sim과 engine은 calibration 모듈을 import하지 않는다.

완료 조건:

- calibration 유무가 `runSimulation` 결과에 영향을 주지 않는다.
- 기본값 초기화가 자연스럽게 calibration을 제거한다.

### 작업 3. Zod 스키마와 저장 초기화

`src/storage/schema.ts`는 최초 공개 schema v1만 검증한다. `arrival`은 양수인 `meanPerDay`, `Asia/Seoul`, 정확히 24개의 0 이상 가중치와 양수인 가중치 합을 요구한다. 개발 중 사용한 v1~v3 변환기와 config-only 정책 호환은 제거한다. JSON은 v1만 가져오고 내보내며 IndexedDB 내부 버전을 올려 기존 시나리오와 실험을 비운다.

완료 조건:

- 현재 v1 JSON과 실험 스냅샷이 round trip 된다.
- 구형 schema와 도착 분포는 거부된다.
- 시간대 가중치와 파라미터별 출처가 보존된다.
- 잘못된 가중치 길이, 합계, 값 타입과 범위는 거부된다.

### 작업 4. 파라미터 중앙 레지스트리

`src/calibration/parameterRegistry.ts`에 각 파라미터의 다음 정보를 한 번만 정의한다.

- ID, 영역, UI 명칭, 단위
- 현실 의미와 시뮬레이션 의미
- scenario에서 현재값 읽기
- scenario에 값 적용
- UI 표시 문자열
- 현재값과 적용값 비교

적용 규칙:

- 숫자 필드는 대상 숫자 하나만 변경
- duration은 lower, upper, coverage 전체 변경
- `dailyPrCount`는 `arrival.meanPerDay`만 변경하고 KST 시간대 가중치는 유지
- 확률은 %, 시간은 분으로 표시
- duration 비교는 세 필드 전부 비교

완료 조건:

- ID가 중복되지 않고 정확히 아홉 개다.
- 레지스트리 순서는 PR → CI → LLM이다.
- apply가 대상 외 scenario 필드를 바꾸지 않는다.

### 작업 5. 순수 적용 로직

`src/calibration/applyCalibration.ts`는 React에 의존하지 않는 순수 함수만 제공한다.

- 적용 가능한 항목 조회
- 개별·전체 적용 미리보기 생성
- 개별·전체 적용
- 파라미터별 출처 상태 판별
- 적용 후 수정 여부 판별

적용은 환경값과 다음 출처를 함께 기록한다.

- profileId
- profileVersion
- appliedValue

규칙:

- 현재값과 추정값이 같아도 명시적으로 적용하면 출처 기록
- 미리보기는 `값 변경`과 `값 유지 및 출처 연결` 구분
- 미산출 항목은 적용 불가
- 다른 파라미터 출처와 비대상 scenario 필드는 보존
- 다른 프로필 적용은 대상 파라미터 출처만 교체
- 수동 입력은 출처를 지우지 않고 비교 결과로 수정 상태 계산

### 작업 6. 초기 프로필과 Markdown

`src/calibration/profiles/borsProduction2026Q2.ts`:

- 고정 profile ID와 version
- 아홉 개 모두 documentationStatus `draft`
- 아홉 개 모두 estimateStatus `none`
- 현재 시뮬레이터 기본값을 estimate로 복사하지 않음
- 사용자 초안의 의미와 산출근거 반영

각 Markdown은 같은 구조를 따른다.

```markdown
## 산출 방법
## 데이터 기준
## 상세 분석
## 한계와 주의사항
```

미정 항목은 `???` 대신 `아직 확정하지 않음`처럼 명시한다.

`evidence/registry.ts`는 안정적인 document ID를 `?raw` import에 연결한다. 임의 파일 경로를 런타임에 읽지 않는다.

완료 조건:

- 누락된 파라미터와 document ID가 없다.
- 초기 적용 가능 항목은 0개다.

### 작업 7. 환경값 근거 화면

`src/ui/EnvironmentEvidencePage.tsx` props:

```ts
interface EnvironmentEvidencePageProps {
  scenario: ScenarioConfig;
  profile: CalibrationProfile;
  disabled: boolean;
  onScenario: (scenario: ScenarioConfig) => void;
  onBack: () => void;
}
```

화면 구성:

- 프로필 이름·버전, 작성 상태와 적용 가능 수
- PR·CI·LLM 그룹 목록
- 선택 파라미터 상세
- 현실 의미와 시뮬레이션 의미
- 현재값, 관측·추정값과 상태 배지
- 관측 기간·표본·출처
- Markdown 근거
- 개별·전체 적용 버튼

초기 선택은 `dailyPrCount`이다. 목록 항목은 실제 button으로 만들고 선택 상태를 접근성 속성으로 전달한다.

`App.tsx`에서 `React.lazy`와 `Suspense`로 환경값 화면을 불러온다. 모바일은 목록과 상세를 세로로 배치한다.

완료 조건:

- 아홉 개와 두 종류 상태 확인 가능
- 긴 문단·목록·링크·표가 레이아웃을 깨지 않음
- 값 없는 항목의 적용 비활성
- 키보드로 목록 탐색과 복귀 가능

### 작업 8. 적용 미리보기 dialog

`src/ui/CalibrationApplyDialog.tsx`:

- 개별·전체 적용이 같은 preview model 사용
- 현재값, 적용값, 값 변경 여부 표시
- 적용 수와 미산출 제외 수 표시
- 네이티브 `dialog`와 `showModal` 우선 사용
- Escape, 닫기 후 포커스 복귀 지원
- 실행 중 적용 확인 비활성

완료 조건:

- 확인 전 scenario 불변
- 취소 시 불변
- 확인 시 값과 출처 동시 적용
- 같은 값도 출처 연결로 표시

### 작업 9. App과 ScenarioEditor 연결

`App.tsx`에 다음 상태를 추가한다.

```ts
type AppView = "simulation" | "environmentEvidence";
```

구현 항목:

- 상단 화면 전환
- ScenarioEditor에 환경값 근거 바로가기
- 전환 중 scenario, policies, result 유지
- 적용 완료 후 시뮬레이션 복귀와 메시지
- 실행 중 근거 탐색 허용, 값 적용 비활성
- footer schema v1 표시

`ScenarioEditor` 안내 문구는 다음 의미로 변경한다.

```text
직접 가정하거나 관측·추정값을 적용해 비교할 수 있습니다.
```

프로필 적용은 현재 scenario만 변경한다. 완료된 result는 기존처럼 유지하며 Replay는 계속 `result.scenario`를 사용한다.

### 작업 10. 스타일과 반응형

`environment-evidence.css`:

- 데스크톱은 왼쪽 그룹 목록과 오른쪽 상세 2열
- 상세 본문에 읽기 적합한 최대 폭
- Markdown 표는 의미를 유지하며 가로 스크롤
- 모바일은 목록과 상세 세로 배치
- dialog는 높이 초과 시 내부 스크롤
- 상태는 색상과 텍스트로 함께 표시
- 기존 CSS 토큰과 버튼 스타일 재사용

## 7. 테스트 계획

### calibration 단위 테스트

새 `src/test/calibration.test.ts`:

- 레지스트리 9개와 중복 부재
- 프로필의 모든 파라미터·문서 ID 존재
- 초기 적용 가능 수 0
- 숫자·확률·duration 개별 적용
- duration coverage 적용
- 전체 적용의 미산출 제외
- 같은 값의 출처 연결
- 수동 수정 상태
- 재적용과 다른 프로필 출처 교체
- 비대상 scenario 필드 보존
- 일간 평균 적용 시 시간대 가중치와 timezone 보존

테스트용 fixture에만 provisional·recommended 값을 둔다.

### 저장 테스트

`src/test/storage.test.ts`:

- schema v1 round trip
- 24개 시간대 가중치와 출처 보존
- 구형 schema·도착 분포·config-only 정책 거부
- 잘못된 키, 가중치 길이와 타입 거부
- 실험 결과 내부 scenario 보존

### 엔진 불변성 테스트

`src/test/engine.test.ts`에서 숫자가 같고 calibration 유무만 다른 시나리오의 `runSimulation` 결과가 완전히 같은지 검증한다.

### 컴포넌트 테스트

`EnvironmentEvidencePage.test.tsx`:

- 9개 목록과 그룹
- 선택에 따른 상세 변경
- 의미·상태·Markdown 표와 목록
- 초기 적용 비활성
- fixture 기반 개별·전체 미리보기
- 취소와 확인
- 같은 값 출처 연결
- 적용 후 수정 상태
- dialog role과 포커스 복귀

`App.test.tsx`:

- 화면 전환과 입력 유지
- 시뮬레이션 복귀
- 기본값 초기화 시 calibration 제거
- 적용 완료 메시지
- 기존 실행과 Replay snapshot 유지

### E2E

`e2e/smoke.spec.ts`:

1. 환경값 근거 화면 열기
2. 아홉 개와 `적용 가능 0/9` 확인
3. CI 거짓 음성률 상세의 정의 확인
4. 시뮬레이션으로 돌아와 기존 입력 유지 확인
5. 기존 정책 관리·실행·Replay 계속 검증

production에 가짜 값을 넣지 않기 위해 적용 성공은 fixture 기반 컴포넌트 테스트가 담당한다.

## 8. 명세 갱신

`outputs/PR_MERGE_SIMULATOR_SPEC.md`에 다음을 추가한다.

- 환경 파라미터 의미와 산출근거 표시
- 미산출 상태
- 관측·추정값 개별·일괄 적용
- 정책·실험 설계값 적용 제외
- 파라미터별 출처와 적용 당시 값 보존
- 출처 메타데이터의 엔진 비관측성
- 최초 공개 schema v1과 구형 개발 데이터 폐기

구현 후 이 문서에는 실제 파일과 검증 결과를 기록하는 `구현 결과` 절을 추가한다.

## 9. 검증 명령

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

엔진 알고리즘이나 성능 경로를 변경하지 않으므로 `pnpm benchmark`는 필수는 아니다. 전체 회귀 확인 시 함께 실행할 수 있다.

build 출력에서 환경값 화면과 Markdown 렌더러가 별도 lazy chunk인지 확인한다.

## 10. 중간 검증

| 시점 | 검증 |
|---|---|
| schema v1 완료 | typecheck, storage test |
| 레지스트리·적용 완료 | calibration test, engine 불변성 test |
| 프로필·Markdown 완료 | typecheck, registry test |
| 화면·dialog 완료 | component test, lint |
| App 연결 완료 | App test, E2E |
| 최종 | lint, typecheck, test, build, E2E |

## 11. 위험과 대응

### 타입 순환 의존성

저장 snapshot 타입은 sim 모델에 두고 UI 프로필 타입만 calibration 모듈에 둔다. sim과 engine은 calibration 모듈을 import하지 않는다.

### 프로필과 scenario 경로 불일치

read/apply/format/equals 레지스트리를 유일한 매핑 지점으로 사용한다.

### 초기 적용값 부재

`값 미산출` 상태를 명확히 보여주고 적용 로직은 fixture로 완성한다. production에 근거 없는 값을 넣지 않는다.

### 번들 크기

환경값 화면 전체를 lazy load하고 build chunk 분리를 확인한다.

### schema 회귀

버전별 fixture와 중첩 experiment scenario 테스트를 추가하고 기존 v1 변환을 제거하지 않는다.

### 수동 수정과 출처

appliedValue를 저장하고 `적용됨`과 `적용 후 수정됨`을 구분한다.

### Markdown 안전성

raw HTML 플러그인을 사용하지 않고 `skipHtml`을 적용한다. 첫 버전은 저장소의 검토된 정적 Markdown만 포함한다.

## 11.1 일간 도착 모델 개정

- 사용자는 근무일당 평균 PR 생성 수를 입력한다.
- 엔진은 제공된 KST 24시간 Count 3,334건을 가중치로 사용한다.
- 모든 날을 같은 평일로 취급하며 주말과 휴일은 모델링하지 않는다.
- 시간대별 생성 수는 포아송 분포, 시간 안의 정확한 시각은 균등분포로 생성한다.
- 도착 난수와 결함 난수를 분리해 일간 도착량 변경이 결함 PR 배정을 바꾸지 않게 한다.
- 기본 144 PR/일은 과거 데모 강도를 환산한 값이며 현실 관측값이 아니다.

## 12. 완료 조건

1. 아홉 개 파라미터의 목록과 상세 근거를 확인할 수 있다.
2. 초기 Bors 프로필은 모두 `draft`·`none`이다.
3. 미산출 항목은 적용되지 않는다.
4. fixture로 개별·전체 적용, 미리보기와 취소가 검증된다.
5. 값과 파라미터별 출처가 함께 저장된다.
6. 적용 후 수동 수정 상태가 구분된다.
7. 기본값 초기화가 calibration을 제거한다.
8. schema v1 JSON과 저장 실험을 불러오며 구형 개발 데이터는 거부한다.
9. Replay는 실험 당시 scenario를 사용한다.
10. calibration이 엔진 결과에 영향을 주지 않는다.
11. 기존 정책 관리·실행·Replay E2E가 통과한다.
12. lint, typecheck, test, build, E2E가 모두 통과한다.
13. 기준 명세와 구현 결과 문서가 갱신된다.

## 13. 구현 순서 요약

```text
타입
  → schema v1과 저장 초기화
  → 파라미터 레지스트리
  → 순수 적용 로직
  → 초기 프로필과 Markdown
  → 근거 화면
  → 적용 dialog
  → App 연결
  → 명세·테스트·최종 검증
```

각 단계는 앞 단계 테스트가 통과한 뒤 진행한다. UI부터 만들어 임시 타입이나 중복 매핑이 고착되지 않게 한다.

