import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type {
  GeneralSettings,
  HeroPayload,
  Photo,
  WeatherResponse,
} from "../types";

const WMO_ICON: Record<number, string> = {
  0: "☀️", 1: "🌤️", 2: "⛅", 3: "☁️",
  45: "🌫️", 48: "🌫️",
  51: "🌦️", 53: "🌦️", 55: "🌦️",
  61: "🌧️", 63: "🌧️", 65: "🌧️",
  71: "🌨️", 73: "🌨️", 75: "🌨️",
  77: "🌨️",
  80: "🌧️", 81: "🌧️", 82: "⛈️",
  85: "🌨️", 86: "🌨️",
  95: "⛈️", 96: "⛈️", 99: "⛈️",
};

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function PhotoSlideshow() {
  const { data: settings } = useQuery<GeneralSettings>({
    queryKey: ["general-settings"],
    queryFn: api.getGeneralSettings,
  });
  const { data: photos = [] } = useQuery<Photo[]>({
    queryKey: ["photos"],
    queryFn: api.listPhotos,
  });

  const enabled = !!settings?.slideshow_enabled;
  const idleMs = (settings?.slideshow_idle_minutes ?? 10) * 60_000;
  const perPhotoMs = (settings?.slideshow_per_photo_seconds ?? 8) * 1000;
  const calendarEveryN = settings?.slideshow_calendar_every_n ?? 5;
  const peekMs = (settings?.slideshow_calendar_seconds ?? 15) * 1000;

  const [active, setActive] = useState(false);

  // Idle detection
  useEffect(() => {
    if (!enabled || photos.length === 0) {
      setActive(false);
      return;
    }
    let timer: number | null = null;
    const reset = () => {
      if (active) setActive(false);
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => setActive(true), idleMs);
    };

    const events: (keyof DocumentEventMap)[] = [
      "pointerdown",
      "keydown",
      "touchstart",
      "wheel",
    ];
    for (const e of events) document.addEventListener(e, reset, { passive: true });
    reset();
    return () => {
      if (timer) window.clearTimeout(timer);
      for (const e of events) document.removeEventListener(e, reset);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, idleMs, photos.length]);

  if (!active || !enabled || photos.length === 0) return null;

  return createPortal(
    <SlideshowOverlay
      photos={photos}
      perPhotoMs={perPhotoMs}
      calendarEveryN={calendarEveryN}
      peekMs={peekMs}
      onDismiss={() => setActive(false)}
    />,
    document.body
  );
}

function SlideshowOverlay({
  photos,
  perPhotoMs,
  calendarEveryN,
  peekMs,
  onDismiss,
}: {
  photos: Photo[];
  perPhotoMs: number;
  calendarEveryN: number;
  peekMs: number;
  onDismiss: () => void;
}) {
  const order = useMemo(() => shuffle(photos), [photos]);
  const [idx, setIdx] = useState(0);
  // Two layers we cross-fade between
  const [topShown, setTopShown] = useState<"a" | "b">("a");
  const [aSrc, setASrc] = useState<string>(order[0]?.url ?? "");
  const [bSrc, setBSrc] = useState<string>("");
  const [phase, setPhase] = useState<"photo" | "peek">("photo");
  const photosShownRef = useRef(1); // we already showed the first photo on mount

  // If the user changes the peek frequency or per-photo time mid-show,
  // reset the photo counter so the next dwell uses the new value cleanly.
  useEffect(() => {
    photosShownRef.current = 1;
  }, [calendarEveryN, perPhotoMs, peekMs]);

  useEffect(() => {
    const dwell = phase === "photo" ? perPhotoMs : peekMs;
    const t = window.setTimeout(() => {
      if (phase === "peek") {
        // peek finished — pick a fresh photo and resume the rotation
        const next = (idx + 1) % order.length;
        const nextSrc = order[next].url;
        setASrc(nextSrc);
        setTopShown("a");
        setBSrc("");
        setIdx(next);
        photosShownRef.current = 1;
        setPhase("photo");
        return;
      }
      // we just finished showing a photo
      if (calendarEveryN > 0 && photosShownRef.current >= calendarEveryN) {
        setPhase("peek");
        return;
      }
      // advance to the next photo with a crossfade
      const next = (idx + 1) % order.length;
      const nextSrc = order[next].url;
      if (topShown === "a") {
        setBSrc(nextSrc);
        setTopShown("b");
      } else {
        setASrc(nextSrc);
        setTopShown("a");
      }
      setIdx(next);
      photosShownRef.current += 1;
    }, dwell);
    return () => window.clearTimeout(t);
  }, [phase, idx, order, perPhotoMs, peekMs, calendarEveryN, topShown]);

  if (phase === "peek") {
    return (
      <div
        onClick={onDismiss}
        onTouchStart={onDismiss}
        onKeyDown={onDismiss}
        className="fixed inset-0 z-[100] cursor-pointer"
        role="presentation"
      >
        <PeekHint seconds={Math.round(peekMs / 1000)} />
      </div>
    );
  }

  return (
    <div
      onClick={onDismiss}
      onTouchStart={onDismiss}
      onKeyDown={onDismiss}
      className="fixed inset-0 z-[100] bg-black overflow-hidden cursor-pointer"
      role="presentation"
    >
      <SlideLayer src={aSrc} visible={topShown === "a"} kenburnsKey={`a-${idx}`} />
      <SlideLayer src={bSrc} visible={topShown === "b"} kenburnsKey={`b-${idx}`} />
      {/* Subtle bottom gradient so the time/date stay readable on bright photos */}
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/60 via-black/20 to-transparent pointer-events-none" />
      <InfoOverlay />
    </div>
  );
}

