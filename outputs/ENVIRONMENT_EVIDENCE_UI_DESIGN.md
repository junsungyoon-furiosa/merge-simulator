# 환경값 근거 UI 기획·설계

- 상태: 6단계 완료 — 구현 및 검증
- 작성일: 2026-09-01
- 대상 프로젝트: Merge Simulator
- 관련 기준 문서: `outputs/PR_MERGE_SIMULATOR_SPEC.md`

## 1. 배경과 목적

Merge Simulator의 환경 파라미터는 정책 비교 결과에 직접 영향을 주지만, 현재 UI에서는 짧은 도움말과 입력값만 제공한다. 사용자는 각 값이 현실에서 무엇을 뜻하는지, 시뮬레이션 엔진에서 어떻게 사용되는지, 어떤 현실 자료를 바탕으로 값을 정할 수 있는지 한곳에서 확인하기 어렵다.

이 기능은 다음 두 역할을 제공한다.

1. **파라미터 근거 카탈로그**: 각 환경 파라미터의 현실적 의미, 시뮬레이션 의미, 관측·추정값과 산출근거를 설명한다.
2. **현실 기반 설정 프로필**: 산출된 관측·추정값을 현재 실험 조건에 개별 또는 일괄 적용한다.

이 기능은 최적 정책을 자동 추천하지 않는다. 사용자가 현실 근거와 추정의 한계를 이해한 뒤 실험 조건을 구성하도록 돕는 것이 목적이다.

## 2. 용어

### 2.1 화면 명칭

화면 이름은 **환경값 근거**로 한다.

- `파라미터 설명`은 산출근거와 값 적용 기능을 충분히 드러내지 못한다.
- `현실값`은 특정 기간과 방법으로 추정한 값이 절대적인 사실인 것처럼 보일 수 있다.
- `환경값 근거`는 의미, 추정값, 산출 과정과 적용 기능을 함께 포괄한다.

### 2.2 값의 명칭

`실제값` 대신 **관측·추정값**을 사용한다. 값에는 가능하면 다음 메타데이터를 함께 표시한다.

- 관측 기간
- 표본 수
- 데이터 출처
- 산출 방법
- 마지막 갱신일
- 추정의 한계

### 2.3 문서 작성 상태와 추정값 상태

문서의 완성도와 적용할 숫자의 존재 여부는 서로 다른 상태다. 예를 들어 현실 의미와 산출 방법을 작성하는 중이지만 관측값은 아직 없을 수 있다. 따라서 하나의 `status`로 두 상태를 함께 표현하지 않는다.

문서 작성 상태는 다음과 같다.

| 코드 | UI 표현 | 의미 |
|---|---|---|
| `notStarted` | 근거 미작성 | 의미나 산출근거가 아직 실질적으로 작성되지 않았다. |
| `draft` | 근거 작성 중 | 일부 의미, 출처 또는 산출 방법이 작성됐지만 검토가 끝나지 않았다. |
| `complete` | 근거 작성 완료 | 정해진 문서 항목이 작성되고 검토됐다. |

추정값 상태는 다음과 같다.

| 코드 | UI 표현 | 의미 | 적용 가능 여부 |
|---|---|---|---|
| `none` | 값 미산출 | 적용할 관측·추정값이 없다. | 불가 |
| `provisional` | 임시 추정값 | 추가 검토가 필요하지만 실험에 사용할 수 있는 값이 있다. | 가능 |
| `recommended` | 권장 추정값 | 현재 프로필에서 권장하는 검토된 값이 있다. | 가능 |

문서나 데이터에 `???` 문자열을 직접 저장하지 않는다. 값이 아직 없으면 `estimateStatus: "none"`과 `estimate` 부재로 표현한다. 적용 가능 여부는 문서 상태가 아니라 추정값 상태와 실제 `estimate` 존재 여부로 결정한다.

## 3. 사용자 목표

사용자는 이 기능을 통해 다음 질문에 답할 수 있어야 한다.

1. 이 파라미터는 현실의 어떤 사건이나 비율을 뜻하는가?
2. 이 값은 시뮬레이션 결과에 어떻게 영향을 미치는가?
3. 현재 조직 환경에서 관측하거나 추정한 값은 무엇인가?
4. 어떤 데이터와 방법으로 그 값을 산출했는가?
5. 이 추정을 신뢰할 때 주의할 한계는 무엇인가?
6. 해당 값을 현재 실험에 어떻게 적용할 수 있는가?

