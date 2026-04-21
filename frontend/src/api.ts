import type {
  AccountInfo,
  AllowanceChore,
  AllowanceCompletion,
  Birthday,
  Person,
  RingCamera,
  RingLoginStart,
  RingStatus,
  WeekSummary,
  CalendarEvent,
  CalendarMeta,
  CalendarProfile,
  Chore,
  ComfortRef,
  DiscoveredCalendar,
  EcobeePinFlow,
  EcobeeStatus,
  GeneralSettings,
  GoveeTestResult,
  GroceryItem,
  HeroPayload,
  HvacMode,
  LanUrl,
  Light,
  Meal,
  MealSlot,
  Note,
  Photo,
  PinnedCountdown,
  Recipe,
  ReminderPattern,
  ReminderRule,
  ReminderScopeType,
  Thermostat,
  WeatherResponse,
} from "./types";

async function jsonFetch<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  listCalendars: () => jsonFetch<CalendarMeta[]>("/api/config/calendars"),

  listEvents: (start: Date, end: Date) =>
    jsonFetch<CalendarEvent[]>(
      `/api/events?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`
    ),

  createEvent: (payload: {
    calendar_id: string;
    title: string;
    start_at: string;
    end_at: string;
    all_day: boolean;
    description?: string | null;
    location?: string | null;
  }) =>
    jsonFetch<CalendarEvent>("/api/events", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateEvent: (
    uid: string,
    payload: {
      title: string;
      start_at: string;
      end_at: string;
      all_day: boolean;
      description?: string | null;
      location?: string | null;
    }
  ) =>
    jsonFetch<CalendarEvent>(`/api/events/${encodeURIComponent(uid)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  deleteEvent: (uid: string) =>
    jsonFetch<void>(`/api/events/${encodeURIComponent(uid)}`, { method: "DELETE" }),

  listChores: () => jsonFetch<Chore[]>("/api/chores"),

  createChore: (payload: { title: string; assignee?: string | null }) =>
    jsonFetch<Chore>("/api/chores", { method: "POST", body: JSON.stringify(payload) }),

  updateChore: (id: number, payload: Partial<Pick<Chore, "title" | "assignee" | "done">>) =>
    jsonFetch<Chore>(`/api/chores/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),

  deleteChore: (id: number) =>
    jsonFetch<void>(`/api/chores/${id}`, { method: "DELETE" }),

  getWeather: () => jsonFetch<WeatherResponse>("/api/weather"),

  listAccounts: () => jsonFetch<AccountInfo[]>("/api/settings/accounts"),
  createAccount: (payload: { apple_id: string; app_password: string; id?: string }) =>
    jsonFetch<AccountInfo>("/api/settings/accounts", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateAccount: (
    id: string,
    payload: { apple_id?: string; app_password?: string }
  ) =>
    jsonFetch<AccountInfo>(`/api/settings/accounts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteAccount: (id: string) =>
    jsonFetch<void>(`/api/settings/accounts/${id}`, { method: "DELETE" }),
  testAccount: (id: string) =>
    jsonFetch<{ ok: boolean; calendar_count: number }>(
      `/api/settings/accounts/${id}/test`,
      { method: "POST" }
    ),
  discoverForAccount: (id: string) =>
    jsonFetch<DiscoveredCalendar[]>(`/api/settings/accounts/${id}/discover`),

  listCalendarProfiles: () =>
    jsonFetch<CalendarProfile[]>("/api/settings/calendars"),
  createCalendarProfile: (payload: {
    account_id: string;
    display_name: string;
    person: string;
    color?: string;
    category?: string | null;
    writable?: boolean;
    enabled?: boolean;
    id?: string;
  }) =>
    jsonFetch<CalendarProfile>("/api/settings/calendars", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateCalendarProfile: (
    id: string,
    payload: Partial<Omit<CalendarProfile, "id" | "account_id">>
  ) =>
    jsonFetch<CalendarProfile>(`/api/settings/calendars/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteCalendarProfile: (id: string) =>
    jsonFetch<void>(`/api/settings/calendars/${id}`, { method: "DELETE" }),

  getGeneralSettings: () => jsonFetch<GeneralSettings>("/api/settings/general"),
  updateGeneralSettings: (payload: Partial<GeneralSettings>) =>
    jsonFetch<GeneralSettings>("/api/settings/general", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  listBirthdays: () => jsonFetch<Birthday[]>("/api/settings/birthdays"),
  createBirthday: (payload: {
    name: string;
    month: number;
    day: number;
    birth_year?: number | null;
  }) =>
    jsonFetch<Birthday>("/api/settings/birthdays", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateBirthday: (id: number, payload: Partial<Omit<Birthday, "id">>) =>
    jsonFetch<Birthday>(`/api/settings/birthdays/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteBirthday: (id: number) =>
    jsonFetch<void>(`/api/settings/birthdays/${id}`, { method: "DELETE" }),

  listMeals: (start: string, end: string) =>
    jsonFetch<Meal[]>(
      `/api/meals?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
    ),
  upsertMeal: (
    date: string,
    slot: MealSlot,
    payload: { description?: string; recipe_id?: number | null }
  ) =>
    jsonFetch<Meal | null>(`/api/meals/${date}/${slot}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  listRecipes: () => jsonFetch<Recipe[]>("/api/recipes"),
  createRecipe: (payload: { name: string; notes?: string | null; ingredients: string[] }) =>
    jsonFetch<Recipe>("/api/recipes", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateRecipe: (
    id: number,
    payload: { name?: string; notes?: string | null; ingredients?: string[] }
  ) =>
    jsonFetch<Recipe>(`/api/recipes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteRecipe: (id: number) =>
    jsonFetch<void>(`/api/recipes/${id}`, { method: "DELETE" }),

  listGrocery: () => jsonFetch<GroceryItem[]>("/api/grocery"),
  createGrocery: (name: string) =>
    jsonFetch<GroceryItem>("/api/grocery", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  updateGrocery: (id: number, payload: { name?: string; done?: boolean }) =>
    jsonFetch<GroceryItem>(`/api/grocery/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteGrocery: (id: number) =>
    jsonFetch<void>(`/api/grocery/${id}`, { method: "DELETE" }),
  clearDoneGrocery: () =>
    jsonFetch<void>("/api/grocery/clear-done", { method: "POST" }),

  listLights: () => jsonFetch<Light[]>("/api/lights"),
  testGovee: () => jsonFetch<GoveeTestResult>("/api/lights/test", { method: "POST" }),
  setLightPower: (device: string, sku: string, on: boolean) =>
    jsonFetch<void>(`/api/lights/${encodeURIComponent(device)}/power`, {
      method: "POST",
      body: JSON.stringify({ sku, on }),
    }),
  setLightBrightness: (device: string, sku: string, percent: number) =>
    jsonFetch<void>(`/api/lights/${encodeURIComponent(device)}/brightness`, {
      method: "POST",
      body: JSON.stringify({ sku, percent }),
    }),
  setLightColor: (device: string, sku: string, r: number, g: number, b: number) =>
    jsonFetch<void>(`/api/lights/${encodeURIComponent(device)}/color`, {
      method: "POST",
      body: JSON.stringify({ sku, r, g, b }),
    }),

  getHero: () => jsonFetch<HeroPayload>("/api/hero"),

  listCountdowns: () => jsonFetch<PinnedCountdown[]>("/api/countdowns"),
  createCountdown: (payload: {
    label: string;
    emoji?: string | null;
    target_date: string;
  }) =>
    jsonFetch<PinnedCountdown>("/api/countdowns", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateCountdown: (
    id: number,
    payload: { label?: string; emoji?: string | null; target_date?: string }
  ) =>
    jsonFetch<PinnedCountdown>(`/api/countdowns/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteCountdown: (id: number) =>
    jsonFetch<void>(`/api/countdowns/${id}`, { method: "DELETE" }),

  listNotes: () => jsonFetch<Note[]>("/api/notes"),
  createNote: (text: string) =>
    jsonFetch<Note>("/api/notes", {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  updateNote: (id: number, text: string) =>
    jsonFetch<Note>(`/api/notes/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ text }),
    }),
  deleteNote: (id: number) =>
    jsonFetch<void>(`/api/notes/${id}`, { method: "DELETE" }),

  listReminderRules: () => jsonFetch<ReminderRule[]>("/api/reminders"),
  createReminderRule: (payload: {
    name?: string | null;
    scope_type: ReminderScopeType;
    scope_value: string;
    lead_minutes: number;
    device_id: string;
    device_sku: string;
    device_name?: string | null;
    flash_color?: string;
    flash_pattern?: ReminderPattern;
    active?: boolean;
  }) =>
    jsonFetch<ReminderRule>("/api/reminders", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateReminderRule: (
    id: number,
    payload: Partial<Omit<ReminderRule, "id">>
  ) =>
    jsonFetch<ReminderRule>(`/api/reminders/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteReminderRule: (id: number) =>
    jsonFetch<void>(`/api/reminders/${id}`, { method: "DELETE" }),
  testReminderRule: (id: number) =>
    jsonFetch<void>(`/api/reminders/${id}/test`, { method: "POST" }),
  reminderCategories: () => jsonFetch<string[]>("/api/reminders/categories"),

  ecobeeStatus: () => jsonFetch<EcobeeStatus>("/api/ecobee/status"),
  ecobeeAuthorizeStart: () =>
    jsonFetch<EcobeePinFlow>("/api/ecobee/authorize/start", { method: "POST" }),
  ecobeeAuthorizePoll: (code: string) =>
    jsonFetch<{ status: "pending" | "connected" }>(
      "/api/ecobee/authorize/poll",
      { method: "POST", body: JSON.stringify({ code }) }
    ),
  ecobeeDisconnect: () =>
    jsonFetch<void>("/api/ecobee/disconnect", { method: "POST" }),
  getThermostat: () => jsonFetch<Thermostat>("/api/ecobee/thermostat"),
  setThermostatMode: (mode: HvacMode) =>
    jsonFetch<void>("/api/ecobee/thermostat/mode", {
      method: "POST",
      body: JSON.stringify({ mode }),
    }),
  setThermostatHold: (payload: { heat_f?: number; cool_f?: number }) =>
    jsonFetch<void>("/api/ecobee/thermostat/hold", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  setThermostatComfort: (ref: ComfortRef) =>
    jsonFetch<void>("/api/ecobee/thermostat/comfort", {
      method: "POST",
      body: JSON.stringify({ ref }),
    }),
  resumeThermostatProgram: () =>
    jsonFetch<void>("/api/ecobee/thermostat/resume", { method: "POST" }),

  listPhotos: () => jsonFetch<Photo[]>("/api/photos"),
  uploadPhotos: async (files: File[]): Promise<Photo[]> => {
    const form = new FormData();
    for (const f of files) form.append("files", f);
    const res = await fetch("/api/photos", { method: "POST", body: form });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status} ${res.statusText}: ${text}`);
    }
    return (await res.json()) as Photo[];
  },
  deletePhoto: (id: number) =>
    jsonFetch<void>(`/api/photos/${id}`, { method: "DELETE" }),
  getLanUrl: () => jsonFetch<LanUrl>("/api/network/lan-url"),

  listPeople: () => jsonFetch<Person[]>("/api/allowance/people"),
  createPerson: (payload: { name: string; emoji?: string | null; color?: string }) =>
    jsonFetch<Person>("/api/allowance/people", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updatePerson: (id: number, payload: Partial<Omit<Person, "id">>) =>
    jsonFetch<Person>(`/api/allowance/people/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deletePerson: (id: number) =>
    jsonFetch<void>(`/api/allowance/people/${id}`, { method: "DELETE" }),

  listAllowanceChores: () =>
    jsonFetch<AllowanceChore[]>("/api/allowance/chores"),
  createAllowanceChore: (payload: {
    name: string;
    emoji?: string | null;
    points: number;
    person_id?: number | null;
  }) =>
    jsonFetch<AllowanceChore>("/api/allowance/chores", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateAllowanceChore: (id: number, payload: Partial<Omit<AllowanceChore, "id">>) =>
    jsonFetch<AllowanceChore>(`/api/allowance/chores/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteAllowanceChore: (id: number) =>
    jsonFetch<void>(`/api/allowance/chores/${id}`, { method: "DELETE" }),

  recordCompletion: (payload: { chore_id: number; person_id?: number }) =>
    jsonFetch<AllowanceCompletion>("/api/allowance/completions", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteCompletion: (id: number) =>
    jsonFetch<void>(`/api/allowance/completions/${id}`, { method: "DELETE" }),

  allowanceWeek: (day?: string) =>
    jsonFetch<WeekSummary>(
      "/api/allowance/week" + (day ? `?day=${encodeURIComponent(day)}` : "")
    ),
  payOutAllowance: (payload: { person_id: number; day?: string }) =>
    jsonFetch<void>("/api/allowance/payout", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  ringStatus: () => jsonFetch<RingStatus>("/api/ring/status"),
  ringStartLogin: (payload: { email: string; password: string }) =>
    jsonFetch<RingLoginStart>("/api/ring/auth/start", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  ringSubmit2FA: (payload: { session_id: string; code: string }) =>
    jsonFetch<RingLoginStart>("/api/ring/auth/2fa", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  ringDisconnect: () =>
    jsonFetch<void>("/api/ring/disconnect", { method: "POST" }),
  listRingCameras: () => jsonFetch<RingCamera[]>("/api/ring/cameras"),
  ringSnapshotUrl: (deviceId: number, cacheBuster: number = Date.now()) =>
    `/api/ring/cameras/${deviceId}/snapshot?t=${cacheBuster}`,
};
