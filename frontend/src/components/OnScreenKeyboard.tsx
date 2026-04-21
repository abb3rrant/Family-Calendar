import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import Keyboard from "react-simple-keyboard";
import "react-simple-keyboard/build/css/index.css";
import { api } from "../api";
import type { GeneralSettings } from "../types";

type Target = HTMLInputElement | HTMLTextAreaElement;
type LayoutKind = "qwerty" | "numeric";
type Mode = "default" | "shift" | "symbols";

const TEXT_INPUT_TYPES = new Set([
  "text",
  "search",
  "email",
  "tel",
  "url",
  "password",
]);

const NUMERIC_INPUT_TYPES = new Set(["number"]);

function isTextTarget(el: EventTarget | null): el is Target {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) {
    const t = (el.type || "text").toLowerCase();
    return TEXT_INPUT_TYPES.has(t) || NUMERIC_INPUT_TYPES.has(t);
  }
  return false;
}

function detectLayout(el: Target): LayoutKind {
  if (el instanceof HTMLInputElement) {
    if (NUMERIC_INPUT_TYPES.has((el.type || "").toLowerCase())) return "numeric";
  }
  const inputMode = el.getAttribute("inputmode");
  if (inputMode === "numeric" || inputMode === "decimal" || inputMode === "tel") {
    return "numeric";
  }
  return "qwerty";
}

const nativeInputSetter = Object.getOwnPropertyDescriptor(
  HTMLInputElement.prototype,
  "value"
)?.set;
const nativeTextareaSetter = Object.getOwnPropertyDescriptor(
  HTMLTextAreaElement.prototype,
  "value"
)?.set;

