import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { applicableParameterIds, applyCalibration, calibrationSourceState, previewCalibration } from "../calibration/applyCalibration";
import { ACTIVE_CALIBRATION_PROFILE } from "../calibration/evidence/registry";
import type { CalibrationProfile } from "../calibration/model";
import { getParameterDefinition, PARAMETER_REGISTRY, type ParameterGroup } from "../calibration/parameterRegistry";
import type { EnvironmentParameterId, ScenarioConfig } from "../sim/model";
import { CalibrationApplyDialog } from "./CalibrationApplyDialog";
import "./environment-evidence.css";

interface Props {
  scenario: ScenarioConfig;
  onScenario: (scenario: ScenarioConfig) => void;
  profile?: CalibrationProfile;
}

const documentationLabels = { notStarted: "근거 미작성", draft: "근거 작성 중", complete: "근거 작성 완료" } as const;
const estimateLabels = { none: "값 미산출", provisional: "임시 추정값", recommended: "권장 추정값" } as const;
const sourceLabels = { direct: "직접 입력", applied: "프로필 적용값", modified: "적용 후 수정됨" } as const;
const groups: ParameterGroup[] = ["PR", "CI", "LLM"];

export default function EnvironmentEvidencePage({ scenario, onScenario, profile = ACTIVE_CALIBRATION_PROFILE }: Props) {
  const [selectedId, setSelectedId] = useState<EnvironmentParameterId>("arrivalMean");
  const [pendingIds, setPendingIds] = useState<EnvironmentParameterId[]>();
  const applicableIds = useMemo(() => applicableParameterIds(profile), [profile]);
  const selected = profile.parameters[selectedId];
  const definition = getParameterDefinition(selectedId);
  const estimateText = selected.estimate.status === "none" ? "아직 산출하지 않았습니다." : definition.format(selected.estimate.value);
  const current = definition.read(scenario);
  const preview = pendingIds ? previewCalibration(scenario, profile, pendingIds) : [];

  const confirmApply = () => {
    if (!pendingIds) return;
    onScenario(applyCalibration(scenario, profile, pendingIds));
    setPendingIds(undefined);
  };

  return (
    <main className="evidence-page">
      <section className="evidence-hero">
        <span className="eyebrow">CALIBRATION EVIDENCE</span>
        <h1>환경값 근거</h1>
        <p>{profile.description} 이 값은 절대적인 정답이 아니며 관측 기간과 산출 방식에 따라 달라질 수 있습니다.</p>
        <div className="profile-summary">
          <div><small>프로필</small><strong>{profile.name}</strong></div>
          <div><small>버전</small><strong>{profile.version}</strong></div>
          <div><small>근거 작성 중</small><strong>{PARAMETER_REGISTRY.filter(({ id }) => profile.parameters[id].documentationStatus === "draft").length} / {PARAMETER_REGISTRY.length}</strong></div>
          <div><small>적용 가능</small><strong>{applicableIds.length} / {PARAMETER_REGISTRY.length}</strong></div>
          <button type="button" disabled={applicableIds.length === 0} onClick={() => setPendingIds(applicableIds)}>
            {applicableIds.length === 0 ? "적용 가능한 관측·추정값 없음" : "적용 가능한 값 모두 적용"}
          </button>
        </div>
      </section>

      <div className="evidence-layout">
        <nav className="parameter-catalog" aria-label="환경 파라미터 목록">
          {groups.map((group) => (
            <section key={group}>
              <h2>{group}</h2>
              {PARAMETER_REGISTRY.filter((item) => item.group === group).map((item) => {
                const evidence = profile.parameters[item.id];
                return (
                  <button key={item.id} type="button" aria-current={selectedId === item.id ? "page" : undefined} onClick={() => setSelectedId(item.id)}>
                    <strong>{item.label}</strong>
                    <span><i className={`status-dot ${evidence.documentationStatus}`} />{documentationLabels[evidence.documentationStatus]}</span>
                    <span>{estimateLabels[evidence.estimate.status]}</span>
                  </button>
                );
              })}
            </section>
          ))}
        </nav>

        <article className="evidence-detail">
          <header>
            <div>
              <span className="eyebrow">{definition.group} PARAMETER</span>
              <h2>{definition.label}</h2>
              <div className="status-pills"><span>{documentationLabels[selected.documentationStatus]}</span><span>{estimateLabels[selected.estimate.status]}</span><span>{sourceLabels[calibrationSourceState(scenario, selectedId)]}</span></div>
            </div>
            <button type="button" className="primary-action" disabled={selected.estimate.status === "none" || current === undefined} onClick={() => setPendingIds([selectedId])}>이 값 적용</button>
          </header>

          <div className="meaning-grid">
            <section><h3>현실에서의 의미</h3><p>{selected.realityMeaning}</p></section>
            <section><h3>시뮬레이션에서의 의미</h3><p>{selected.simulationMeaning}</p></section>
          </div>

          <section className="estimate-card">
            <div><h3>관측·추정값</h3><strong>{estimateText}</strong></div>
            <div><h3>현재 실험값</h3><strong>{current === undefined ? "현재 도착 분포에는 적용할 수 없음" : definition.format(current)}</strong></div>
          </section>

          <section><h3>산출 방법</h3><ol>{selected.method.map((step) => <li key={step}>{step}</li>)}</ol></section>
          <section><h3>데이터 기준</h3><dl className="data-basis">
            <div><dt>데이터 출처</dt><dd>{selected.dataBasis.source ?? "미정"}</dd></div>
            <div><dt>관측 기간</dt><dd>{selected.dataBasis.observationPeriod ?? "미정"}</dd></div>
            <div><dt>표본 수</dt><dd>{selected.dataBasis.sampleSize?.toLocaleString() ?? "미정"}</dd></div>
            <div><dt>마지막 갱신일</dt><dd>{selected.dataBasis.updatedAt ?? "미정"}</dd></div>
          </dl></section>
          <section className="markdown-evidence"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{ a: ({ children, ...props }) => <a {...props} rel="noreferrer">{children}</a> }}>{selected.detailMarkdown}</ReactMarkdown></section>
          <section className="limitations"><h3>한계와 주의사항</h3><ul>{selected.limitations.map((item) => <li key={item}>{item}</li>)}</ul></section>
        </article>
      </div>
      {pendingIds && preview.length > 0 && <CalibrationApplyDialog items={preview} onCancel={() => setPendingIds(undefined)} onConfirm={confirmApply} />}
    </main>
  );
}