## 4. 사용자 흐름

```text
시뮬레이터
  → 환경값 근거 열기
  → 파라미터 목록에서 상태와 관측·추정값 확인
  → 관심 있는 파라미터의 상세 산출근거 확인
  → 개별 값 또는 적용 가능한 값 전체 선택
  → 현재값과 적용값 비교
  → 실험 조건에 적용
  → 필요하면 일부 값을 직접 수정
  → 시뮬레이션 실행
```

설명을 읽는 기능과 값을 적용하는 기능은 같은 화면에서 제공하되, 사용자의 입력값을 확인 없이 덮어쓰지 않는다.

## 5. 정보 구조와 화면 배치

### 5.1 작업 화면 전환

현재 실험 조건 패널은 폭이 좁고 산출근거는 긴 문장, 표와 데이터를 포함할 수 있다. 따라서 툴팁이나 작은 모달 안에 상세 내용을 넣지 않는다.

상단에서 다음 두 작업 화면을 전환하는 구조를 사용한다.

```text
[시뮬레이션]  [환경값 근거]
```

첫 버전에서는 별도 라우팅 라이브러리를 도입하지 않고 App 내부 화면 상태로 전환할 수 있다. 화면을 전환해도 현재 시나리오와 정책 입력은 유지한다.

### 5.2 환경값 근거 화면 상단

상단에는 현재 근거 프로필과 작성 진행 상황을 표시한다.

```text
환경값 근거

Bors 운영 환경에서 관측하거나 추정한 값을 설명합니다.
이 값은 절대적인 정답이 아니며 관측 기간과 산출 방식에 따라 달라질 수 있습니다.

프로필: Bors 운영환경 2026 Q2
버전: 1
근거 작성 중: 9 / 9
적용 가능: 0 / 9

[적용 가능한 관측·추정값 없음]
```

처음에는 프로필을 하나만 제공하더라도 데이터 구조는 여러 프로필을 수용할 수 있어야 한다. 첫 버전에서는 프로필 선택 UI를 제공하지 않는다.

## 6. 파라미터 목록

첫 버전의 파라미터는 다음 아홉 개로 확정한다. ID는 이후 프로필, 시나리오 출처 메타데이터와 테스트에서 사용하는 안정적인 식별자다.

현재 시뮬레이터 기본값은 데모·비교용 가정이며 관측·추정값이 아니다. 따라서 기본값이 존재하더라도 아래 모든 파라미터의 초기 추정값 상태는 `none`이다.

| 영역 | ID | UI 명칭 | 문서 상태 | 추정값 상태 | 초기 기능 |
|---|---|---|---|---|---|
| PR | `dailyPrCount` | 근무일당 평균 PR 생성 수 | `draft` | `none` | 상세만 제공 |
| PR | `individualDefectProbability` | 개별 결함률 | `draft` | `none` | 상세만 제공 |
| CI | `ciFailureDuration` | CI 실패 시간 중앙 확률 구간 | `draft` | `none` | 상세만 제공 |
| CI | `ciSuccessDuration` | CI 성공 시간 중앙 확률 구간 | `draft` | `none` | 상세만 제공 |
| CI | `ciFalseNegativeRate` | CI 거짓 음성률 | `draft` | `none` | 상세만 제공 |
| CI | `ciFalsePositiveRate` | CI 거짓 양성률 | `draft` | `none` | 상세만 제공 |
| LLM | `llmCulpritHitRate` | LLM 적중률 | `draft` | `none` | 상세만 제공 |
| LLM | `llmInnocentFalseAccusationRate` | LLM 오지목률 | `draft` | `none` | 상세만 제공 |
| LLM | `llmDuration` | LLM 판단 시간 중앙 확률 구간 | `draft` | `none` | 상세만 제공 |

모든 항목이 `draft`인 이유는 사용자가 제공한 초안에 현실 의미, 시뮬레이션 의미 또는 산출근거 중 적어도 하나가 실질적으로 작성돼 있기 때문이다. 어느 항목도 아직 관측·추정 숫자가 확정되지 않았으므로 처음에는 개별 적용 버튼과 전체 적용 버튼을 활성화하지 않는다.

목록은 PR, CI, LLM 영역으로 그룹화한다. 각 행을 선택하면 넓은 상세 영역에 해당 파라미터의 전체 내용을 표시한다.

