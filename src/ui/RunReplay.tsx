import { useEffect, useMemo, useRef, useState } from "react";
import type { PrStatus, SimEvent } from "../sim/model";

const COLORS: Record<PrStatus, string> = {
  scheduled: "#26312f", waiting: "#8b9691", ciWaiting: "#d9a441", ciRunning: "#45b9ff",
  investigating: "#ffb44a", suspected: "#ff735c", merged: "#4ed49d", quarantined: "#8b5cf6",
};

function ReplayCanvas({ count, states }: { count: number; states: Map<string, PrStatus> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * ratio; canvas.height = height * ratio;
    const context = canvas.getContext("2d")!;
    context.scale(ratio, ratio); context.clearRect(0, 0, width, height);
    const columns = Math.ceil(Math.sqrt(count * (width / height)));
    const rows = Math.ceil(count / columns);
    const cell = Math.min(width / columns, height / rows);
    for (let index = 0; index < count; index += 1) {
      const status = states.get(`pr-${index + 1}`) ?? "scheduled";
      const x = (index % columns) * cell + cell / 2;
      const y = Math.floor(index / columns) * cell + cell / 2;
      context.beginPath(); context.fillStyle = COLORS[status];
      context.arc(x, y, Math.max(2, cell * 0.28), 0, Math.PI * 2); context.fill();
    }
  }, [count, states]);
  return <canvas ref={ref} className="replay-canvas" aria-label={`${count}개 PR 상태 시각화`} />;
}

export function RunReplay({ events, totalPrs, loading, onClose }: { events: SimEvent[]; totalPrs: number; loading: boolean; onClose: () => void }) {
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);
  useEffect(() => {
    if (!playing || !events.length) return;
    const timer = window.setInterval(() => setCursor((value) => {
      const next = Math.min(events.length, value + Math.max(1, speed * 2));
      if (next >= events.length) setPlaying(false);
      return next;
    }), 50);
    return () => window.clearInterval(timer);
  }, [playing, speed, events.length]);

  const states = useMemo(() => {
    const map = new Map<string, PrStatus>();
    for (let index = 0; index < cursor; index += 1) {
      const event = events[index];
      if (event.type === "prArrived") for (const id of event.prIds ?? []) map.set(id, "waiting");
      if (event.type === "prStateChanged" && event.to) for (const id of event.prIds ?? []) map.set(id, event.to);
    }
    return map;
  }, [events, cursor]);
  const counts = Object.keys(COLORS).map((status) => [status, [...states.values()].filter((value) => value === status).length] as const);
  const currentTime = cursor ? events[Math.min(cursor - 1, events.length - 1)]?.time ?? 0 : 0;

  return (
    <div className="replay-overlay" role="dialog" aria-modal="true" aria-label="실행 재생">
      <div className="replay-shell">
        <header><div><span className="eyebrow">DETERMINISTIC REPLAY</span><h2>PR 상태 타임라인</h2></div><button className="close-button" onClick={onClose}>닫기 ×</button></header>
        <div className="replay-meta"><strong>T+ {currentTime.toFixed(0)}분</strong><span>{cursor.toLocaleString()} / {events.length.toLocaleString()} events {loading && "· 수신 중"}</span></div>
        <ReplayCanvas count={totalPrs} states={states} />
        <div className="legend">{counts.filter(([, count]) => count > 0).map(([status, count]) => <span key={status}><i style={{ background: COLORS[status as PrStatus] }} />{status} {count}</span>)}</div>
        <input className="timeline" aria-label="재생 위치" type="range" min={0} max={Math.max(1, events.length)} value={cursor} onChange={(event) => { setPlaying(false); setCursor(Number(event.target.value)); }} />
        <div className="playback-controls">
          <button onClick={() => setCursor(0)}>처음</button>
          <button className="play" onClick={() => setPlaying((value) => !value)}>{playing ? "일시정지" : "재생"}</button>
          {[0.25, 1, 4, 16].map((value) => <button className={speed === value ? "active" : ""} key={value} onClick={() => setSpeed(value)}>{value}×</button>)}
          <button onClick={() => setCursor(events.length)}>즉시 완료</button>
        </div>
      </div>
    </div>
  );
}
