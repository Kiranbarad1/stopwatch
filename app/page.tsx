"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const KEY = "study-stopwatch-v1";
type State = { running: boolean; startedAt: number; acc: number };
const pad = (n: number) => (n < 10 ? "0" + n : "" + n);

export default function Page() {
  const [st, setSt] = useState<State>({ running: false, startedAt: 0, acc: 0 });
  const [now, setNow] = useState(0);
  const [ready, setReady] = useState(false);
  const lock = useRef<any>(null);

  // load saved state
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p && typeof p.acc === "number") setSt(p);
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

  useEffect(() => {
    if (st.running) wake(); else release();
  }, [st.running, wake, release]);

  useEffect(() => {
    const onVis = () => { if (!document.hidden) { setNow(Date.now()); if (st.running) wake(); } };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [st.running, wake]);

  const elapsed = st.acc + (st.running ? Math.max(0, now - st.startedAt) : 0);
  const t = Math.floor(elapsed / 1000);

  const toggle = () =>
    setSt((s) =>
      s.running
        ? { running: false, startedAt: 0, acc: s.acc + (Date.now() - s.startedAt) }
        : { ...s, running: true, startedAt: Date.now() }
    );

  const reset = () => {
    if (elapsed > 0 && !confirm("Reset to 00:00:00?")) return;
    setSt({ running: false, startedAt: 0, acc: 0 });
  };

  const fullscreen = () => {
    const el = document.documentElement as any;
    if (document.fullscreenElement) document.exitFullscreen();
    else (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
  };

  return (
    <div id="app">
      <div id="time" className={st.running ? "run" : ""} onClick={toggle}>
        <div className="unit"><span className="num">{pad(Math.floor(t / 3600))}</span><span className="lab">hours</span></div>
        <div className="unit"><span className="num">{pad(Math.floor((t % 3600) / 60))}</span><span className="lab">min</span></div>
        <div className="unit"><span className="num">{pad(t % 60)}</span><span className="lab">sec</span></div>
      </div>
      <div id="bar">
        <button onClick={reset}>Reset</button>
        <button className="go" onClick={toggle}>{st.running ? "Pause" : st.acc > 0 ? "Resume" : "Start"}</button>
        <button onClick={fullscreen}>Fullscreen</button>
      </div>
    </div>
  );
}
