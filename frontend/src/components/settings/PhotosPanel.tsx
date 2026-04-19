import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import type { GeneralSettings, Photo } from "../../types";

const ACCEPT_TYPES = "image/jpeg,image/jpg,image/png,image/webp,image/heic";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function PhotosPanel() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery<GeneralSettings>({
    queryKey: ["general-settings"],
    queryFn: api.getGeneralSettings,
  });
  const { data: photos = [] } = useQuery<Photo[]>({
    queryKey: ["photos"],
    queryFn: api.listPhotos,
  });

  const [draft, setDraft] = useState<GeneralSettings | null>(null);
  useEffect(() => {
    if (settings && !draft) setDraft(settings);
  }, [settings, draft]);

  const saveMut = useMutation({
    mutationFn: (patch: Partial<GeneralSettings>) => api.updateGeneralSettings(patch),
    onSuccess: (next) => {
      queryClient.setQueryData(["general-settings"], next);
      setDraft(next);
    },
  });

  if (!draft) return <div className="text-[var(--text-muted)]">Loading…</div>;

  const update = (patch: Partial<GeneralSettings>) => {
    setDraft({ ...draft, ...patch });
    saveMut.mutate(patch);
  };

  return (
    <div className="space-y-5">
      <section className="rounded-xl bg-[var(--card)] p-4 space-y-4">
        <h3 className="font-medium text-[var(--text)]">Slideshow</h3>

        <label className="flex items-center justify-between text-sm text-[var(--text)]">
          <span>Show photos when the dashboard is idle</span>
          <input
            type="checkbox"
            checked={draft.slideshow_enabled}
            onChange={(e) => update({ slideshow_enabled: e.target.checked })}
          />
        </label>

        <div>
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
            <span>Idle before starting</span>
            <span>
              {draft.slideshow_idle_minutes} min
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={60}
            step={1}
            value={draft.slideshow_idle_minutes}
            onChange={(e) =>
              setDraft({ ...draft, slideshow_idle_minutes: parseInt(e.target.value, 10) })
            }
            onMouseUp={() =>
              update({ slideshow_idle_minutes: draft.slideshow_idle_minutes })
            }
            onTouchEnd={() =>
              update({ slideshow_idle_minutes: draft.slideshow_idle_minutes })
            }
            className="w-full"
            disabled={!draft.slideshow_enabled}
          />
        </div>

        <div>
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
            <span>Seconds per photo</span>
            <span>{draft.slideshow_per_photo_seconds}s</span>
          </div>
          <input
            type="range"
            min={3}
            max={30}
            step={1}
            value={draft.slideshow_per_photo_seconds}
            onChange={(e) =>
              setDraft({
                ...draft,
                slideshow_per_photo_seconds: parseInt(e.target.value, 10),
              })
            }
            onMouseUp={() =>
              update({ slideshow_per_photo_seconds: draft.slideshow_per_photo_seconds })
            }
            onTouchEnd={() =>
              update({ slideshow_per_photo_seconds: draft.slideshow_per_photo_seconds })
            }
            className="w-full"
            disabled={!draft.slideshow_enabled}
          />
        </div>

        <div className="border-t border-[var(--border)] pt-3">
          <div className="text-xs text-[var(--text-muted)] mb-2">
            Periodically peek at the dashboard between photos.
          </div>
          <div>
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
              <span>Show dashboard every</span>
              <span>
                {draft.slideshow_calendar_every_n === 0
                  ? "Never"
                  : `${draft.slideshow_calendar_every_n} photo${draft.slideshow_calendar_every_n === 1 ? "" : "s"}`}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={20}
              step={1}
              value={draft.slideshow_calendar_every_n}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  slideshow_calendar_every_n: parseInt(e.target.value, 10),
                })
              }
              onMouseUp={() =>
                update({
                  slideshow_calendar_every_n: draft.slideshow_calendar_every_n,
                })
              }
              onTouchEnd={() =>
                update({
                  slideshow_calendar_every_n: draft.slideshow_calendar_every_n,
                })
              }
              className="w-full"
              disabled={!draft.slideshow_enabled}
            />
          </div>
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
              <span>Dashboard peek duration</span>
              <span>{draft.slideshow_calendar_seconds}s</span>
            </div>
            <input
              type="range"
              min={5}
              max={60}
              step={1}
              value={draft.slideshow_calendar_seconds}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  slideshow_calendar_seconds: parseInt(e.target.value, 10),
                })
              }
              onMouseUp={() =>
                update({
                  slideshow_calendar_seconds: draft.slideshow_calendar_seconds,
                })
              }
              onTouchEnd={() =>
                update({
                  slideshow_calendar_seconds: draft.slideshow_calendar_seconds,
                })
              }
              className="w-full"
              disabled={
                !draft.slideshow_enabled || draft.slideshow_calendar_every_n === 0
              }
            />
          </div>
        </div>
      </section>

      <PhotoUploader photos={photos} />
    </div>
  );
}

function PhotoUploader({ photos }: { photos: Photo[] }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadMut = useMutation({
    mutationFn: (files: File[]) => api.uploadPhotos(files),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["photos"] }),
    onError: (e) => setError((e as Error).message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.deletePhoto(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["photos"] }),
  });

  const acceptFiles = (list: FileList | File[]) => {
    setError(null);
    const arr = Array.from(list);
    if (arr.length === 0) return;
    uploadMut.mutate(arr);
  };

  return (
    <section className="rounded-xl bg-[var(--card)] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-[var(--text)]">Photos</h3>
        <span className="text-xs text-[var(--text-muted)]">
          {photos.length} stored
        </span>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) acceptFiles(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition ${
          dragOver
            ? "border-[var(--accent)] bg-[var(--accent-soft)]"
            : "border-[var(--border)] hover:border-[var(--accent)]/60"
        }`}
      >
        <div className="text-3xl mb-2">📸</div>
        <div className="text-sm text-[var(--text)]">
          {uploadMut.isPending
            ? "Uploading…"
            : "Drop photos here or click to choose"}
        </div>
        <div className="text-xs text-[var(--text-muted)] mt-1">
          JPEG, PNG, WebP, HEIC · up to 25 MB each
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT_TYPES}
          onChange={(e) => {
            if (e.target.files) acceptFiles(e.target.files);
            e.target.value = "";
          }}
          className="hidden"
        />
      </div>

      {error && (
        <div className="text-[var(--danger)] text-xs">{error}</div>
      )}

      {photos.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-2">
          {photos.map((p) => (
            <div
              key={p.id}
              className="relative group aspect-square rounded-lg overflow-hidden bg-[var(--card-strong)]"
            >
              <img
                src={p.url}
                alt={p.original_name || ""}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              <button
                onClick={() => {
                  if (confirm("Delete this photo?")) deleteMut.mutate(p.id);
                }}
                className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition"
                aria-label="Delete photo"
              >
                ✕
              </button>
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-1 text-[10px] text-white truncate">
                {p.original_name || p.filename} · {formatBytes(p.size_bytes)}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
