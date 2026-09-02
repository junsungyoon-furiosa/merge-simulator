import { useId, useState, type ReactNode } from "react";
import type { PolicyConfig, PolicyInstance, PolicyKind, ScenarioConfig } from "../sim/model";
import { createPolicyInstance, getPolicyDefinition, POLICY_DEFINITIONS } from "../sim/policyRegistry";
import "./policy-expansion.css";
import "./reset-defaults.css";

interface Props {
  scenario: ScenarioConfig;
  policies: PolicyInstance[];
  disabled: boolean;
  onScenario: (scenario: ScenarioConfig) => void;
  onPolicies: (policies: PolicyInstance[]) => void;
  onReset: () => void;
  onOpenEvidence: () => void;
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
  arrival: "하루에 생성되는 PR 수의 평균입니다. 실제 일별 생성 수는 포아송 분포로 달라지며, KST 시간대별 활성화 비중에 따라 도착 시각이 정해집니다.",
  individualDefect: "각 PR이 다른 PR과 무관한 개별 결함을 가질 확률입니다. 실제 결함 여부는 정책에 공개되지 않습니다.",
  interactions: "PR 100개당 생성할 상호작용 결함 집합 수의 평균입니다. 실제 개수는 포아송 분포로 추첨됩니다.",
  interactionSize: "하나의 상호작용 결함 집합에 포함될 수 있는 최대 PR 수입니다. 구성 PR이 모두 함께 있을 때 결함이 발생합니다.",
  ciFailureDuration: "CI가 실패로 판정한 실행의 소요시간 구간입니다. 표시된 확률만큼의 실행시간이 하한과 상한 사이에 나오며, 나머지는 양쪽 범위 밖에서 나올 수 있습니다.",
  ciSuccessDuration: "CI가 성공으로 판정한 실행의 소요시간 구간입니다. 성공 실행은 실패 실행과 별도의 분포에서 시간을 추첨합니다.",
  falseNegative: "실제로 비정상인 후보 master를 CI가 성공으로 잘못 판정할 확률입니다. 이 경우 결함 배치도 즉시 머지됩니다.",
  falsePositive: "실제로 정상인 후보 master를 CI가 실패로 잘못 판정할 확률입니다. 단독 CI라면 정상 PR도 격리될 수 있습니다.",
  llmHit: "실패 배치의 실제 범인 PR 각각을 LLM이 지목할 확률입니다. 지목만으로는 격리되지 않으며 단독 CI 실패가 필요합니다.",
  llmFalseAccusation: "실패 배치의 정상 PR 각각을 LLM이 범인으로 잘못 지목할 확률입니다. 값이 높을수록 불필요한 후속 검사가 늘 수 있습니다.",
  llmDuration: "LLM 호출 한 번의 소요시간 구간입니다. 표시된 확률만큼의 호출시간이 하한과 상한 사이에 나오며, 서로 다른 실패 배치의 호출은 동시에 진행될 수 있습니다.",
  ciCost: "CI 실행 한 번의 비용입니다. 비워두면 비용을 계산하지 않으며 화폐나 크레딧 등 단위는 사용자가 일관되게 정합니다.",
  llmCost: "LLM 호출 한 번의 비용입니다. 비워두면 비용을 계산하지 않으며 완료된 호출 수와 곱해 총비용을 구합니다.",
} as const;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const coveragePercent = (coverage: number) => Number((coverage * 100).toFixed(4));

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