function PeekHint({ seconds }: { seconds: number }) {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-md text-white text-xs px-3 py-1.5 rounded-full pointer-events-none animate-[fadeOut_2.5s_ease-in_forwards]">
      Returning to photos in {seconds}s · tap anywhere to keep the dashboard
    </div>
  );
}

function InfoOverlay() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const { data: weather } = useQuery<WeatherResponse>({
    queryKey: ["weather"],
    queryFn: api.getWeather,
  });
  const { data: hero } = useQuery<HeroPayload>({
    queryKey: ["hero"],
    queryFn: api.getHero,
    refetchInterval: 60_000,
  });

  const time = now.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const dateLong = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <>
      {/* Bottom-left: time + date, large, with text shadow for readability */}
      <div
        className="absolute bottom-8 left-8 text-white pointer-events-none select-none"
        style={{ textShadow: "0 2px 16px rgba(0,0,0,0.7)" }}
      >
        <div className="text-7xl md:text-8xl font-light tabular-nums leading-none">
          {time}
        </div>
        <div className="text-xl md:text-2xl mt-3 opacity-95">{dateLong}</div>
      </div>

      {/* Bottom-right: weather */}
      {weather && (
        <div
          className="absolute bottom-8 right-8 flex items-center gap-3 bg-black/35 backdrop-blur-md text-white rounded-2xl px-5 py-3 pointer-events-none"
          style={{ textShadow: "0 1px 8px rgba(0,0,0,0.5)" }}
        >
          <div className="text-5xl leading-none">
            {WMO_ICON[weather.current.weather_code] ?? "🌡️"}
          </div>
          <div>
            <div className="text-3xl font-semibold tabular-nums leading-none">
              {Math.round(weather.current.temperature_2m)}
              {weather.current_units?.temperature_2m ?? "°"}
            </div>
            <div className="text-xs opacity-80 mt-1">Right now</div>
          </div>
        </div>
      )}

      {/* Top-right: next event chip */}
      {hero?.next_event && (
        <div
          className="absolute top-8 right-8 max-w-md bg-black/40 backdrop-blur-md text-white rounded-2xl px-4 py-3 pointer-events-none"
          style={{ textShadow: "0 1px 8px rgba(0,0,0,0.5)" }}
        >
          <div className="text-[11px] uppercase tracking-[0.15em] opacity-70">
            Up next
          </div>
          <div className="text-lg md:text-xl font-medium mt-1 truncate max-w-[28ch]">
            {hero.next_event.title}
          </div>
          <div className="text-sm opacity-90">
            {new Date(hero.next_event.start_at).toLocaleTimeString(undefined, {
              hour: "numeric",
              minute: "2-digit",
            })}{" "}
            · {formatRelative(hero.next_event.minutes_until)}
          </div>
        </div>
      )}
    </>
  );
}

function formatRelative(mins: number): string {
  if (mins < 1) return "now";
  if (mins < 60) return `in ${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return m === 0 ? `in ${h}h` : `in ${h}h ${m}m`;
  const d = Math.floor(h / 24);
  return d === 1 ? "tomorrow" : `in ${d}d`;
}

function SlideLayer({
  src,
  visible,
  kenburnsKey,
}: {
  src: string;
  visible: boolean;
  kenburnsKey: string;
}) {
  if (!src) return null;
  return (
    <img
      key={kenburnsKey}
      src={src}
      alt=""
      draggable={false}
      className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${
        visible ? "opacity-100 animate-[kenburns_30s_ease-out_forwards]" : "opacity-0"
      }`}
    />
  );
}
