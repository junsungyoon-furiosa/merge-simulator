import type { CSSProperties } from "react";
import type { ExperimentResult, MetricSummary } from "../sim/model";
import { policyLabel } from "../sim/policyRegistry";
import { formatDuration } from "./formatDuration";
import "./policy-expansion.css";

const pct = (value: number | null | undefined) => value == null ? "—" : `${(value * 100).toFixed(2)}%`;
const num = (value: number | null | undefined, digits = 1) => value == null ? "—" : value.toFixed(digits);
const mean = (summary: Record<string, MetricSummary>, key: string) => summary[key]?.mean ?? null;
const policyColor = (index: number) => `hsl(${Math.round((index * 137.508 + 158) % 360)} 52% 43%)`;

export function PolicyComparison({ result, onReplay }: { result: ExperimentResult; onReplay: (policyId: string) => void }) {
  const points = result.results.map((item) => ({ x: mean(item.summary, "normalMergeTime.mean") ?? 0, y: mean(item.summary, "defectIngressRate") ?? 0 }));
  const maxX = Math.max(1, ...points.map((point) => point.x));
  const maxY = Math.max(0.01, ...points.map((point) => point.y));

  return (
    <section className="results" aria-label="정책 비교 결과">
      <div className="result-heading">
        <div><span className="eyebrow">EXPERIMENT COMPLETE</span><h2>정책 비교 결과</h2></div>
        <span className="runtime">{result.scenario.repetitions * result.policies.length} runs · {(result.elapsedMs / 1000).toFixed(2)}s</span>
      </div>

      <div className="metric-cards">
        {result.results.map((item, index) => {
          const style = { "--policy-accent": policyColor(index) } as CSSProperties;
          return (
            <article className="metric-card policy-accent" key={item.policy.id} style={style} data-policy-id={item.policy.id}>
              <div className="card-top"><span>{String(index + 1).padStart(2, "0")}</span><button onClick={() => onReplay(item.policy.id)}>실행 재생 ↗</button></div>
              <h3>{policyLabel(item.policy)}</h3>
              <div className="hero-metric"><strong>{formatDuration(mean(item.summary, "normalMergeTime.mean"))}</strong><span>정상 PR 평균 머지</span></div>
              <dl>
                <div><dt>결함 PR 유입률</dt><dd>{pct(mean(item.summary, "defectIngressRate"))}</dd></div>
                <div><dt>처리량</dt><dd>{num(mean(item.summary, "throughput"), 3)} /분</dd></div>
                <div><dt>CI 실행</dt><dd>{num(mean(item.summary, "ciRuns"), 0)}회</dd></div>
                <div><dt>CI 사용률</dt><dd>{pct(mean(item.summary, "ciUtilization"))}</dd></div>
                <div><dt>상호작용 유입</dt><dd>{pct(mean(item.summary, "harmfulInteractionRate"))}</dd></div>
                <div><dt>정상 PR 오격리</dt><dd>{num(mean(item.summary, "falseQuarantines"), 1)}</dd></div>
              </dl>
            </article>
          );
        })}
      </div>

      <div className="analysis-grid">
        <article className="chart-panel">
          <div className="chart-title"><div><span className="eyebrow">TRADE-OFF MAP</span><h3>안전성 × 속도</h3></div><small>왼쪽 아래일수록 빠르고 안전함</small></div>
          <svg className="scatter" viewBox="0 0 620 260" role="img" aria-label="정책별 안전성과 속도 산점도">
            {[0, 1, 2, 3, 4].map((line) => <line key={line} x1="58" x2="600" y1={220 - line * 48} y2={220 - line * 48} />)}
            <text x="8" y="24">결함률</text><text x="510" y="252">머지 시간 →</text>
            {points.map((point, index) => {
              const item = result.results[index];
              const x = 70 + (point.x / maxX) * 500;
              const y = 215 - (point.y / maxY) * 180;
              return <g key={item.policy.id}><circle className="point" style={{ fill: policyColor(index) }} cx={x} cy={y} r="10" /><text x={x + 15} y={y + 5}>{policyLabel(item.policy)}</text></g>;
            })}
          </svg>
        </article>
        <article className="detail-panel">
          <span className="eyebrow">READ THE NUMBERS</span><h3>판단을 대신하지 않습니다</h3>
          <p>동일한 숨겨진 PR 세계를 각 정책에 적용했습니다. 표의 수치는 반복 실행의 평균이며, 정책의 우열은 조직이 중요하게 보는 안전성·속도·비용 기준에 따라 직접 판단하세요.</p>
          <div className="confidence"><span>신뢰구간</span><b>각 지표에 95% CI 계산됨</b></div>
          <div className="confidence"><span>재현성</span><b>seed: {result.scenario.seed}</b></div>
        </article>
      </div>
    </section>
  );
}
