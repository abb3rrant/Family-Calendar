import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

export type SseStatus = "connecting" | "connected" | "disconnected";

// Hide short blips (≤ this many ms) — EventSource auto-reconnects in ~3s
// and Pi 3B+ WiFi power-save flaps can cause brief drops. Only show the
// "Disconnected" banner if we stay down longer than this.
const DISCONNECT_GRACE_MS = 6000;

export function useServerEvents(): SseStatus {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SseStatus>("connecting");
  const downTimer = useRef<number | null>(null);

  useEffect(() => {
    const cancelDown = () => {
      if (downTimer.current !== null) {
        window.clearTimeout(downTimer.current);
        downTimer.current = null;
      }
    };
    const markConnected = () => {
      cancelDown();
      setStatus("connected");
    };

    const source = new EventSource("/api/stream");

    source.addEventListener("hello", markConnected);

    // Treat any successful message after a drop as proof we're back online
    source.addEventListener("ping", markConnected);

    source.addEventListener("update", (e) => {
      markConnected();
      const payload = (e as MessageEvent).data;
      if (payload === "events-updated") {
        queryClient.invalidateQueries({ queryKey: ["events"] });
      } else if (payload === "chores-updated") {
        queryClient.invalidateQueries({ queryKey: ["chores"] });
      } else if (payload === "meals-updated") {
        queryClient.invalidateQueries({ queryKey: ["meals"] });
      } else if (payload === "recipes-updated") {
        queryClient.invalidateQueries({ queryKey: ["recipes"] });
      } else if (payload === "grocery-updated") {
        queryClient.invalidateQueries({ queryKey: ["grocery"] });
      } else if (payload === "countdowns-updated") {
        queryClient.invalidateQueries({ queryKey: ["countdowns"] });
        queryClient.invalidateQueries({ queryKey: ["hero"] });
      } else if (payload === "notes-updated") {
        queryClient.invalidateQueries({ queryKey: ["notes"] });
      } else if (payload === "photos-updated") {
        queryClient.invalidateQueries({ queryKey: ["photos"] });
      } else if (payload === "allowance-updated") {
        queryClient.invalidateQueries({ queryKey: ["allowance-week"] });
        queryClient.invalidateQueries({ queryKey: ["allowance-people"] });
        queryClient.invalidateQueries({ queryKey: ["allowance-chores"] });
      } else if (payload === "settings-updated") {
        queryClient.invalidateQueries({ queryKey: ["accounts"] });
        queryClient.invalidateQueries({ queryKey: ["calendar-profiles"] });
        queryClient.invalidateQueries({ queryKey: ["calendars"] });
        queryClient.invalidateQueries({ queryKey: ["general-settings"] });
        queryClient.invalidateQueries({ queryKey: ["birthdays"] });
        queryClient.invalidateQueries({ queryKey: ["events"] });
      }
    });

    source.onerror = () => {
      // EventSource auto-reconnects (~3s on Chromium). Pi 3B+ WiFi
      // power-save blips can drop the stream for 1-3s and recover
      // silently — only surface the banner if we actually stay down.
      if (downTimer.current !== null) return;
      downTimer.current = window.setTimeout(() => {
        setStatus("disconnected");
        downTimer.current = null;
      }, DISCONNECT_GRACE_MS);
    };

    source.onopen = markConnected;

    return () => {
      cancelDown();
      source.close();
    };
  }, [queryClient]);

  return status;
}
