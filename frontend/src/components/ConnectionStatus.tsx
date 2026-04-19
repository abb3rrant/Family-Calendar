import type { SseStatus } from "../lib/sse";

export function ConnectionStatus({ status }: { status: SseStatus }) {
  if (status === "connected") return null;
  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
      <div className="rounded-full bg-amber-500/90 text-white text-xs px-3 py-1.5 shadow-lg flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
        {status === "connecting"
          ? "Connecting to backend…"
          : "Disconnected — reconnecting"}
      </div>
    </div>
  );
}