### 6.1 파라미터별 의미와 초기 근거

| ID | 현실에서의 의미 | 시뮬레이션에서의 의미 | 현재 확보한 산출근거 초안 |
|---|---|---|---|
| `dailyPrCount` | 하루 동안 최초 r+ 승인을 받아 Bors 머지 큐에 들어온 PR 수의 평균 | 매일 생성할 PR 수의 포아송 평균이며 KST 시간대별 가중치로 도착 시각을 생성 | Bors DB의 최초 r+ 기록을 날짜별로 집계한다. 시간대 분포는 KST 활성화 3,334건을 사용한다. |
| `individualDefectProbability` | 현재 main HEAD와 함께 CI 검증했을 때 독립적으로 실패 원인을 만드는 PR의 발생 비율 | 새 PR마다 다른 PR과 무관한 개별 결함을 부여할 확률 | Bors DB에서 PR의 최초 검증 실패 여부를 집계하는 방안을 검토한다. 재시도·인프라 실패 제외 기준은 미정이다. |
| `ciFailureDuration` | Bors-flow가 실패 결과로 종료된 CI 실행의 소요시간 분포 | CI가 실패로 관측된 실행의 시간을 로그정규분포로 추첨하는 중앙 확률 구간 | Orchestrator의 bors-flow 실패 결과를 집계한다. 시작·종료 시각과 제외할 취소·무효 실행 기준은 미정이다. |
| `ciSuccessDuration` | Bors-flow가 성공 결과로 종료된 CI 실행의 소요시간 분포 | CI가 성공으로 관측된 실행의 시간을 로그정규분포로 추첨하는 중앙 확률 구간 | Orchestrator의 bors-flow 성공 결과를 집계한다. 성공 실행의 안정적인 전체 파이프라인 시간을 사용한다. |
| `ciFalseNegativeRate` | 실제로 결함이 있는 후보 master를 CI가 성공으로 판정해 머지한 비율 | 비정상 후보 master를 성공으로 잘못 관측할 확률 | CI 성공 후 발견된 daily test 실패 등을 대리 지표로 검토한다. CI 당시 결함과 사후 실패의 인과관계 판정 기준은 미정이다. |
| `ciFalsePositiveRate` | 실제로 정상인 후보 master를 flaky test, pod eviction 등으로 실패 판정한 비율 | 정상 후보 master를 실패로 잘못 관측할 확률 | 재실행 성공 여부와 인프라 실패 분류를 이용하는 방안을 검토한다. 구체적인 데이터 출처와 분모는 미정이다. |
| `llmCulpritHitRate` | 실패 배치의 실제 결함 PR 각각을 LLM 탐정이 지목하는 비율 | 실제 실패 원인에 포함된 각 PR을 독립적으로 지목할 확률 | 정답이 표시된 평가 데이터에 대한 LLM 탐정 테스트 결과를 집계한다. 테스트셋과 판정 기준은 미정이다. |
| `llmInnocentFalseAccusationRate` | 실패 배치에 포함됐지만 결함 원인이 아닌 PR을 LLM 탐정이 잘못 지목하는 비율 | 실제 실패 원인이 아닌 각 PR을 독립적으로 지목할 확률 | 정답이 표시된 평가 데이터에 대한 LLM 탐정 테스트 결과를 집계한다. 정상 PR의 분모 정의는 미정이다. |
| `llmDuration` | LLM 탐정이 입력을 받은 뒤 판단 결과를 반환할 때까지의 소요시간 분포 | LLM 호출 시간을 로그정규분포로 추첨하는 중앙 확률 구간 | LLM 탐정 테스트 실행의 시작·완료 시각을 집계한다. 동시성, 타임아웃과 실패 호출 포함 기준은 미정이다. |

CI와 LLM 시간 구간의 포함 확률은 현재 코드 기본값인 95%를 사용하되 프로필 값과 실험 스냅샷에는 `coverage`를 함께 보존한다. 향후 프로젝트 기본값을 90%나 99%로 바꿔도 파라미터 ID는 변경하지 않는다.

## 7. 상세 화면

각 파라미터 상세 화면은 다음 순서를 유지한다.

1. 현실에서의 의미
2. 시뮬레이션에서의 의미
3. 관측·추정값
4. 산출 방법
5. 데이터 기준
6. 상세 산출근거 및 분석
7. 한계와 주의사항

