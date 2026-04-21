import { lazy, Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { CalendarMeta } from "./types";
import { CalendarView, type ViewKind } from "./components/CalendarView";
import { ViewToggle } from "./components/ViewToggle";
import { Weather } from "./components/Weather";
import { Todos } from "./components/Todos";
import { Clock } from "./components/Clock";
import { CalendarLegend } from "./components/CalendarLegend";
import { ThemeToggle } from "./components/ThemeToggle";
import { SettingsButton } from "./components/SettingsButton";
import { NotesButton } from "./components/NotesButton";
import { OnScreenKeyboard } from "./components/OnScreenKeyboard";
import { PagesContainer } from "./components/PagesContainer";
import { HeroBanner } from "./components/HeroBanner";
import { PhotoSlideshow } from "./components/PhotoSlideshow";
import { ConnectionStatus } from "./components/ConnectionStatus";
import { useServerEvents } from "./lib/sse";

// Code-split the other pages so the initial bundle stays small. On a Pi 3B
// this cuts the time-to-interactive significantly: only the Calendar page's
// FullCalendar + rrule bundle loads immediately; Meals/Home/Chores JS parses
// on demand when the user first swipes to them.
const MealPlannerPage = lazy(() =>
  import("./components/MealPlannerPage").then((m) => ({ default: m.MealPlannerPage }))
);
const HomePage = lazy(() =>
  import("./components/HomePage").then((m) => ({ default: m.HomePage }))
);
const ChoresPage = lazy(() =>
  import("./components/ChoresPage").then((m) => ({ default: m.ChoresPage }))
);

const PAGE_LABELS = ["Calendar", "Meals", "Home", "Chores"];

function PageFallback() {
  return (
    <div className="h-full flex items-center justify-center text-[var(--text-muted)] text-sm">
      Loading…
    </div>
  );
}

export default function App() {
  const sseStatus = useServerEvents();

  const [view, setView] = useState<ViewKind>("week");
  const [pageIndex, setPageIndex] = useState(0);
  // Track the furthest page the user has swiped to so once a page is
  // mounted its state (scroll position, form drafts, TanStack cache wiring)
  // survives swipes back and forth. Pages ahead of `maxVisited` are still
  // lazy-loaded.
  const [maxVisited, setMaxVisited] = useState(0);
  const handlePageChange = (i: number) => {
    setPageIndex(i);
    if (i > maxVisited) setMaxVisited(i);
  };

  const { data: calendars = [], isLoading, error } = useQuery<CalendarMeta[]>({
    queryKey: ["calendars"],
    queryFn: api.listCalendars,
    staleTime: Infinity,
  });

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--text-muted)]">
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--danger)] p-6 text-center">
        Failed to load config: {(error as Error).message}
      </div>
    );
  }

  return (
    <div className="h-full grid grid-cols-[1fr_320px] gap-4 p-4">
      <main className="rounded-2xl bg-[var(--card)] p-4 flex flex-col min-h-0">
        <div className="flex items-center justify-between gap-2 mb-3">
          <NotesButton />
          <div className="flex items-center gap-2">
            {pageIndex === 0 && <ViewToggle value={view} onChange={setView} />}
            <ThemeToggle />
            <SettingsButton />
          </div>
        </div>
        <PagesContainer
          index={pageIndex}
          onChange={handlePageChange}
          labels={PAGE_LABELS}
        >
          <div className="h-full">
            <CalendarView view={view} calendars={calendars} />
          </div>
          <div className="h-full">
            <Suspense fallback={<PageFallback />}>
              {maxVisited >= 1 ? <MealPlannerPage /> : null}
            </Suspense>
          </div>
          <div className="h-full">
            <Suspense fallback={<PageFallback />}>
              {maxVisited >= 2 ? <HomePage /> : null}
            </Suspense>
          </div>
          <div className="h-full">
            <Suspense fallback={<PageFallback />}>
              {maxVisited >= 3 ? <ChoresPage /> : null}
            </Suspense>
          </div>
        </PagesContainer>
        <HeroBanner />
      </main>
      <aside className="h-full flex flex-col gap-4 min-h-0">
        <Clock />
        <Weather />
        <CalendarLegend calendars={calendars} />
        <Todos />
      </aside>
      <OnScreenKeyboard />
      <PhotoSlideshow />
      <ConnectionStatus status={sseStatus} />
    </div>
  );
}
