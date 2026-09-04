import type { CSSProperties } from "react";
import type { ExperimentResult, MetricSummary } from "../sim/model";
import { policyLabel } from "../sim/policyRegistry";
import { formatDuration } from "./formatDuration";
import "./policy-expansion.css";

const pct = (value: number | null | undefined) => value == null ? "—" : `${(value * 100).toFixed(2)}%`;
const num = (value: number | null | undefined, digits = 1) => value == null ? "—" : value.toFixed(digits);
const mean = (summary: Record<string, MetricSummary>, key: string) => summary[key]?.mean ?? null;
const policyColor = (index: number) => `hsl(${Math.round((index * 137.508 + 158) % 360)} 52% 43%)`;

const RESULT_METRIC_HELP = [
  ["PR 평균 판정 시간", "PR이 도착한 뒤 머지 또는 격리로 최종 판정될 때까지 걸린 평균 시간", "최종 판정된 PR의 (머지·격리 시각 - 도착 시각) 평균"],
  ["결함 PR 유입률", "전체 머지된 PR 중 개별 결함을 가진 PR의 비율", "머지된 개별 결함 PR 수 / 전체 머지된 PR 수"],
  ["처리량", "시뮬레이션 시간 1분당 머지된 PR 수", "전체 머지된 PR 수 / 시뮬레이션 종료 시각(분)"],
  ["CI 실행", "완료된 CI 배치 검사의 횟수", "완료된 ciCompleted 이벤트 수"],
  ["PR당 평균 CI 실행", "최종 판정된 PR 하나가 참여한 CI 검사의 평균 횟수", "최종 판정 PR별 ciStarted 참여 횟수의 평균"],
  ["배치당 PR 평균 개수", "CI에 제출된 전체 배치가 평균적으로 포함한 PR 개수", "모든 ciStarted 이벤트의 PR 개수 평균(무효화된 실행 포함)"],
  ["성공 배치의 PR 평균 개수", "CI가 성공으로 판정한 배치가 평균적으로 포함한 PR 개수", "observedSuccess가 true인 ciCompleted 이벤트의 PR 개수 평균"],
  ["실패 배치의 PR 평균 개수", "CI가 실패로 판정한 배치가 평균적으로 포함한 PR 개수", "observedSuccess가 false인 ciCompleted 이벤트의 PR 개수 평균"],
  ["단독 CI 실행 비율", "전체 CI 제출 중 PR 하나만 단독으로 검사한 실행의 비율", "PR 개수가 1인 ciStarted 이벤트 수 / 전체 ciStarted 이벤트 수"],
  ["CI 실행당 최종 머지 PR 수", "CI 실행 한 번이 최종적으로 만들어낸 머지 PR 수", "전체 머지 PR 수 / 전체 ciStarted 이벤트 수(무효화된 실행 포함)"],
  ["CI 사용률", "전체 시뮬레이션 시간 중 CI가 실행된 시간의 비율", "완료된 CI 소요시간 합계 / 시뮬레이션 종료 시각"],
  ["정상 PR 오격리", "개별 결함이 없는 PR이 최종적으로 격리된 개수", "격리된 PR 중 individualDefect가 false인 PR 수"],
] as const;

export function PolicyComparison({ result, onReplay }: { result: ExperimentResult; onReplay: (policyId: string) => void }) {
  return (
    <section className="results" aria-label="정책 비교 결과">
      <div className="result-heading">
        <div>
          <span className="eyebrow">EXPERIMENT COMPLETE</span>
          <div className="result-title-row">
            <h2>정책 비교 결과</h2>
            <span className="info-tip result-info-tip">
              <button type="button" className="info-icon" aria-label="결과 지표 도움말" aria-describedby="result-metric-help">i</button>
              <span id="result-metric-help" className="info-tooltip result-metrics-tooltip" role="tooltip">
                {RESULT_METRIC_HELP.map(([label, meaning, calculation]) => (
                  <span className="result-metric-help-item" key={label}>
                    <span><strong>{label}:</strong> {meaning}</span>
                    <code>{calculation}</code>
                  </span>
                ))}
              </span>
            </span>
          </div>
        </div>
        <span className="runtime">{result.scenario.repetitions * result.policies.length} runs · {(result.elapsedMs / 1000).toFixed(2)}s</span>
      </div>

      <div className="metric-cards">
        {result.results.map((item, index) => {
          const style = { "--policy-accent": policyColor(index) } as CSSProperties;
          return (
            <article className="metric-card policy-accent" key={item.policy.id} style={style} data-policy-id={item.policy.id}>
              <div className="card-top"><span>{String(index + 1).padStart(2, "0")}</span><button onClick={() => onReplay(item.policy.id)}>실행 재생 ↗</button></div>
              <h3>{policyLabel(item.policy)}</h3>
              <div className="hero-metric"><strong>{formatDuration(mean(item.summary, "resolutionTime.mean"))}</strong><span>PR 평균 판정 시간</span></div>
              <dl>
                <div><dt>결함 PR 유입률</dt><dd>{pct(mean(item.summary, "defectIngressRate"))}</dd></div>
                <div><dt>처리량</dt><dd>{num(mean(item.summary, "throughput"), 3)} /분</dd></div>
                <div><dt>CI 실행</dt><dd>{num(mean(item.summary, "ciRuns"), 0)}회</dd></div>
                <div><dt>PR당 평균 CI 실행</dt><dd>{num(mean(item.summary, "averageCiRunsPerResolvedPr"), 2)}회</dd></div>
                <div><dt>배치당 PR 평균 개수</dt><dd>{num(mean(item.summary, "averageBatchSize"), 2)}개</dd></div>
                <div><dt>성공 배치의 PR 평균 개수</dt><dd>{num(mean(item.summary, "averageSuccessfulBatchSize"), 2)}개</dd></div>
                <div><dt>실패 배치의 PR 평균 개수</dt><dd>{num(mean(item.summary, "averageFailedBatchSize"), 2)}개</dd></div>
                <div><dt>단독 CI 실행 비율</dt><dd>{pct(mean(item.summary, "singletonCiRunRate"))}</dd></div>
                <div><dt>CI 실행당 최종 머지 PR 수</dt><dd>{num(mean(item.summary, "mergedPrsPerCiRun"), 2)}개</dd></div>
                <div><dt>CI 사용률</dt><dd>{pct(mean(item.summary, "ciUtilization"))}</dd></div>
                <div><dt>정상 PR 오격리</dt><dd>{num(mean(item.summary, "falseQuarantines"), 1)}</dd></div>
              </dl>
            </article>
          );
        })}
      </div>
    </section>
  );
}