### 7.1 예시: 근무일당 평균 PR 생성 수

#### 현실에서의 의미

하루 동안 최초 r+ 승인을 받아 Bors 머지 큐에 들어온 PR 수의 평균이다.

#### 시뮬레이션에서의 의미

매일 생성할 PR 수의 포아송 평균이다. 실제 생성 수는 날마다 달라지고 KST 시간대별 가중치에 따라 도착 시각이 정해진다.

#### 관측·추정값

아직 산출하지 않았다.

#### 산출 방법

- Bors DB의 대상 테이블에서 r+ 등록 시각 조회
- 날짜별 최초 r+ PR 수 집계
- 비정상 데이터와 대상 기간 필터링
- 관측 평일 수로 나누어 근무일당 평균 계산

#### 데이터 기준

- 데이터 출처: 미정
- 관측 기간: 미정
- 표본 수: 미정
- 마지막 갱신일: 미정

#### 상세 산출근거 및 분석

긴 설명, 계산식, 요약 표와 집계 데이터를 포함할 수 있다.

#### 한계와 주의사항

모든 날을 같은 평일로 취급하므로 주말과 휴일의 차이는 표현하지 않는다.

미산출 상태이거나 적용값이 없으면 적용 버튼을 비활성화한다.

## 8. 초기 파라미터 범위 확정

첫 버전에서는 다음 아홉 개의 환경 개념만 다룬다. 이 목록은 2단계에서 확정됐으며 3단계 와이어프레임과 이후 개발 계획의 기준으로 사용한다.

### 8.1 PR과 결함

1. 근무일당 평균 PR 생성 수
2. 개별 결함률

### 8.2 CI

3. CI 실패 시간 중앙 확률 구간
4. CI 성공 시간 중앙 확률 구간
5. CI 거짓 음성률
6. CI 거짓 양성률

### 8.3 LLM 탐정

7. LLM 적중률
8. LLM 오지목률
9. LLM 판단 시간 중앙 확률 구간

### 8.4 후속 확장 후보

- 상호작용 결함 발생 빈도
- 상호작용 결함 최대 크기와 크기 분포
- CI 1회 비용
- LLM 1회 비용

### 8.5 적용 대상에서 제외하는 입력

다음 값은 현실 환경값이 아니라 실험 설계 또는 비교 대상이므로 관측·추정값 적용 대상에 포함하지 않는다.

- 실험 이름
- 전체 PR 수
- 목표 머지 수
- 정책당 반복 횟수
- 난수 시드
- 모든 정책별 배치 크기, 대기시간, 분할 방식과 기타 정책 설정

## 9. CI 오판 용어

CI 거짓 음성과 거짓 양성은 혼동하기 쉬우므로 상세 화면에 다음 판정표를 제공한다.

| 후보 master 실제 상태 | CI 관측 결과 | 분류 |
|---|---|---|
| 정상 | 성공 | 정상 판정 |
| 정상 | 실패 | 거짓 양성 |
| 비정상 | 성공 | 거짓 음성 |
| 비정상 | 실패 | 정상 판정 |

현재 시뮬레이터도 위 정의를 따른다.

## 10. 값 적용 상호작용

### 10.1 개별 적용

적용값이 있는 파라미터의 상세 화면에서 현재값과 관측·추정값을 비교한다.

```text
현재값: 20~50분
관측·추정값: 10~40분

[이 값 적용]
```

개별 적용은 해당 환경 파라미터만 변경하며 실험 조건과 정책 설정에는 영향을 주지 않는다.

### 10.2 전체 적용

`적용 가능한 값 모두 적용` 버튼은 바로 값을 덮어쓰지 않고 변경 미리보기를 연다.

| 파라미터 | 현재값 | 적용값 |
|---|---:|---:|
| CI 실패 시간 | 20~50분 | 10~40분 |
| CI 성공 시간 | 40~80분 | 50~70분 |
| LLM 적중률 | 50% | 70% |

미리보기 하단에는 적용 수와 제외 범위를 명시한다.

```text
산출 완료 또는 임시 추정값이 존재하는 5개 항목을 적용합니다.
미산출 항목과 실험·정책 설정은 변경하지 않습니다.

[취소] [5개 값 적용]
```

적용이 완료되면 시뮬레이션 화면으로 돌아가고 다음과 같은 결과 메시지를 표시한다.

