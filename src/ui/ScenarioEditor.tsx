import { useId, type ReactNode } from "react";
import type { PolicyConfig, ScenarioConfig } from "../sim/model";
import "./reset-defaults.css";

interface Props {
  scenario: ScenarioConfig;
  policies: PolicyConfig[];
  disabled: boolean;
  onScenario: (scenario: ScenarioConfig) => void;
  onPolicies: (policies: PolicyConfig[]) => void;
  onReset: () => void;
}

interface FieldProps {
  title: string;
  description: string;
  unit?: string;
  wide?: boolean;
  children: (inputId: string) => ReactNode;
}

const descriptions = {
  name: "저장하거나 내보낸 실험을 구분하는 이름입니다. 시뮬레이션 계산 결과에는 영향을 주지 않습니다.",
  prCount: "한 번의 반복에서 생성할 전체 PR 수입니다. PR은 도착 간격에 따라 시뮬레이션 도중 순차적으로 나타납니다.",
  targetMergeCount: "머지된 PR 수가 이 값 이상이 되면 실행을 종료합니다. 배치 전체가 원자적으로 머지되므로 최종 머지 수가 조금 초과할 수 있습니다.",
  repetitions: "각 정책을 반복 실행할 횟수입니다. 반복 결과로 평균, 백분위수와 신뢰구간을 계산합니다.",
  seed: "PR 도착, 결함, CI와 LLM 결과를 재현하는 기준 문자열입니다. 같은 설정과 시드는 같은 결과를 만듭니다.",
  arrival: "PR 사이 도착 간격의 평균입니다. 현재는 지수분포를 사용하므로 실제 간격은 매번 달라집니다.",
  individualDefect: "각 PR이 다른 PR과 무관한 개별 결함을 가질 확률입니다. 실제 결함 여부는 정책에 공개되지 않습니다.",
  interactions: "PR 100개당 생성할 상호작용 결함 집합 수의 평균입니다. 실제 개수는 포아송 분포로 추첨됩니다.",
  interactionSize: "하나의 상호작용 결함 집합에 포함될 수 있는 최대 PR 수입니다. 구성 PR이 모두 함께 있을 때 결함이 발생합니다.",
  ciMin: "CI 한 번의 실행시간 최솟값입니다. 실행시간은 최소와 최대 사이에서 균등하게 추첨되며 배치 크기와 무관합니다.",
  ciMax: "CI 한 번의 실행시간 최댓값입니다. 같은 배치를 재검사해도 실행시간은 다시 추첨됩니다.",
  falseNegative: "실제로 비정상인 후보 master를 CI가 성공으로 잘못 판정할 확률입니다. 이 경우 결함 배치도 즉시 머지됩니다.",
  falsePositive: "실제로 정상인 후보 master를 CI가 실패로 잘못 판정할 확률입니다. 단독 CI라면 정상 PR도 격리될 수 있습니다.",
  llmHit: "실패 배치의 실제 범인 PR 각각을 LLM이 지목할 확률입니다. 지목만으로는 격리되지 않으며 단독 CI 실패가 필요합니다.",
  llmFalseAccusation: "실패 배치의 정상 PR 각각을 LLM이 범인으로 잘못 지목할 확률입니다. 값이 높을수록 불필요한 후속 검사가 늘 수 있습니다.",
  llmMin: "LLM 호출 한 번의 최소 실행시간입니다. 서로 다른 실패 배치의 LLM 호출은 동시에 진행될 수 있습니다.",
  llmMax: "LLM 호출 한 번의 최대 실행시간입니다. 호출시간은 최소와 최대 사이에서 균등하게 추첨됩니다.",
  ciCost: "CI 실행 한 번의 비용입니다. 비워두면 비용을 계산하지 않으며 화폐나 크레딧 등 단위는 사용자가 일관되게 정합니다.",
  llmCost: "LLM 호출 한 번의 비용입니다. 비워두면 비용을 계산하지 않으며 완료된 호출 수와 곱해 총비용을 구합니다.",
} as const;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function Field({ title, description, unit, wide = false, children }: FieldProps) {
  const inputId = useId();
  const tooltipId = `${inputId}-help`;

  return (
    <div className={`field${wide ? " wide" : ""}`}>
      <div className="field-label-row">
        <label htmlFor={inputId}>{title}</label>
        <span className="info-tip">
          <button type="button" className="info-icon" aria-label="도움말" aria-describedby={tooltipId}>i</button>
          <span id={tooltipId} className="info-tooltip" role="tooltip">{description}</span>
        </span>
      </div>
      <div className="field-input-row">
        {children(inputId)}
        {unit && <span className="field-unit">{unit}</span>}
      </div>
    </div>
  );
}

