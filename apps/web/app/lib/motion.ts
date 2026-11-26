import { useEffect, useRef, useState } from "react";

/** True when the reader has asked their device to reduce motion. False on the server. */
export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(mq.matches);
    const on = () => setReduce(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduce;
}

/**
 * Auto-advancing content (WCAG 2.2.2): calls `tick` every `delay` ms while running. It holds
 * while the pointer is over the region, while keyboard focus is inside it, while the tab is
 * hidden, when the reader has paused it, and always for people who prefer reduced motion.
 * Spread `bind` on the region's element; show `paused`/`toggle` as a pause button.
 */
export function useAutoAdvance(tick: () => void, delay: number, opts: { enabled?: boolean; restartKey?: unknown } = {}) {
  const reduce = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const [hold, setHold] = useState({ hover: false, focus: false });
  const [visible, setVisible] = useState(true);
  const fn = useRef(tick);
  fn.current = tick;

  useEffect(() => {
    const on = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);

  const running = (opts.enabled ?? true) && !reduce && !paused && !hold.hover && !hold.focus && visible;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => fn.current(), delay);
    return () => clearInterval(t);
    // restartKey: a manual change (e.g. clicking a slide) restarts the countdown.
  }, [running, delay, opts.restartKey]);

  const bind = {
    onPointerEnter: () => setHold((h) => ({ ...h, hover: true })),
    onPointerLeave: () => setHold((h) => ({ ...h, hover: false })),
    onFocus: () => setHold((h) => ({ ...h, focus: true })),
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHold((h) => ({ ...h, focus: false }));
    },
  };
  return { bind, paused, toggle: () => setPaused((p) => !p), reduce };
}

/** A small round pause/play button for auto-moving regions. */
export const pauseIcon = (paused: boolean) =>
  paused ? "M8 5v14l11-7z" : "M7 5h3.5v14H7zM13.5 5H17v14h-3.5z";