```text
‘Bors 운영환경 2026 Q2’의 관측·추정값 5개를 적용했습니다.
```

현재값과 동일한 항목도 적용 대상으로 표시하고, 숫자 변경 없이 출처만 연결됨을 구분한다.

## 11. 기본값과 관측·추정값의 관계

현재 기능과 새 기능은 서로 다른 목적을 가진다.

| 기능 | 의미 |
|---|---|
| 기본값으로 초기화 | 프로젝트가 제공하는 안정적인 데모·비교 설정으로 되돌린다. |
| 관측·추정값 적용 | 특정 근거 프로필에서 산출한 현실 기반 환경값을 적용한다. |

두 기능을 하나의 버튼이나 같은 개념으로 합치지 않는다.

실험 조건 패널에는 다음 두 진입점을 제공할 수 있다.

```text
[기본값으로 초기화]
[환경값 근거 및 관측값 적용]
```

현재 안내 문구인 `값은 현실 추정치가 아닌 비교용 가정입니다.`는 기능 도입 후 다음과 같이 변경한다.

```text
직접 가정하거나 관측·추정값을 적용해 비교할 수 있습니다.
```

## 12. 데이터와 콘텐츠 모델 확정

화면 설명과 숫자를 `ScenarioEditor.tsx`에 직접 넣지 않는다. 시뮬레이터 연결 정의, 근거 프로필, 긴 산출근거 콘텐츠를 분리한다.

### 12.1 파라미터 ID와 값 타입

초기 아홉 개 파라미터의 ID와 값 타입을 다음처럼 고정한다.

```ts
export type EnvironmentParameterId =
  | "dailyPrCount"
  | "individualDefectProbability"
  | "ciFailureDuration"
  | "ciSuccessDuration"
  | "ciFalseNegativeRate"
  | "ciFalsePositiveRate"
  | "llmCulpritHitRate"
  | "llmInnocentFalseAccusationRate"
  | "llmDuration";

export interface EnvironmentParameterValueMap {
  dailyPrCount: number;
  individualDefectProbability: number;
  ciFailureDuration: DurationInterval;
  ciSuccessDuration: DurationInterval;
  ciFalseNegativeRate: number;
  ciFalsePositiveRate: number;
  llmCulpritHitRate: number;
  llmInnocentFalseAccusationRate: number;
  llmDuration: DurationInterval;
}
```

시간의 `number` 단위는 분이며 확률 `number`는 0 이상 1 이하의 비율이다. UI에서 백분율로 표시하더라도 프로필과 시나리오에는 비율로 저장한다. `DurationInterval`에는 `lower`, `upper`, `coverage`를 모두 포함한다.

### 12.2 파라미터 중앙 정의

현실 의미와 시뮬레이션 의미는 프로필에 따라 달라지지 않으므로 파라미터 정의에 둔다. 프로필에는 관측·추정값과 그 산출근거만 둔다.

```ts
interface EnvironmentParameterDefinition<K extends EnvironmentParameterId> {
  id: K;
  group: "pr" | "ci" | "llm";
  label: string;
  unit: string;
  actualMeaning: string;
  simulationMeaning: string;
  read(scenario: ScenarioConfig): EnvironmentParameterValueMap[K];
  apply(
    scenario: ScenarioConfig,
    value: EnvironmentParameterValueMap[K],
  ): ScenarioConfig;
  format(value: EnvironmentParameterValueMap[K]): string;
  equals(
    left: EnvironmentParameterValueMap[K],
    right: EnvironmentParameterValueMap[K],
  ): boolean;
}
```

`read`, `apply`, `format`, `equals` 매핑은 하나의 중앙 레지스트리에서 관리한다. 화면 컴포넌트, 일괄 적용 코드와 출처 변경 판별 코드가 시나리오 경로를 각각 중복해서 알지 않게 한다.

파라미터별 적용 범위는 다음과 같다.