export function ScenarioEditor({ scenario, policies, disabled, onScenario, onPolicies, onReset }: Props) {
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
        <button type="button" className="reset-defaults-button" onClick={onReset}>기본값으로 초기화</button>
        <Field title="실험 이름" description={descriptions.name} wide>
          {(id) => <input id={id} value={scenario.name} onChange={(event) => onScenario({ ...scenario, name: event.target.value })} />}
        </Field>
        <div className="field-grid">
          <Field title="전체 PR" description={descriptions.prCount}>
            {(id) => <input id={id} type="number" min={100} max={1000} value={scenario.prCount} onChange={(event) => setNumber("prCount", clamp(Number(event.target.value), 100, 1000))} />}
          </Field>
          <Field title="목표 머지" description={descriptions.targetMergeCount}>
            {(id) => <input id={id} type="number" min={1} max={scenario.prCount} value={scenario.targetMergeCount} onChange={(event) => setNumber("targetMergeCount", clamp(Number(event.target.value), 1, scenario.prCount))} />}
          </Field>
          <Field title="정책당 시뮬레이션 횟수" description={descriptions.repetitions}>
            {(id) => <input id={id} type="number" min={10} max={100} value={scenario.repetitions} onChange={(event) => setNumber("repetitions", clamp(Number(event.target.value), 10, 100))} />}
          </Field>
          <Field title="난수 시드" description={descriptions.seed}>
            {(id) => <input id={id} value={scenario.seed} onChange={(event) => onScenario({ ...scenario, seed: event.target.value })} />}
          </Field>
        </div>

        <div className="section-rule"><span>결함과 도착</span></div>
        <div className="field-grid">
          <Field title="평균 도착 간격" description={descriptions.arrival} unit="분">
            {(id) => <input id={id} type="number" min={0.1} value={scenario.arrival.kind === "exponential" ? scenario.arrival.mean : 10} onChange={(event) => onScenario({ ...scenario, arrival: { kind: "exponential", mean: Number(event.target.value) } })} />}
          </Field>
          <Field title="개별 결함률" description={descriptions.individualDefect} unit="%">
            {(id) => <input id={id} type="number" min={0} max={100} step={0.1} value={scenario.individualDefectProbability * 100} onChange={(event) => onScenario({ ...scenario, individualDefectProbability: Number(event.target.value) / 100 })} />}
          </Field>
        </div>

        <div className="section-rule"><span>CI 테스트</span></div>
        <div className="field-grid">
          <Field title="CI 최소 시간" description={descriptions.ciMin} unit="분">
            {(id) => <input id={id} type="number" min={0.1} value={scenario.ci.duration.kind === "uniform" ? scenario.ci.duration.min : 50} onChange={(event) => onScenario({ ...scenario, ci: { ...scenario.ci, duration: { kind: "uniform", min: Number(event.target.value), max: scenario.ci.duration.kind === "uniform" ? Math.max(Number(event.target.value), scenario.ci.duration.max) : 70 } } })} />}
          </Field>
          <Field title="CI 최대 시간" description={descriptions.ciMax} unit="분">
            {(id) => <input id={id} type="number" min={0.1} value={scenario.ci.duration.kind === "uniform" ? scenario.ci.duration.max : 70} onChange={(event) => onScenario({ ...scenario, ci: { ...scenario.ci, duration: { kind: "uniform", min: scenario.ci.duration.kind === "uniform" ? Math.min(scenario.ci.duration.min, Number(event.target.value)) : 50, max: Number(event.target.value) } } })} />}
          </Field>
          <Field title="거짓 음성률" description={descriptions.falseNegative} unit="%">
            {(id) => <input id={id} type="number" min={0} max={100} step={0.1} value={scenario.ci.falseNegativeRate * 100} onChange={(event) => onScenario({ ...scenario, ci: { ...scenario.ci, falseNegativeRate: Number(event.target.value) / 100 } })} />}
          </Field>
          <Field title="거짓 양성률" description={descriptions.falsePositive} unit="%">
            {(id) => <input id={id} type="number" min={0} max={100} step={0.1} value={scenario.ci.falsePositiveRate * 100} onChange={(event) => onScenario({ ...scenario, ci: { ...scenario.ci, falsePositiveRate: Number(event.target.value) / 100 } })} />}
          </Field>
        </div>

        <div className="section-rule"><span>LLM 탐정</span></div>
        <div className="field-grid">
          <Field title="LLM 적중률" description={descriptions.llmHit} unit="%">
            {(id) => <input id={id} type="number" min={0} max={100} value={scenario.llm.culpritHitRate * 100} onChange={(event) => onScenario({ ...scenario, llm: { ...scenario.llm, culpritHitRate: Number(event.target.value) / 100 } })} />}
          </Field>
          <Field title="LLM 오지목률" description={descriptions.llmFalseAccusation} unit="%">
            {(id) => <input id={id} type="number" min={0} max={100} value={scenario.llm.innocentFalseAccusationRate * 100} onChange={(event) => onScenario({ ...scenario, llm: { ...scenario.llm, innocentFalseAccusationRate: Number(event.target.value) / 100 } })} />}
          </Field>
          <Field title="LLM 최소 시간" description={descriptions.llmMin} unit="분">
            {(id) => <input id={id} type="number" min={0.1} value={scenario.llm.duration.kind === "uniform" ? scenario.llm.duration.min : 1} onChange={(event) => onScenario({ ...scenario, llm: { ...scenario.llm, duration: { kind: "uniform", min: Number(event.target.value), max: scenario.llm.duration.kind === "uniform" ? Math.max(Number(event.target.value), scenario.llm.duration.max) : 3 } } })} />}
          </Field>
          <Field title="LLM 최대 시간" description={descriptions.llmMax} unit="분">
            {(id) => <input id={id} type="number" min={0.1} value={scenario.llm.duration.kind === "uniform" ? scenario.llm.duration.max : 3} onChange={(event) => onScenario({ ...scenario, llm: { ...scenario.llm, duration: { kind: "uniform", min: scenario.llm.duration.kind === "uniform" ? Math.min(scenario.llm.duration.min, Number(event.target.value)) : 1, max: Number(event.target.value) } } })} />}
          </Field>
        </div>

        <div className="section-rule"><span>고급</span></div>
        <div className="field-grid">
          <Field title="상호작용 / 100 PR" description={descriptions.interactions}>
            {(id) => <input id={id} type="number" min={0} step={0.1} value={scenario.interactionDefects.setsPerHundredPrs} onChange={(event) => onScenario({ ...scenario, interactionDefects: { ...scenario.interactionDefects, setsPerHundredPrs: Number(event.target.value) } })} />}
          </Field>
          <Field title="상호작용 최대 크기" description={descriptions.interactionSize}>
            {(id) => <input id={id} type="number" min={2} max={10} value={scenario.interactionDefects.maxSize} onChange={(event) => onScenario({ ...scenario, interactionDefects: { ...scenario.interactionDefects, maxSize: Number(event.target.value) } })} />}
          </Field>
          <Field title="CI 1회 비용" description={descriptions.ciCost}>
            {(id) => <input id={id} type="number" min={0} placeholder="미입력" value={scenario.ci.costPerRun ?? ""} onChange={(event) => onScenario({ ...scenario, ci: { ...scenario.ci, costPerRun: event.target.value === "" ? undefined : Number(event.target.value) } })} />}
          </Field>
          <Field title="LLM 1회 비용" description={descriptions.llmCost}>
            {(id) => <input id={id} type="number" min={0} placeholder="미입력" value={scenario.llm.costPerCall ?? ""} onChange={(event) => onScenario({ ...scenario, llm: { ...scenario.llm, costPerCall: event.target.value === "" ? undefined : Number(event.target.value) } })} />}
          </Field>
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