function setReactValue(el: Target, value: string) {
  const setter =
    el instanceof HTMLTextAreaElement ? nativeTextareaSetter : nativeInputSetter;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function insertAt(el: Target, insertion: string, replaceRangeChars = 0) {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? start;
  const before = el.value.slice(0, Math.max(0, start - replaceRangeChars));
  const after = el.value.slice(end);
  const next = before + insertion + after;
  setReactValue(el, next);
  const pos = before.length + insertion.length;
  requestAnimationFrame(() => {
    try {
      el.setSelectionRange(pos, pos);
    } catch {
      /* number inputs don't support selection APIs */
    }
  });
}

const QWERTY_LAYOUTS = {
  default: [
    "1 2 3 4 5 6 7 8 9 0 {bksp}",
    "q w e r t y u i o p",
    "a s d f g h j k l {enter}",
    "{shift} z x c v b n m , . ?",
    "{symbols} {space} {close}",
  ],
  shift: [
    "! @ # $ % ^ & * ( ) {bksp}",
    "Q W E R T Y U I O P",
    "A S D F G H J K L {enter}",
    "{shift} Z X C V B N M ; : /",
    "{symbols} {space} {close}",
  ],
  symbols: [
    "1 2 3 4 5 6 7 8 9 0 {bksp}",
    "- _ = + [ ] { } \\ |",
    "; : ' \" , . < > / {enter}",
    "{shift} ! @ # $ % ^ & * ?",
    "{symbols} {space} {close}",
  ],
};

const NUMERIC_LAYOUT = {
  default: ["1 2 3", "4 5 6", "7 8 9", ". 0 {bksp}", "{close} {enter}"],
};

const DISPLAY: Record<string, string> = {
  "{bksp}": "⌫",
  "{enter}": "return",
  "{shift}": "⇧",
  "{space}": " ",
  "{symbols}": "#+=",
  "{close}": "✕",
};

interface Props {
  forceEnable?: boolean;
}

export function OnScreenKeyboard({ forceEnable = false }: Props) {
  const [target, setTarget] = useState<Target | null>(null);
  const [layout, setLayout] = useState<LayoutKind>("qwerty");
  const [mode, setMode] = useState<Mode>("default");
  const blurTimer = useRef<number | null>(null);

  const { data: settings } = useQuery<GeneralSettings>({
    queryKey: ["general-settings"],
    queryFn: api.getGeneralSettings,
    staleTime: Infinity,
  });

  const enabled = useMemo(() => {
    if (forceEnable) return true;
    if (settings?.onscreen_keyboard_always) return true;
    if (typeof window === "undefined") return false;
    // Chromium on Raspberry Pi sometimes reports the primary pointer as
    // "fine" even when a touchscreen is active (if a mouse is also
    // connected, or when the kernel hid-multitouch driver registers the
    // device after Chromium starts). `any-pointer: coarse` matches if ANY
    // connected pointer is touch, which catches those cases. We also look
    // for ontouchstart as a final heuristic for older WebKit quirks.
    const mq = window.matchMedia;
    return (
      (mq && mq("(any-pointer: coarse)").matches) ||
      (mq && mq("(pointer: coarse)").matches) ||
      "ontouchstart" in window
    );
  }, [forceEnable, settings?.onscreen_keyboard_always]);

  useEffect(() => {
    if (!enabled) return;

    const onFocusIn = (e: FocusEvent) => {
      if (blurTimer.current) {
        window.clearTimeout(blurTimer.current);
        blurTimer.current = null;
      }
      const el = e.target;
      if (isTextTarget(el)) {
        setTarget(el);
        setLayout(detectLayout(el));
        setMode("default");
      } else if (!(el instanceof HTMLElement && el.closest(".osk-root"))) {
        setTarget(null);
      }
    };

    const onFocusOut = () => {
      if (blurTimer.current) window.clearTimeout(blurTimer.current);
      blurTimer.current = window.setTimeout(() => {
        const active = document.activeElement;
        if (!isTextTarget(active) && !(active instanceof HTMLElement && active.closest(".osk-root"))) {
          setTarget(null);
        }
      }, 120);
    };

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, [enabled]);

  useEffect(() => {
    if (target) {
      document.body.classList.add("osk-open");
      requestAnimationFrame(() => {
        try {
          target.scrollIntoView({ block: "center", behavior: "smooth" });
        } catch {
          /* ignore */
        }
      });
    } else {
      document.body.classList.remove("osk-open");
    }
    return () => document.body.classList.remove("osk-open");
  }, [target]);

  const handlePress = useCallback(
    (button: string) => {
      if (!target) return;
      if (document.activeElement !== target) target.focus();

      switch (button) {
        case "{close}":
          target.blur();
          setTarget(null);
          return;
        case "{bksp}":
          insertAt(target, "", 1);
          return;
        case "{enter}": {
          if (target instanceof HTMLTextAreaElement) {
            insertAt(target, "\n");
          } else if (target.form) {
            target.form.requestSubmit();
          }
          return;
        }
        case "{space}":
          insertAt(target, " ");
          return;
        case "{shift}":
          setMode((m) => (m === "shift" ? "default" : "shift"));
          return;
        case "{symbols}":
          setMode((m) => (m === "symbols" ? "default" : "symbols"));
          return;
        default:
          insertAt(target, button);
          if (mode === "shift") setMode("default");
      }
    },
    [target, mode]
  );

  if (!enabled || !target) return null;

  const kbLayout = layout === "numeric" ? NUMERIC_LAYOUT : QWERTY_LAYOUTS;
  const layoutName = layout === "numeric" ? "default" : mode;

  return createPortal(
    <div className="osk-root fixed inset-x-0 bottom-0 z-[60] pointer-events-none">
      <div
        onMouseDown={(e) => e.preventDefault()}
        onTouchStart={(e) => e.preventDefault()}
        className="pointer-events-auto mx-auto max-w-3xl p-3 bg-[var(--surface)] border-t border-[var(--border)] shadow-[var(--shadow)] rounded-t-2xl animate-[oskSlideUp_180ms_ease-out]"
      >
        <Keyboard
          layoutName={layoutName}
          layout={kbLayout as Record<string, string[]>}
          display={DISPLAY}
          theme="hg-theme-default osk-theme"
          preventMouseDownDefault
          stopMouseDownPropagation
          onKeyPress={handlePress}
        />
      </div>
    </div>,
    document.body
  );
}