| ID | ScenarioConfig 경로 | 적용 단위 |
|---|---|---|
| `dailyPrCount` | `arrival.meanPerDay` | 일간 평균만 변경하고 KST 시간대 가중치와 timezone은 유지한다. |
| `individualDefectProbability` | `individualDefectProbability` | 확률 하나를 변경한다. |
| `ciFailureDuration` | `ci.failureDuration` | `lower`, `upper`, `coverage` 전체를 변경한다. |
| `ciSuccessDuration` | `ci.successDuration` | `lower`, `upper`, `coverage` 전체를 변경한다. |
| `ciFalseNegativeRate` | `ci.falseNegativeRate` | 확률 하나를 변경한다. |
| `ciFalsePositiveRate` | `ci.falsePositiveRate` | 확률 하나를 변경한다. |
| `llmCulpritHitRate` | `llm.culpritHitRate` | 확률 하나를 변경한다. |
| `llmInnocentFalseAccusationRate` | `llm.innocentFalseAccusationRate` | 확률 하나를 변경한다. |
| `llmDuration` | `llm.duration` | `lower`, `upper`, `coverage` 전체를 변경한다. |

`dailyPrCount` 적용은 일간 평균만 변경하며 24개 시간대 가중치와 KST timezone은 유지한다.

### 12.3 추정값 상태와 근거 타입

추정값이 없는 상태에 실수로 `estimate`를 넣거나, 적용 가능한 상태에서 값을 빠뜨리지 못하도록 판별 유니언을 사용한다.

```ts
type EstimateState<TValue> =
  | {
      estimateStatus: "none";
      estimate?: never;
    }
  | {
      estimateStatus: "provisional" | "recommended";
      estimate: TValue;
    };

interface EvidenceSource {
  label: string;
  system?: string;
  location?: string;
  url?: string;
}

type ParameterEvidence<TValue> = {
  documentationStatus: "notStarted" | "draft" | "complete";
  methodologySummary: string;
  evidenceDocumentId: string;
  sources: EvidenceSource[];
  observationPeriod?: {
    from: string;
    to: string;
  };
  sampleSize?: number;
  updatedAt?: string;
} & EstimateState<TValue>;

type ParameterEvidenceMap = {
  [K in EnvironmentParameterId]: ParameterEvidence<
    EnvironmentParameterValueMap[K]
  >;
};
```

날짜 문자열은 `YYYY-MM-DD` 형식을 사용한다. `evidenceDocumentId`는 아래 Markdown 레지스트리의 안정적인 키이며 임의 파일 경로를 UI에 직접 전달하지 않는다.

### 12.4 근거 프로필

```ts
interface CalibrationProfile {
  id: string;
  version: number;
  name: string;
  description: string;
  defaultObservationPeriod?: {
    from: string;
    to: string;
  };
  parameters: ParameterEvidenceMap;
}
```

아홉 개 항목을 선택적 필드로 만들지 않는다. 미작성 항목도 `documentationStatus: "notStarted"`, `estimateStatus: "none"`으로 명시하여 카탈로그 누락을 컴파일 단계에서 발견한다.

프로필 ID와 버전 조합은 불변으로 취급한다. 같은 ID와 버전의 추정값이나 근거를 의미가 달라질 정도로 수정하지 않는다. 값 또는 산출 방법의 의미가 달라지면 버전을 올린다.

### 12.5 콘텐츠 파일 구성

긴 산출근거는 Markdown 콘텐츠로 분리한다.

```text
src/calibration/
  parameterDefinitions.ts
  profiles/
    bors-production-2026-q2.ts
  evidence/
    arrival-interval.md
    individual-defect-rate.md
    ci-failure-duration.md
    ci-success-duration.md
    ci-false-negative-rate.md
    ci-false-positive-rate.md
    llm-hit-rate.md
    llm-false-accusation-rate.md
    llm-duration.md
```

이 구조를 사용하면 산출근거를 하나씩 작성할 때 UI 코드를 수정하지 않고 프로필 데이터와 문서만 갱신할 수 있다.

Markdown 렌더링 방식과 라이브러리 선택은 구현 계획에서 결정한다. 사용자 또는 외부 입력 Markdown을 실행 가능한 HTML로 그대로 렌더링하지 않는다.

## 13. 시나리오 스냅샷과 출처 보존 확정

### 13.1 파라미터별 출처 구조

프로필 전체에 출처 하나만 저장하지 않고 적용한 파라미터마다 출처와 적용 당시 값을 저장한다. 이 구조는 개별 적용, 수동 수정 판별과 미래의 복수 프로필을 모두 지원한다.

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

`ScenarioConfig`에는 다음 필드를 추가한다.

```ts
interface ScenarioConfig {
  schemaVersion: 1;
  // 기존 필드 생략
  calibration?: ScenarioCalibration;
}
```

