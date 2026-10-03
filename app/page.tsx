"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const KEY = "study-stopwatch-v1";
type Mode = "up" | "down";
type State = { running: boolean; startedAt: number; acc: number; mode: Mode; target: number };
const DEFAULT: State = { running: false, startedAt: 0, acc: 0, mode: "up", target: 2 * 3600000 };
const PRESETS = [30, 60, 120, 180]; // minutes
const pad = (n: number) => (n < 10 ? "0" + n : "" + n);

function alarm() {
  try { navigator.vibrate?.([400, 200, 400, 200, 400]); } catch {}
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    const c = new AC();
    [0, 0.4, 0.8].forEach((d) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.connect(g); g.connect(c.destination);
      o.frequency.value = 880; g.gain.value = 0.2;
      o.start(c.currentTime + d); o.stop(c.currentTime + d + 0.25);
    });
  } catch {}
}

export default function Page() {
  const [st, setSt] = useState<State>(DEFAULT);
  const [now, setNow] = useState(0);
  const [ready, setReady] = useState(false);
  const lock = useRef<any>(null);

  // load saved state
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p && typeof p.acc === "number") setSt({ ...DEFAULT, ...p });
      }
    } catch {}
    setNow(Date.now());
    setReady(true);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  // persist
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {}
  }, [st, ready]);

  // tick
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  // countdown finished -> stop at 0 and alert
  useEffect(() => {
    if (!ready || !st.running || st.mode !== "down") return;
    if (st.acc + Math.max(0, now - st.startedAt) >= st.target) {
      setSt((s) => ({ ...s, running: false, startedAt: 0, acc: s.target }));
      alarm();
    }
  }, [now, st, ready]);

  // keep screen awake while running
  const wake = useCallback(async () => {
    try {
      const nav = navigator as any;
      if ("wakeLock" in nav && !lock.current) {
        lock.current = await nav.wakeLock.request("screen");
        lock.current.addEventListener("release", () => { lock.current = null; });
      }
    } catch {}
  }, []);
  const release = useCallback(() => {
    try { lock.current?.release(); } catch {}
    lock.current = null;
  }, []);
  useEffect(() => { if (st.running) wake(); else release(); }, [st.running, wake, release]);
  useEffect(() => {
    const onVis = () => { if (!document.hidden) { setNow(Date.now()); if (st.running) wake(); } };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [st.running, wake]);

  const isDown = st.mode === "down";
  const elapsed = st.acc + (st.running ? Math.max(0, now - st.startedAt) : 0);
  const done = isDown && elapsed >= st.target;
  const t = isDown ? Math.ceil(Math.max(0, st.target - elapsed) / 1000) : Math.floor(elapsed / 1000);
  const fresh = !st.running && st.acc === 0;

  const toggle = () =>
    setSt((s) => {
      if (s.running) return { ...s, running: false, startedAt: 0, acc: s.acc + (Date.now() - s.startedAt) };
      if (s.mode === "down" && s.acc >= s.target) return { ...s, running: true, startedAt: Date.now(), acc: 0 }; // restart
      return { ...s, running: true, startedAt: Date.now() };
    });

  const reset = () => {
    if (elapsed > 0 && !done && !confirm("Reset?")) return;
    setSt((s) => ({ ...s, running: false, startedAt: 0, acc: 0 }));
  };

  const setMode = (mode: Mode) => setSt((s) => ({ ...s, mode }));
  const setTarget = (min: number) => setSt((s) => ({ ...s, target: Math.min(24 * 60, Math.max(1, min)) * 60000 }));
  const targetMin = Math.round(st.target / 60000);

  const fullscreen = () => {
    const el = document.documentElement as any;
    if (document.fullscreenElement) document.exitFullscreen();
    else (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
  };

  return (
    <div id="app" className={st.running ? "running" : ""}>
      <div id="time" className={st.running ? "run" : done ? "done" : ""}>
        <div className="unit"><span className="num">{pad(Math.floor(t / 3600))}</span><span className="lab">hours</span></div>
        <div className="unit"><span className="num">{pad(Math.floor((t % 3600) / 60))}</span><span className="lab">min</span></div>
        <div className="unit"><span className="num">{pad(t % 60)}</span><span className="lab">sec</span></div>
      </div>

      {st.running ? (
        <button className="pause" onClick={toggle} aria-label="Pause">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="#fff"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
        </button>
      ) : (
        <div id="panel">
          {done && <div className="note">Time&apos;s up! 🎉</div>}
          {fresh && (
            <div className="tabs">
              <button className={!isDown ? "on" : ""} onClick={() => setMode("up")}>Stopwatch</button>
              <button className={isDown ? "on" : ""} onClick={() => setMode("down")}>Countdown</button>
            </div>
          )}
          {fresh && isDown && (
            <div className="chips">
              <button onClick={() => setTarget(targetMin - 10)}>−10m</button>
              {PRESETS.map((m) => (
                <button key={m} className={targetMin === m ? "on" : ""} onClick={() => setTarget(m)}>
                  {m >= 60 ? m / 60 + "h" : m + "m"}
                </button>
              ))}
              <button onClick={() => setTarget(targetMin + 10)}>+10m</button>
            </div>
          )}
          <div id="bar">
            <button onClick={reset}>Reset</button>
            <button className="go" onClick={toggle}>{done ? "Restart" : st.acc > 0 ? "Resume" : "Start"}</button>
            <button onClick={fullscreen}>Fullscreen</button>
          </div>
        </div>
      )}
    </div>
  );
}