export function ScenarioEditor({ scenario, policies, disabled, onScenario, onPolicies, onReset, onOpenEvidence }: Props) {
  const [newPolicyKind, setNewPolicyKind] = useState<PolicyKind>("sequential");
  const setNumber = (key: "prCount" | "targetMergeCount" | "repetitions", value: number) => onScenario({ ...scenario, [key]: value });
  const setPolicyValue = (policyId: string, key: string, value: number | string) => {
    onPolicies(policies.map((policy) => policy.id === policyId
      ? { ...policy, config: { ...policy.config, [key]: value } as PolicyConfig }
      : policy));
  };
  const duplicatePolicy = (policy: PolicyInstance) => {
    onPolicies([...policies, { id: crypto.randomUUID(), config: structuredClone(policy.config) }]);
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
        <button type="button" className="evidence-shortcut" onClick={onOpenEvidence}>환경값 의미와 산출근거 보기</button>
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
          <Field title="근무일당 평균 PR 생성 수" description={descriptions.arrival} unit="PR/일">
            {(id) => <input id={id} type="number" min={0.1} step={0.1} value={scenario.arrival.meanPerDay} onChange={(event) => onScenario({ ...scenario, arrival: { ...scenario.arrival, meanPerDay: Number(event.target.value) } })} />}
          </Field>
          <Field title="개별 결함률" description={descriptions.individualDefect} unit="%">
            {(id) => <input id={id} type="number" min={0} max={100} step={0.1} value={scenario.individualDefectProbability * 100} onChange={(event) => onScenario({ ...scenario, individualDefectProbability: Number(event.target.value) / 100 })} />}
          </Field>
        </div>

        <div className="section-rule"><span>CI 테스트</span></div>
        <div className="field-grid">
          <Field title={"CI 실패 시간 " + coveragePercent(scenario.ci.failureDuration.coverage) + "% 하한"} description={descriptions.ciFailureDuration} unit="분">
            {(id) => <input id={id} type="number" min={0.1} value={scenario.ci.failureDuration.lower} onChange={(event) => onScenario({ ...scenario, ci: { ...scenario.ci, failureDuration: { ...scenario.ci.failureDuration, lower: Number(event.target.value), upper: Math.max(Number(event.target.value), scenario.ci.failureDuration.upper) } } })} />}
          </Field>
          <Field title={"CI 실패 시간 " + coveragePercent(scenario.ci.failureDuration.coverage) + "% 상한"} description={descriptions.ciFailureDuration} unit="분">
            {(id) => <input id={id} type="number" min={0.1} value={scenario.ci.failureDuration.upper} onChange={(event) => onScenario({ ...scenario, ci: { ...scenario.ci, failureDuration: { ...scenario.ci.failureDuration, lower: Math.min(scenario.ci.failureDuration.lower, Number(event.target.value)), upper: Number(event.target.value) } } })} />}
          </Field>
          <Field title={"CI 성공 시간 " + coveragePercent(scenario.ci.successDuration.coverage) + "% 하한"} description={descriptions.ciSuccessDuration} unit="분">
            {(id) => <input id={id} type="number" min={0.1} value={scenario.ci.successDuration.lower} onChange={(event) => onScenario({ ...scenario, ci: { ...scenario.ci, successDuration: { ...scenario.ci.successDuration, lower: Number(event.target.value), upper: Math.max(Number(event.target.value), scenario.ci.successDuration.upper) } } })} />}
          </Field>
          <Field title={"CI 성공 시간 " + coveragePercent(scenario.ci.successDuration.coverage) + "% 상한"} description={descriptions.ciSuccessDuration} unit="분">
            {(id) => <input id={id} type="number" min={0.1} value={scenario.ci.successDuration.upper} onChange={(event) => onScenario({ ...scenario, ci: { ...scenario.ci, successDuration: { ...scenario.ci.successDuration, lower: Math.min(scenario.ci.successDuration.lower, Number(event.target.value)), upper: Number(event.target.value) } } })} />}
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
          <Field title={"LLM 시간 " + coveragePercent(scenario.llm.duration.coverage) + "% 하한"} description={descriptions.llmDuration} unit="분">
            {(id) => <input id={id} type="number" min={0.1} value={scenario.llm.duration.lower} onChange={(event) => onScenario({ ...scenario, llm: { ...scenario.llm, duration: { ...scenario.llm.duration, lower: Number(event.target.value), upper: Math.max(Number(event.target.value), scenario.llm.duration.upper) } } })} />}
          </Field>
          <Field title={"LLM 시간 " + coveragePercent(scenario.llm.duration.coverage) + "% 상한"} description={descriptions.llmDuration} unit="분">
            {(id) => <input id={id} type="number" min={0.1} value={scenario.llm.duration.upper} onChange={(event) => onScenario({ ...scenario, llm: { ...scenario.llm, duration: { ...scenario.llm.duration, lower: Math.min(scenario.llm.duration.lower, Number(event.target.value)), upper: Number(event.target.value) } } })} />}
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
          {policies.map((policy, index) => {
            const definition = getPolicyDefinition(policy.config.kind);
            const values = policy.config as unknown as Record<string, number | string>;
            return (
              <article className="policy-instance" key={policy.id} data-policy-id={policy.id}>
                <div className="policy-instance-heading">
                  <b>{String(index + 1).padStart(2, "0")}</b>
                  <div><strong>{definition.label}</strong><small>{definition.description}</small></div>
                </div>
                {definition.fields.length > 0 && (
                  <div className="policy-field-grid">
                    {definition.fields.map((field) => (
                      <label key={field.key}>
                        <span>{field.label}</span>
                        {field.type === "number" ? (
                          <input
                            aria-label={`${index + 1}번 ${definition.label} ${field.label}`}
                            type="number"
                            min={field.min}
                            max={field.max}
                            step={field.step}
                            value={values[field.key]}
                            onChange={(event) => setPolicyValue(policy.id, field.key, Number(event.target.value))}
                          />
                        ) : (
                          <select
                            aria-label={`${index + 1}번 ${definition.label} ${field.label}`}
                            value={values[field.key]}
                            onChange={(event) => setPolicyValue(policy.id, field.key, event.target.value)}
                          >
                            {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                        )}
                      </label>
                    ))}
                  </div>
                )}
                <div className="policy-instance-actions">
                  <button type="button" aria-label={`${index + 1}번 ${definition.label} 복제`} onClick={() => duplicatePolicy(policy)}>복제</button>
                  <button type="button" aria-label={`${index + 1}번 ${definition.label} 제거`} disabled={policies.length === 1} onClick={() => onPolicies(policies.filter((item) => item.id !== policy.id))}>제거</button>
                </div>
              </article>
            );
          })}
          <div className="policy-add-row">
            <select aria-label="추가할 정책" value={newPolicyKind} onChange={(event) => setNewPolicyKind(event.target.value as PolicyKind)}>
              {POLICY_DEFINITIONS.map((definition) => <option key={definition.kind} value={definition.kind}>{definition.label}</option>)}
            </select>
            <button type="button" onClick={() => onPolicies([...policies, createPolicyInstance(newPolicyKind)])}>정책 추가</button>
          </div>
        </div>
      </fieldset>
    </aside>
  );
}