`appliedValue`를 별도로 보존하는 이유는 다음과 같다.

- 현재 시나리오 숫자는 사용자가 적용 후 수정할 수 있다.
- 오래된 프로필이 현재 번들에서 제거돼도 적용 당시 값을 설명할 수 있어야 한다.
- 같은 값이 우연히 현재 프로필에 존재하는 것과 사용자가 그 프로필을 실제로 적용한 것을 구분해야 한다.

### 13.2 적용 후 상태 판별

각 파라미터 정의의 `read`와 `equals`를 사용해 현재값과 `appliedValue`를 비교한다.

| 조건 | UI 상태 |
|---|---|
| 출처 기록 없음 | 직접 입력 또는 출처 없음 |
| 현재값과 `appliedValue`가 같음 | 프로필 값 적용됨 |
| 현재값과 `appliedValue`가 다름 | 프로필 적용 후 수정됨 |

수동 수정 시 출처 기록을 삭제하거나 덮어쓰지 않는다. 해당 파라미터를 같은 프로필에서 다시 적용하면 `appliedValue`를 새 값으로 갱신한다. 다른 프로필에서 적용하면 해당 파라미터의 출처만 새 프로필로 교체한다.

`기본값으로 초기화`는 전체 `calibration`을 제거한다. 일반적인 수동 입력은 출처를 보존한다.

### 13.3 값이 같은 경우의 적용

현재값과 추정값이 같아도 사용자가 명시적으로 프로필을 적용하면 출처를 기록한다. 적용 미리보기에서는 이를 다음처럼 구분한다.

```text
변경 3개 · 값 유지 및 출처 연결 2개
```

따라서 전체 적용 대상 수는 값이 달라지는 항목 수가 아니라 적용 가능한 추정값 수다. 값이 같은 항목도 적용 대상과 출처 기록에 포함한다.

### 13.4 실험과 Replay

실험 스냅샷에는 현재처럼 실제 시나리오 숫자를 모두 저장하며 `calibration`도 함께 저장한다. 엔진은 `calibration`을 읽지 않으며 다음 항목은 변하지 않는다.

- 숨겨진 세계 생성
- 난수 시드 파생
- 난수 소비 순서
- 정책 입력
- 이벤트와 지표 계산

Replay는 실험 당시 저장된 숫자를 사용하므로 현재 프로필의 변경이나 제거에 영향을 받지 않는다. 출처 메타데이터 유무만 다른 동일한 시나리오는 엔진 이벤트와 지표가 같아야 한다.

### 13.5 최초 공개 schema v1

개발 중 사용한 과거 시나리오 형식은 배포 전 폐기한다. JSON은 schema v1만 가져오고 내보내며, IndexedDB 내부 버전을 올려 기존 시나리오와 실험을 초기화한다. 이후 배포된 v1에서 호환이 필요한 변경이 생길 때부터 마이그레이션을 추가한다.

Worker의 `PROTOCOL_VERSION`은 시나리오 저장 스키마와 별개의 앱 내부 메시지 계약이다. `calibration`은 엔진이 무시하는 메타데이터이므로 worker protocol v1을 유지한다.

### 13.6 유효성 검사

- 파라미터 ID는 확정된 아홉 개만 허용한다.
- `profileId`는 비어 있지 않은 제한 길이 문자열이어야 한다.
- `profileVersion`은 1 이상의 정수여야 한다.
- `appliedValue`는 파라미터 ID에 대응하는 값 타입과 범위를 만족해야 한다.
- 확률은 0 이상 1 이하로 제한한다.
- 시간 구간은 기존 `DurationInterval` 검증을 재사용한다.
- 빈 `parameters` 객체는 저장할 필요가 없으며 이 경우 `calibration` 자체를 생략한다.

## 14. 콘텐츠 작성 원칙

각 파라미터 문서는 다음 순서를 유지한다.

1. 현실에서 무엇인가
2. 시뮬레이션에서는 어떻게 작동하는가
3. 어떤 값을 권장하는가
4. 어떤 데이터에서 계산했는가
5. 계산식과 제외 기준은 무엇인가
6. 이 추정의 한계는 무엇인가

짧은 의미 설명과 긴 산출근거를 분리한다. 목록과 요약 영역에는 짧은 설명만 사용하고, 상세 분석은 Markdown 문서에서 제공한다.

