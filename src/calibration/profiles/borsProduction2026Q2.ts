import type { CalibrationProfile, ParameterEvidence } from "../model";
import { REALITY_DEFAULT_PROFILE_ID, REALITY_DEFAULT_PROFILE_VERSION, REALITY_DEFAULTS } from "../../sim/realityDefaults";
import arrivalDetail from "../evidence/daily-pr-count.md?raw";
import defectDetail from "../evidence/individual-defect-rate.md?raw";
import interactionDetail from "../evidence/interaction-defect-rate.md?raw";
import ciFailureDetail from "../evidence/ci-failure-duration.md?raw";
import ciSuccessDetail from "../evidence/ci-success-duration.md?raw";
import ciFalseNegativeDetail from "../evidence/ci-false-negative-rate.md?raw";
import ciFalsePositiveDetail from "../evidence/ci-false-positive-rate.md?raw";
import llmHitDetail from "../evidence/llm-hit-rate.md?raw";
import llmFalseAccusationDetail from "../evidence/llm-false-accusation-rate.md?raw";
import llmDurationDetail from "../evidence/llm-duration.md?raw";

function draft<T>(input: Omit<ParameterEvidence<T>, "documentationStatus" | "estimate" | "dataBasis">): ParameterEvidence<T> {
  return { ...input, documentationStatus: "draft", estimate: { status: "none" }, dataBasis: {} };
}

function recommended<T>(value: T, input: Omit<ParameterEvidence<T>, "documentationStatus" | "estimate" | "dataBasis">): ParameterEvidence<T> {
  const empirical = typeof value === "object" && value !== null && "kind" in value && value.kind === "empirical"
    ? value as unknown as { observations: Array<[number, number]> }
    : undefined;
  return {
    ...input,
    documentationStatus: "complete",
    estimate: { status: "recommended", value },
    dataBasis: empirical ? { source: "bors-pr.csv (식별정보 제외)", observationPeriod: "2025-09-01–2026-08-31 KST", sampleSize: empirical.observations.reduce((sum, [, count]) => sum + count, 0), updatedAt: "2026-09-02" } : {},
  };
}

