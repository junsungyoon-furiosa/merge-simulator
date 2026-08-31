import { useEffect, useRef, useState } from "react";
import { DEFAULT_POLICIES, DEFAULT_SCENARIO, type ExperimentResult, type PolicyConfig, type RunResult, type ScenarioConfig, type SimEvent } from "../sim/model";
import { downloadText, fromJson, resultToCsv, toJson } from "../storage/export";
import { loadScenario, saveExperiment, saveScenario } from "../storage/database";
import { scenarioSchema } from "../storage/schema";
import { SimulationClient } from "../worker/client";
import { PolicyComparison } from "./PolicyComparison";
import { RunReplay } from "./RunReplay";
import { ScenarioEditor } from "./ScenarioEditor";

export function App() {
  const [scenario, setScenario] = useState<ScenarioConfig>(DEFAULT_SCENARIO);
  const [policies, setPolicies] = useState<PolicyConfig[]>(DEFAULT_POLICIES);
  const [result, setResult] = useState<ExperimentResult>();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 1 });
  const [message, setMessage] = useState("적절한 조건을 조정하고, 왼쪽 버튼으로 정책을 시뮬레이션 하세요");
  const [replayEvents, setReplayEvents] = useState<SimEvent[]>();
  const [replayLoading, setReplayLoading] = useState(false);
  const [lastReplay, setLastReplay] = useState<RunResult>();
  const client = useRef<SimulationClient | undefined>(undefined);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    client.current = new SimulationClient();
    loadScenario().then((stored) => { if (stored) { setScenario(stored.scenario); setPolicies(stored.policies); } }).catch(() => undefined);
    return () => client.current?.terminate();
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => saveScenario(scenario, policies).catch(() => undefined), 300); return () => window.clearTimeout(timer); }, [scenario, policies]);

  const run = async () => {
    const parsed = scenarioSchema.safeParse(scenario);
    if (!parsed.success) { setMessage(parsed.error.issues[0]?.message ?? "입력값을 확인하세요."); return; }
    setRunning(true); setResult(undefined); setProgress({ done: 0, total: scenario.repetitions * policies.length }); setMessage("숨겨진 PR 세계를 만들고 정책을 비교하고 있습니다.");
    try {
      const experiment = await client.current!.runExperiment(scenario, policies, { onProgress: (done, total) => setProgress({ done, total }) });
      setResult(experiment); await saveExperiment(experiment); setMessage("실험이 완료되었습니다. 정책을 선택해 개별 실행을 재생할 수 있습니다.");
    } catch (error) { setMessage(error instanceof Error && error.message === "cancelled" ? "실험을 중단했습니다." : "실험 중 오류가 발생했습니다."); }
    finally { setRunning(false); }
  };

  const replay = async (policyIndex: number) => {
    setReplayEvents([]); setReplayLoading(true);
    try {
      const replayResult = await client.current!.replay(scenario, policies[policyIndex], 0, { onEvents: (events) => setReplayEvents((current) => [...(current ?? []), ...events]) });
      setLastReplay(replayResult);
    } finally { setReplayLoading(false); }
  };

  const importFile = async (file: File) => {
    try { const imported = fromJson(await file.text()); setScenario(imported.scenario); setPolicies(imported.policies); setResult(imported.result); setMessage("실험 파일을 불러왔습니다."); }
    catch { setMessage("지원하지 않거나 손상된 실험 파일입니다."); }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><span /><span /><span /></div><div><b>MERGE SIMULATOR</b></div></div>
        <div className="top-actions">
          <button onClick={() => importRef.current?.click()}>불러오기</button>
          <input ref={importRef} hidden type="file" accept="application/json" onChange={(event) => event.target.files?.[0] && importFile(event.target.files[0])} />
          <button onClick={() => downloadText("merge-lab-scenario.json", toJson(scenario, policies, result, lastReplay), "application/json")}>JSON</button>
          <button disabled={!result} onClick={() => result && downloadText("merge-lab-results.csv", resultToCsv(result), "text/csv;charset=utf-8")}>CSV</button>
          <span className="local-badge">LOCAL ONLY</span>
        </div>
      </header>

      <main>
        <ScenarioEditor scenario={scenario} policies={policies} disabled={running} onScenario={setScenario} onPolicies={setPolicies} />
        <div className="workspace">
          <section className="hero">
            <h1><em>Merge Simulator</em><br/>머지 시뮬레이터</h1>
            <p>정책들이 PR을 검증하고 머지하는 과정을 시뮬레이션 합니다.</p>
            <div className="run-strip">
              <button className="run-button" disabled={running} onClick={run}>{running ? "시뮬레이션 실행 중" : "시뮬레이션 시작"}<span>→</span></button>
              {running && <button className="cancel-button" onClick={() => client.current?.cancel()}>중단</button>}
              <div className="progress-block"><div><span style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div><small>{message}</small></div>
            </div>
          </section>
          {running && <section className="running-state"><div className="orbit"><i /><i /><i /></div><strong>{progress.done} / {progress.total}</strong></section>}
          {result && <PolicyComparison result={result} onReplay={replay} />}
        </div>
      </main>
      <footer><span>브라우저 안에서만 계산되고 저장됩니다.</span><span>schema v1 · deterministic seed</span></footer>
      {replayEvents && <RunReplay events={replayEvents} totalPrs={scenario.prCount} loading={replayLoading} onClose={() => setReplayEvents(undefined)} />}
    </div>
  );
}