출처에는 가능한 경우 다음 정보를 포함한다.

- 시스템 또는 데이터셋 이름
- 테이블, 필드 또는 집계 결과 식별자
- 관측 기간
- 필터와 제외 조건
- 표본 수
- 계산식
- 관련 문서 링크

원시 PR 데이터나 민감정보를 정적 웹 번들에 포함하지 않는다. 필요한 경우 집계된 표와 통계만 포함한다.

## 15. 브라우저 전용 구조와 데이터 경계

현재 프로젝트는 브라우저 전용이며 서버와 중앙 데이터베이스를 추가하지 않는다. 첫 버전에서는 다음 방식만 사용한다.

- 사람이 산출한 집계값과 설명을 코드에 포함
- 검토된 집계 결과를 정적 데이터로 포함
- 원본 데이터 대신 요약 통계와 출처 정보 저장

Bors DB나 orchestrator를 브라우저에서 직접 조회하지 않는다. 향후 집계 결과를 파일로 불러오는 기능을 검토할 수 있지만 이번 범위에는 포함하지 않는다.

## 16. 접근성과 반응형 원칙

- 작업 화면 전환은 키보드로 접근 가능해야 하며 현재 선택 상태를 보조기술에 전달한다.
- 파라미터 목록 행을 버튼처럼 사용할 경우 명시적인 포커스 상태와 선택 상태를 제공한다.
- 상태는 색상만으로 구분하지 않고 텍스트를 함께 표시한다.
- 적용 미리보기는 `dialog` 의미와 포커스 관리를 제공한다.
- 작은 화면에서는 목록과 상세를 좌우로 압축하지 않고 목록 → 상세 순서로 전환한다.
- 표가 화면 폭을 넘는 경우 핵심 정보가 사라지지 않도록 카드 또는 세로 배치로 전환한다.

## 17. 첫 버전에서 제외하는 기능

- Bors DB 직접 연결
- orchestrator API 직접 호출
- 원시 데이터 업로드와 브라우저 내 집계
- 사용자가 근거 프로필을 생성하거나 편집하는 기능
- 여러 프로필을 선택·비교하는 UI
- 산출근거 문서를 UI에서 직접 편집하는 기능
- 관측값을 이용한 최적 정책 자동 추천
- 정책 설정에 현실값을 자동 적용하는 기능

초기에는 코드와 Markdown으로 관리되는 하나의 프로필만 제공하되, 자료 구조만 여러 프로필을 수용할 수 있게 설계한다.

## 18. 성공 기준

첫 버전은 다음 조건을 만족해야 한다.

1. 사용자가 아홉 개 초기 환경 파라미터의 현실 의미와 시뮬레이션 의미를 확인할 수 있다.
2. 긴 산출근거와 표를 기존 실험 조건 패널의 폭에 제한받지 않고 읽을 수 있다.
3. 미산출 항목은 명확히 구분되고 적용되지 않는다.
4. 적용 가능한 값을 개별 적용할 수 있다.
5. 전체 적용 전에 현재값과 변경값을 확인할 수 있다.
6. 전체 적용은 실험·정책 설정을 변경하지 않는다.
7. 적용한 파라미터별 프로필 ID, 버전과 적용 당시 값이 실험 스냅샷에 보존된다.
8. 프로필 적용 후 수동으로 변경된 값은 UI에서 구분할 수 있다.
9. 기존 기본값 초기화 기능과 관측·추정값 적용 기능의 차이가 명확하다.
10. 미작성 문서를 하나씩 채울 때 핵심 UI 컴포넌트를 수정할 필요가 없다.

## 19. 단계 진행 상태

| 단계 | 내용 | 상태 |
|---|---|---|
| 1 | 환경값 근거 UI 설계 문서 저장 | 완료 |
| 2 | 파라미터 목록과 초기 상태 확정 | 완료 |
| 3 | 화면 와이어프레임 확정 | 사용자 승인으로 완료 |
| 4 | 데이터 타입과 시나리오 스냅샷 변경 설계 | 완료 |
| 5 | 구체적인 개발 작업 계획 작성 | 완료 |
| 6 | 구현 | 완료 |

5단계 개발 계획은 `outputs/ENVIRONMENT_EVIDENCE_UI_IMPLEMENTATION_PLAN.md`에 저장했으며, 6단계 구현과 필수 검증을 완료했다.