export const BORS_PRODUCTION_2026_Q2: CalibrationProfile = {
  id: REALITY_DEFAULT_PROFILE_ID,
  name: "Bors 운영환경 관측 기준값",
  version: REALITY_DEFAULT_PROFILE_VERSION,
  description: "Bors 운영 환경에서 관측하거나 추정한 기본값과 산출근거입니다.",
  parameters: {
    dailyPrCount: recommended(REALITY_DEFAULTS.dailyPrCount, {
      realityMeaning: "하루 동안 최초 r+ 승인을 받아 Bors 머지 큐에 들어온 PR 수의 평균입니다.",
      simulationMeaning: "매일 생성할 PR 수의 포아송 평균입니다. 실제 일별 생성 수는 달라지며 KST 시간대별 가중치로 도착 시각을 정합니다.",
      method: ["최초 r+ 활성화 기록을 날짜별로 집계", "관측한 평일 수로 나누어 일간 평균 계산", "시간대별 3,334건을 정규화해 도착 가중치 계산"],
      limitations: ["현재 시간대 분포에는 주말과 휴일 차이를 반영하지 않습니다."], detailMarkdown: arrivalDetail,
    }),
    individualDefectProbability: recommended(REALITY_DEFAULTS.individualDefectProbability, {
      realityMeaning: "현재 main HEAD와 함께 CI 검증했을 때 독립적인 실패 원인을 만드는 PR의 발생 비율입니다.",
      simulationMeaning: "새 PR마다 다른 PR과 무관한 개별 결함을 부여할 확률입니다.",
      method: ["최초 검증 실패 사례 조회", "인프라·flaky 실패 제외", "개별 결함 PR 비율 계산"],
      limitations: ["상호작용 결함과 개별 결함을 구분하는 판정 기준이 필요합니다."], detailMarkdown: defectDetail,
    }),
    interactionSetsPerHundredPrs: recommended(REALITY_DEFAULTS.interactionSetsPerHundredPrs, {
      realityMeaning: "여러 PR이 함께 있을 때만 후보 master를 실패시키는 상호작용 결함 집합의 발생 빈도입니다.",
      simulationMeaning: "PR 100개당 생성할 상호작용 결함 집합 수의 포아송 평균입니다.",
      method: ["개별 결함으로 설명되지 않는 조합 실패 집계", "전체 PR 수를 기준으로 100개당 빈도 환산"],
      limitations: ["현재 관측 기준값 0은 상호작용 결함이 존재하지 않는다는 보장이 아니라 관측 표본에서 식별하지 못했다는 뜻일 수 있습니다."], detailMarkdown: interactionDetail,
    }),
    ciFailureDuration: recommended(REALITY_DEFAULTS.ciFailureDuration, {
      realityMeaning: "Bors-flow가 실패 결과로 종료된 CI 실행의 소요시간 분포입니다.",
      simulationMeaning: "CI가 최종 실패로 관측된 실행 시간을 270건의 실제 소요시간 빈도에 비례해 직접 추첨합니다.",
      method: ["결함 판정 PR 중 확정 CI 시간이 있는 행 추출", "동일 소요시간별 빈도 집계", "관측 빈도에 비례해 경험적 표본 추출"],
      limitations: ["결함 판정 354건 중 CI 상태 행이 없어 시간을 계산할 수 없는 84건은 제외했습니다."], detailMarkdown: ciFailureDetail,
    }),
    ciSuccessDuration: recommended(REALITY_DEFAULTS.ciSuccessDuration, {
      realityMeaning: "Bors-flow가 성공 결과로 종료된 CI 실행의 소요시간 분포입니다.",
      simulationMeaning: "CI가 최종 성공으로 관측된 실행 시간을 2,305건의 실제 소요시간 빈도에 비례해 직접 추첨합니다.",
      method: ["정상 판정 PR의 확정 CI 시간 추출", "동일 소요시간별 빈도 집계", "관측 빈도에 비례해 경험적 표본 추출"],
      limitations: ["파이프라인 구성 변경 전후를 같은 표본으로 합칠지 결정해야 합니다."], detailMarkdown: ciSuccessDetail,
    }),
    ciFalseNegativeRate: recommended(REALITY_DEFAULTS.ciFalseNegativeRate, {
      realityMeaning: "실제로 결함이 있는 후보 master를 CI가 성공으로 판정해 머지한 비율입니다.",
      simulationMeaning: "비정상 후보 master를 성공으로 잘못 관측할 확률입니다.",
      method: ["CI 성공 후 발견된 결함 사례 조회", "원인 머지 판정", "결함 후보 중 성공 판정 비율 계산"],
      limitations: ["사후 실패와 해당 머지 사이의 인과관계 판정이 어렵습니다."], detailMarkdown: ciFalseNegativeDetail,
    }),
    ciFalsePositiveRate: recommended(REALITY_DEFAULTS.ciFalsePositiveRate, {
      realityMeaning: "정상 후보 master를 flaky test나 인프라 문제로 실패 판정한 비율입니다.",
      simulationMeaning: "정상 후보 master를 실패로 잘못 관측할 확률입니다.",
      method: ["재실행 성공 사례와 인프라 실패 분류 조회", "동일 후보 확인", "정상 후보 중 실패 판정 비율 계산"],
      limitations: ["재실행 사이 코드 변경이 있으면 같은 후보로 볼 수 없습니다."], detailMarkdown: ciFalsePositiveDetail,
    }),
    llmCulpritHitRate: recommended(REALITY_DEFAULTS.llmCulpritHitRate, {
      realityMeaning: "실패 배치의 실제 결함 PR 각각을 LLM 탐정이 지목하는 비율입니다.",
      simulationMeaning: "실제 실패 원인에 포함된 각 PR을 독립적으로 지목할 확률입니다.",
      method: ["정답 라벨 평가 데이터 준비", "범인 PR별 지목 여부 집계"],
      limitations: ["평가 데이터가 실제 실패 유형을 대표해야 합니다."], detailMarkdown: llmHitDetail,
    }),
    llmInnocentFalseAccusationRate: recommended(REALITY_DEFAULTS.llmInnocentFalseAccusationRate, {
      realityMeaning: "실패 배치의 정상 PR을 LLM 탐정이 잘못 지목하는 비율입니다.",
      simulationMeaning: "실제 실패 원인이 아닌 각 PR을 독립적으로 지목할 확률입니다.",
      method: ["정답 라벨 평가 데이터 준비", "정상 PR별 오지목 여부 집계"],
      limitations: ["배치 크기에 따른 오지목률 차이를 확인해야 합니다."], detailMarkdown: llmFalseAccusationDetail,
    }),
    llmDuration: draft({
      realityMeaning: "LLM 탐정이 입력을 받은 뒤 판단 결과를 반환할 때까지의 소요시간 분포입니다.",
      simulationMeaning: "LLM 호출 시간을 로그정규분포에서 추첨하는 중앙 확률 구간입니다.",
      method: ["호출 시작·완료 시각 집계", "제외 기준 적용", "중앙 확률 구간 분위수 계산"],
      limitations: ["동시성, 타임아웃과 재시도 처리 방식이 분포에 영향을 줍니다."], detailMarkdown: llmDurationDetail,
    }),
  },
};
