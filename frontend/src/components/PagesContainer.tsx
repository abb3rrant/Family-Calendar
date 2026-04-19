import { Children, useEffect, useRef, useState, type ReactNode } from "react";


const SWIPE_THRESHOLD = 80; // px before a flip commits
const HORIZONTAL_DOMINANCE = 1.6; // |dx| must exceed |dy| * this to count
const VELOCITY_FAST_PX_PER_MS = 0.6; // a fast flick can commit below threshold
const VELOCITY_FAST_MIN_PX = 30; // but must still travel at least this far

interface Props {
  index: number;
  onChange: (i: number) => void;
  labels?: string[];
  children: ReactNode;
}

export function PagesContainer({ index, onChange, labels, children }: Props) {
  const pages = Children.toArray(children);
  const count = pages.length;

  const trackRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{
    startX: number;
    startY: number;
    startTime: number;
    dx: number;
    active: boolean;
  } | null>(null);
  const [dragOffset, setDragOffset] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.matches?.("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowLeft" && index > 0) onChange(index - 1);
      else if (e.key === "ArrowRight" && index < count - 1) onChange(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, count, onChange]);

  const isInteractive = (el: EventTarget | null): boolean => {
    if (!(el instanceof Element)) return false;
    return !!el.closest(
      "input, textarea, select, button, a, [contenteditable], .fc-timegrid, .fc-daygrid-body, .osk-root"
    );
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (isInteractive(e.target)) return;
    drag.current = {
      startX: e.clientX,
      startY: e.clientY,
      startTime: performance.now(),
      dx: 0,
      active: false,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;
    if (!drag.current.active) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dx) < Math.abs(dy) * HORIZONTAL_DOMINANCE) {
        drag.current = null;
        setDragOffset(0);
        return;
      }
      drag.current.active = true;
    }
    drag.current.dx = dx;
    // Resist at edges
    const edgeResist =
      (index === 0 && dx > 0) || (index === count - 1 && dx < 0) ? 0.3 : 1;
    setDragOffset(dx * edgeResist);
  };

  const onPointerUp = () => {
    if (!drag.current) return;
    const { dx, active, startTime } = drag.current;
    drag.current = null;
    if (active) {
      const elapsed = Math.max(1, performance.now() - startTime);
      const velocity = Math.abs(dx) / elapsed; // px/ms
      const flickedFastEnough =
        velocity >= VELOCITY_FAST_PX_PER_MS && Math.abs(dx) >= VELOCITY_FAST_MIN_PX;
      const passedThreshold = Math.abs(dx) >= SWIPE_THRESHOLD;
      if (passedThreshold || flickedFastEnough) {
        if (dx < 0 && index < count - 1) onChange(index + 1);
        else if (dx > 0 && index > 0) onChange(index - 1);
      }
    }
    setDragOffset(0);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {count > 1 && labels && (
        <div className="flex items-center justify-center gap-4 mb-3 select-none">
          <button
            onClick={() => index > 0 && onChange(index - 1)}
            disabled={index === 0}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-30"
            aria-label="Previous page"
          >
            ‹
          </button>
          <div className="flex items-center gap-2">
            {labels.map((label, i) => (
              <button
                key={label}
                onClick={() => onChange(i)}
                className={`text-sm font-medium px-3 py-1 rounded-lg transition ${
                  i === index
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => index < count - 1 && onChange(index + 1)}
            disabled={index === count - 1}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-30"
            aria-label="Next page"
          >
            ›
          </button>
        </div>
      )}
      <div
        ref={trackRef}
        className="relative flex-1 min-h-0 overflow-hidden touch-pan-y"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className="absolute inset-0 flex h-full"
          style={{
            width: `${count * 100}%`,
            transform: `translateX(calc(${-(index * 100) / count}% + ${dragOffset}px))`,
            transition: dragOffset === 0 ? "transform 220ms ease" : "none",
          }}
        >
          {pages.map((child, i) => (
            <div
              key={i}
              className="h-full"
              style={{ width: `${100 / count}%` }}
              aria-hidden={i !== index}
            >
              {child}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
