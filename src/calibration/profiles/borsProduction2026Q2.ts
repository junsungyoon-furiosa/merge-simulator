import type { CalibrationProfile, ParameterEvidence } from "../model";
import arrivalDetail from "../evidence/daily-pr-count.md?raw";
import defectDetail from "../evidence/individual-defect-rate.md?raw";
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

export const BORS_PRODUCTION_2026_Q2: CalibrationProfile = {
  id: "bors-production-2026-q2",
  name: "Bors 운영환경 2026 Q2",
  version: 1,
  description: "Bors 운영 환경에서 관측하거나 추정할 값의 정의와 산출근거 초안입니다.",
  parameters: {
    dailyPrCount: draft({
      realityMeaning: "하루 동안 최초 r+ 승인을 받아 Bors 머지 큐에 들어온 PR 수의 평균입니다.",
      simulationMeaning: "매일 생성할 PR 수의 포아송 평균입니다. 실제 일별 생성 수는 달라지며 KST 시간대별 가중치로 도착 시각을 정합니다.",
      method: ["최초 r+ 활성화 기록을 날짜별로 집계", "관측한 평일 수로 나누어 일간 평균 계산", "시간대별 3,334건을 정규화해 도착 가중치 계산"],
      limitations: ["현재 시간대 분포에는 주말과 휴일 차이를 반영하지 않습니다."], detailMarkdown: arrivalDetail,
    }),
    individualDefectProbability: draft({
      realityMeaning: "현재 main HEAD와 함께 CI 검증했을 때 독립적인 실패 원인을 만드는 PR의 발생 비율입니다.",
      simulationMeaning: "새 PR마다 다른 PR과 무관한 개별 결함을 부여할 확률입니다.",
      method: ["최초 검증 실패 사례 조회", "인프라·flaky 실패 제외", "개별 결함 PR 비율 계산"],
      limitations: ["상호작용 결함과 개별 결함을 구분하는 판정 기준이 필요합니다."], detailMarkdown: defectDetail,
    }),
    ciFailureDuration: draft({
      realityMeaning: "Bors-flow가 실패 결과로 종료된 CI 실행의 소요시간 분포입니다.",
      simulationMeaning: "CI가 실패로 관측된 실행 시간을 로그정규분포에서 추첨하는 중앙 확률 구간입니다.",
      method: ["실패 실행 시작·종료 시각 집계", "제외 기준 적용", "중앙 확률 구간 분위수 계산"],
      limitations: ["취소와 무효 실행의 포함 여부가 분포를 바꿉니다."], detailMarkdown: ciFailureDetail,
    }),
    ciSuccessDuration: draft({
      realityMeaning: "Bors-flow가 성공 결과로 종료된 CI 실행의 소요시간 분포입니다.",
      simulationMeaning: "CI가 성공으로 관측된 실행 시간을 로그정규분포에서 추첨하는 중앙 확률 구간입니다.",
      method: ["성공 실행 시작·종료 시각 집계", "중앙 확률 구간 분위수 계산"],
      limitations: ["파이프라인 구성 변경 전후를 같은 표본으로 합칠지 결정해야 합니다."], detailMarkdown: ciSuccessDetail,
    }),
    ciFalseNegativeRate: draft({
      realityMeaning: "실제로 결함이 있는 후보 master를 CI가 성공으로 판정해 머지한 비율입니다.",
      simulationMeaning: "비정상 후보 master를 성공으로 잘못 관측할 확률입니다.",
      method: ["CI 성공 후 발견된 결함 사례 조회", "원인 머지 판정", "결함 후보 중 성공 판정 비율 계산"],
      limitations: ["사후 실패와 해당 머지 사이의 인과관계 판정이 어렵습니다."], detailMarkdown: ciFalseNegativeDetail,
    }),
    ciFalsePositiveRate: draft({
      realityMeaning: "정상 후보 master를 flaky test나 인프라 문제로 실패 판정한 비율입니다.",
      simulationMeaning: "정상 후보 master를 실패로 잘못 관측할 확률입니다.",
      method: ["재실행 성공 사례와 인프라 실패 분류 조회", "동일 후보 확인", "정상 후보 중 실패 판정 비율 계산"],
      limitations: ["재실행 사이 코드 변경이 있으면 같은 후보로 볼 수 없습니다."], detailMarkdown: ciFalsePositiveDetail,
    }),
    llmCulpritHitRate: draft({
      realityMeaning: "실패 배치의 실제 결함 PR 각각을 LLM 탐정이 지목하는 비율입니다.",
      simulationMeaning: "실제 실패 원인에 포함된 각 PR을 독립적으로 지목할 확률입니다.",
      method: ["정답 라벨 평가 데이터 준비", "범인 PR별 지목 여부 집계"],
      limitations: ["평가 데이터가 실제 실패 유형을 대표해야 합니다."], detailMarkdown: llmHitDetail,
    }),
    llmInnocentFalseAccusationRate: draft({
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
