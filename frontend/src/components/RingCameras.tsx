import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { RingCamera } from "../types";

const TILE_REFRESH_MS = 30_000;
const LIVE_REFRESH_MS = 2_000;

export function RingCameras() {
  const {
    data: cameras = [],
    isLoading,
    isError,
    error,
  } = useQuery<RingCamera[]>({
    queryKey: ["ring-cameras"],
    queryFn: api.listRingCameras,
    retry: false,
    refetchInterval: 5 * 60_000,
  });

  const [openCamera, setOpenCamera] = useState<RingCamera | null>(null);

  if (isError) {
    const msg = (error as Error).message;
    if (msg.includes("not connected")) return null;
    return (
      <section className="rounded-2xl bg-[var(--card)] p-5">
        <h3 className="text-sm font-semibold text-[var(--text-soft)] mb-2">
          Cameras
        </h3>
        <div className="text-xs text-[var(--danger)]">{msg}</div>
      </section>
    );
  }

  if (isLoading) {
    return (
      <section className="rounded-2xl bg-[var(--card)] p-5">
        <h3 className="text-sm font-semibold text-[var(--text-soft)] mb-2">
          Cameras
        </h3>
        <div className="text-xs text-[var(--text-muted)]">Loading cameras…</div>
      </section>
    );
  }

  if (cameras.length === 0) return null;

  return (
    <>
      <section className="rounded-2xl bg-[var(--card)] p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-[var(--text-soft)]">
            Cameras
          </h3>
          <span className="text-xs text-[var(--text-muted)]">
            {cameras.length} device{cameras.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {cameras.map((cam) => (
            <CameraTile
              key={cam.id}
              camera={cam}
              onOpen={() => setOpenCamera(cam)}
            />
          ))}
        </div>
      </section>
      {openCamera && (
        <LiveModal
          camera={openCamera}
          onClose={() => setOpenCamera(null)}
        />
      )}
    </>
  );
}

function CameraTile({
  camera,
  onOpen,
}: {
  camera: RingCamera;
  onOpen: () => void;
}) {
  const [bust, setBust] = useState(() => Date.now());
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      setBust(Date.now());
      setErrored(false);
    }, TILE_REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <button
      onClick={onOpen}
      className="rounded-xl overflow-hidden bg-black aspect-video relative group focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
    >
      {!errored ? (
        <img
          src={api.ringSnapshotUrl(camera.id, bust)}
          alt={camera.name}
          className="w-full h-full object-cover"
          onError={() => setErrored(true)}
          draggable={false}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)] text-xs">
          Snapshot unavailable
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 flex items-end justify-between">
        <div>
          <div className="text-sm text-white font-medium drop-shadow">
            {camera.name}
          </div>
          {camera.battery_life !== null && (
            <div className="text-[10px] text-white/70 uppercase tracking-wide">
              🔋 {camera.battery_life}%
            </div>
          )}
        </div>
        <div className="text-xs text-white/80 group-hover:text-white">▶ Live</div>
      </div>
    </button>
  );
}

function LiveModal({
  camera,
  onClose,
}: {
  camera: RingCamera;
  onClose: () => void;
}) {
  const [bust, setBust] = useState(() => Date.now());
  const [errored, setErrored] = useState(false);
  const [paused, setPaused] = useState(false);
  const lastUpdate = useRef(Date.now());

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      setBust(Date.now());
      setErrored(false);
      lastUpdate.current = Date.now();
    }, LIVE_REFRESH_MS);
    return () => clearInterval(id);
  }, [paused]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 bg-black z-50 flex flex-col"
      onClick={onClose}
    >
      <div
        className="absolute top-4 left-4 right-4 flex items-center justify-between z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-black/60 backdrop-blur rounded-full px-4 py-2 text-white text-sm">
          <span className="font-medium">{camera.name}</span>
          <span className="ml-3 text-white/60 text-xs">
            {paused ? "Paused" : "Live · refreshing every 2s"}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setPaused((p) => !p)}
            className="bg-black/60 backdrop-blur rounded-full px-4 py-2 text-white text-sm"
          >
            {paused ? "▶ Resume" : "⏸ Pause"}
          </button>
          <button
            onClick={onClose}
            className="bg-black/60 backdrop-blur rounded-full w-10 h-10 text-white text-lg flex items-center justify-center"
            aria-label="Close"
          >
            ×
          </button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center">
        {!errored ? (
          <img
            src={api.ringSnapshotUrl(camera.id, bust)}
            alt={camera.name}
            className="max-w-full max-h-full object-contain"
            onError={() => setErrored(true)}
            draggable={false}
          />
        ) : (
          <div className="text-white/60 text-center p-8">
            <div className="text-4xl mb-2">📷</div>
            Camera not responding. {camera.family.includes("stickup")
              ? "Battery cameras need motion to wake — Ring may need a moment."
              : "Try again in a few seconds."}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
