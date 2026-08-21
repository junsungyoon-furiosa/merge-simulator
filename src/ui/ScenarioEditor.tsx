import type { PolicyConfig, ScenarioConfig } from "../sim/model";

interface Props {
  scenario: ScenarioConfig;
  policies: PolicyConfig[];
  disabled: boolean;
  onScenario: (scenario: ScenarioConfig) => void;
  onPolicies: (policies: PolicyConfig[]) => void;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function ScenarioEditor({ scenario, policies, disabled, onScenario, onPolicies }: Props) {
  const setNumber = (key: "prCount" | "targetMergeCount" | "repetitions", value: number) => onScenario({ ...scenario, [key]: value });
  const setPolicyNumber = (index: number, key: "batchSize" | "maxWait", value: number) => {
    const next = [...policies];
    next[index] = { ...next[index], [key]: value } as PolicyConfig;
    onPolicies(next);
  };

  return (
    <aside className="control-panel" aria-label="실험 조건">
      <div className="panel-heading">
        <span className="eyebrow">SCENARIO</span>
        <h2>실험 조건</h2>
        <p>값은 현실 추정치가 아닌 비교용 가정입니다.</p>
      </div>

      <fieldset disabled={disabled}>
        <label className="field wide"><span>실험 이름</span><input value={scenario.name} onChange={(event) => onScenario({ ...scenario, name: event.target.value })} /></label>
        <div className="field-grid">
          <label className="field"><span>전체 PR</span><input type="number" min={100} max={1000} value={scenario.prCount} onChange={(event) => setNumber("prCount", clamp(Number(event.target.value), 100, 1000))} /></label>
          <label className="field"><span>목표 머지</span><input type="number" min={1} max={scenario.prCount} value={scenario.targetMergeCount} onChange={(event) => setNumber("targetMergeCount", clamp(Number(event.target.value), 1, scenario.prCount))} /></label>
          <label className="field"><span>정책당 반복</span><input type="number" min={10} max={100} value={scenario.repetitions} onChange={(event) => setNumber("repetitions", clamp(Number(event.target.value), 10, 100))} /></label>
          <label className="field"><span>난수 시드</span><input value={scenario.seed} onChange={(event) => onScenario({ ...scenario, seed: event.target.value })} /></label>
        </div>

        <div className="section-rule"><span>결함과 도착</span></div>
        <div className="field-grid">
          <label className="field"><span>평균 도착 간격 <i>분</i></span><input type="number" min={0.1} value={scenario.arrival.kind === "exponential" ? scenario.arrival.mean : 10} onChange={(event) => onScenario({ ...scenario, arrival: { kind: "exponential", mean: Number(event.target.value) } })} /></label>
          <label className="field"><span>개별 결함률 <i>%</i></span><input type="number" min={0} max={100} step={0.1} value={scenario.individualDefectProbability * 100} onChange={(event) => onScenario({ ...scenario, individualDefectProbability: Number(event.target.value) / 100 })} /></label>
          <label className="field"><span>상호작용 / 100 PR</span><input type="number" min={0} step={0.1} value={scenario.interactionDefects.setsPerHundredPrs} onChange={(event) => onScenario({ ...scenario, interactionDefects: { ...scenario.interactionDefects, setsPerHundredPrs: Number(event.target.value) } })} /></label>
          <label className="field"><span>상호작용 최대 크기</span><input type="number" min={2} max={10} value={scenario.interactionDefects.maxSize} onChange={(event) => onScenario({ ...scenario, interactionDefects: { ...scenario.interactionDefects, maxSize: Number(event.target.value) } })} /></label>
        </div>

        <div className="section-rule"><span>CI와 LLM</span></div>
        <div className="field-grid">
          <label className="field"><span>CI 최소 시간 <i>분</i></span><input type="number" min={0.1} value={scenario.ci.duration.kind === "uniform" ? scenario.ci.duration.min : 50} onChange={(event) => onScenario({ ...scenario, ci: { ...scenario.ci, duration: { kind: "uniform", min: Number(event.target.value), max: scenario.ci.duration.kind === "uniform" ? Math.max(Number(event.target.value), scenario.ci.duration.max) : 70 } } })} /></label>
          <label className="field"><span>CI 최대 시간 <i>분</i></span><input type="number" min={0.1} value={scenario.ci.duration.kind === "uniform" ? scenario.ci.duration.max : 70} onChange={(event) => onScenario({ ...scenario, ci: { ...scenario.ci, duration: { kind: "uniform", min: scenario.ci.duration.kind === "uniform" ? Math.min(scenario.ci.duration.min, Number(event.target.value)) : 50, max: Number(event.target.value) } } })} /></label>
          <label className="field"><span>거짓 음성률 <i>%</i></span><input type="number" min={0} max={100} step={0.1} value={scenario.ci.falseNegativeRate * 100} onChange={(event) => onScenario({ ...scenario, ci: { ...scenario.ci, falseNegativeRate: Number(event.target.value) / 100 } })} /></label>
          <label className="field"><span>거짓 양성률 <i>%</i></span><input type="number" min={0} max={100} step={0.1} value={scenario.ci.falsePositiveRate * 100} onChange={(event) => onScenario({ ...scenario, ci: { ...scenario.ci, falsePositiveRate: Number(event.target.value) / 100 } })} /></label>
          <label className="field"><span>LLM 적중률 <i>%</i></span><input type="number" min={0} max={100} value={scenario.llm.culpritHitRate * 100} onChange={(event) => onScenario({ ...scenario, llm: { ...scenario.llm, culpritHitRate: Number(event.target.value) / 100 } })} /></label>
          <label className="field"><span>LLM 오지목률 <i>%</i></span><input type="number" min={0} max={100} value={scenario.llm.innocentFalseAccusationRate * 100} onChange={(event) => onScenario({ ...scenario, llm: { ...scenario.llm, innocentFalseAccusationRate: Number(event.target.value) / 100 } })} /></label>
          <label className="field"><span>LLM 최소 시간 <i>분</i></span><input type="number" min={0.1} value={scenario.llm.duration.kind === "uniform" ? scenario.llm.duration.min : 1} onChange={(event) => onScenario({ ...scenario, llm: { ...scenario.llm, duration: { kind: "uniform", min: Number(event.target.value), max: scenario.llm.duration.kind === "uniform" ? Math.max(Number(event.target.value), scenario.llm.duration.max) : 3 } } })} /></label>
          <label className="field"><span>LLM 최대 시간 <i>분</i></span><input type="number" min={0.1} value={scenario.llm.duration.kind === "uniform" ? scenario.llm.duration.max : 3} onChange={(event) => onScenario({ ...scenario, llm: { ...scenario.llm, duration: { kind: "uniform", min: scenario.llm.duration.kind === "uniform" ? Math.min(scenario.llm.duration.min, Number(event.target.value)) : 1, max: Number(event.target.value) } } })} /></label>
          <label className="field"><span>CI 1회 비용 <i>선택</i></span><input type="number" min={0} placeholder="미입력" value={scenario.ci.costPerRun ?? ""} onChange={(event) => onScenario({ ...scenario, ci: { ...scenario.ci, costPerRun: event.target.value === "" ? undefined : Number(event.target.value) } })} /></label>
          <label className="field"><span>LLM 1회 비용 <i>선택</i></span><input type="number" min={0} placeholder="미입력" value={scenario.llm.costPerCall ?? ""} onChange={(event) => onScenario({ ...scenario, llm: { ...scenario.llm, costPerCall: event.target.value === "" ? undefined : Number(event.target.value) } })} /></label>
        </div>

        <div className="section-rule"><span>비교 정책</span></div>
        <div className="policy-list">
          <div className="policy-row"><b>01</b><span>순차 CI</span><small>PR을 한 개씩 검사</small></div>
          <div className="policy-row editable"><b>02</b><span>배치 분할</span><label>크기<input aria-label="배치 분할 크기" type="number" min={2} max={100} value={policies[1]?.kind === "batchSplit" ? policies[1].batchSize : 8} onChange={(event) => setPolicyNumber(1, "batchSize", Number(event.target.value))} /></label></div>
          <div className="policy-row editable"><b>03</b><span>LLM 보조</span><label>크기<input aria-label="LLM 보조 크기" type="number" min={2} max={100} value={policies[2]?.kind === "llmAssisted" ? policies[2].batchSize : 8} onChange={(event) => setPolicyNumber(2, "batchSize", Number(event.target.value))} /></label></div>
        </div>
      </fieldset>
    </aside>
  );
}
