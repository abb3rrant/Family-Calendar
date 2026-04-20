import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

export type SseStatus = "connecting" | "connected" | "disconnected";

export function useServerEvents(): SseStatus {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SseStatus>("connecting");

  useEffect(() => {
    const source = new EventSource("/api/stream");

    source.addEventListener("hello", () => setStatus("connected"));

    // Treat any successful message after a drop as proof we're back online
    source.addEventListener("ping", () => setStatus("connected"));

    source.addEventListener("update", (e) => {
      setStatus("connected");
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
      // EventSource auto-reconnects (~3s) on most browsers; surface the
      // disconnected state so the UI can show a small reconnecting badge.
      setStatus("disconnected");
    };

    source.onopen = () => setStatus("connected");

    return () => source.close();
  }, [queryClient]);

  return status;
}
