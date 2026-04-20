export interface CalendarMeta {
  id: string;
  display_name: string;
  person: string;
  category: string | null;
  color: string;
  writable: boolean;
}

export interface CalendarEvent {
  uid: string;
  calendar_id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
  rrule: string | null;
}

export interface Chore {
  id: number;
  title: string;
  assignee: string | null;
  done: boolean;
  created_at: string;
  completed_at: string | null;
}

export interface WeatherDaily {
  time: string[];
  weather_code: number[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  precipitation_probability_max: number[];
}

export interface WeatherCurrent {
  temperature_2m: number;
  weather_code: number;
  is_day: number;
}

export interface WeatherResponse {
  current: WeatherCurrent;
  daily: WeatherDaily;
  current_units?: { temperature_2m: string };
  daily_units?: { temperature_2m_max: string };
}

export interface AccountInfo {
  id: string;
  apple_id: string;
  has_password: boolean;
}

export interface DiscoveredCalendar {
  account_id: string;
  display_name: string;
  url: string;
  already_added: boolean;
}

export interface CalendarProfile {
  id: string;
  account_id: string;
  display_name: string;
  person: string;
  category: string | null;
  color: string;
  writable: boolean;
  enabled: boolean;
}

export interface GeneralSettings {
  latitude: number;
  longitude: number;
  timezone: string;
  unit: "fahrenheit" | "celsius";
  sync_interval_seconds: number;
  show_us_holidays: boolean;
  show_christian_holidays: boolean;
  us_holiday_color: string;
  christian_holiday_color: string;
  show_birthdays: boolean;
  birthday_color: string;
  govee_api_key: string | null;
  ecobee_api_key: string | null;
  ecobee_authorized: boolean;
  slideshow_enabled: boolean;
  slideshow_idle_minutes: number;
  slideshow_per_photo_seconds: number;
  slideshow_calendar_every_n: number;
  slideshow_calendar_seconds: number;
  theme_auto: boolean;
  theme_dark_start_hour: number;
  theme_light_start_hour: number;
  allowance_point_value_cents: number;
  allowance_week_starts_on: number;
}

export interface Person {
  id: number;
  name: string;
  emoji: string | null;
  color: string;
}

export interface AllowanceChore {
  id: number;
  name: string;
  emoji: string | null;
  points: number;
  person_id: number | null;
}

export interface AllowanceCompletion {
  id: number;
  chore_id: number;
  person_id: number;
  points: number;
  completed_at: string;
  paid_out_at: string | null;
}

export interface PersonWeekSummary {
  person: Person;
  points_total: number;
  earnings_cents: number;
  completions: AllowanceCompletion[];
}

export interface WeekSummary {
  week_start: string;
  week_end: string;
  point_value_cents: number;
  people: PersonWeekSummary[];
}

export interface LanUrl {
  drop_url: string;
  dashboard_url: string;
  host: string;
}

export interface Photo {
  id: number;
  filename: string;
  original_name: string | null;
  content_type: string | null;
  size_bytes: number;
  uploaded_at: string;
  url: string;
}

export type HvacMode = "auto" | "heat" | "cool" | "off" | "auxHeatOnly";
export type ComfortRef = "home" | "away" | "sleep";

export interface Thermostat {
  name: string;
  indoor_temperature_f: number | null;
  indoor_humidity: number | null;
  hvac_mode: HvacMode;
  equipment_status: "heating" | "cooling" | "idle" | "fan" | "off";
  heat_setpoint_f: number | null;
  cool_setpoint_f: number | null;
  current_climate_ref: string | null;
  available_climate_refs: string[];
  is_held: boolean;
}

export interface EcobeePinFlow {
  pin: string;
  code: string;
  interval: number;
  expires_in: number;
}

export interface EcobeeStatus {
  api_key_set: boolean;
  authorized: boolean;
}

export interface PinnedCountdown {
  id: number;
  label: string;
  emoji: string | null;
  target_date: string;
}

export interface Note {
  id: number;
  text: string;
  created_at: string;
  updated_at: string;
}

export type ReminderScopeType = "calendar" | "category";
export type ReminderPattern = "single" | "triple" | "pulse";

export interface ReminderRule {
  id: number;
  name: string | null;
  scope_type: ReminderScopeType;
  scope_value: string;
  lead_minutes: number;
  device_id: string;
  device_sku: string;
  device_name: string | null;
  flash_color: string;
  flash_pattern: ReminderPattern;
  active: boolean;
  last_error: string | null;
  last_error_at: string | null;
}

export interface HeroNextEvent {
  title: string;
  start_at: string;
  calendar_id: string;
  location: string | null;
  minutes_until: number;
}

export interface HeroBadge {
  kind: "birthday" | "holiday";
  title: string;
  emoji: string;
}

export interface HeroChip {
  kind: "birthday" | "pinned";
  label: string;
  emoji: string;
  days_until: number;
  target_date: string;
}

export interface HeroPayload {
  next_event: HeroNextEvent | null;
  today_badges: HeroBadge[];
  countdowns: HeroChip[];
}

export interface Birthday {
  id: number;
  name: string;
  month: number;
  day: number;
  birth_year: number | null;
}

export type MealSlot = "breakfast" | "lunch" | "dinner";

export interface Meal {
  id: number;
  date: string;
  slot: MealSlot;
  description: string;
  recipe_id: number | null;
}

export interface RecipeIngredient {
  id: number;
  name: string;
  position: number;
}

export interface Recipe {
  id: number;
  name: string;
  notes: string | null;
  ingredients: RecipeIngredient[];
}

export interface GroceryItem {
  id: number;
  name: string;
  done: boolean;
  source_meal_id: number | null;
}

export interface Light {
  device: string;
  sku: string;
  name: string;
  type: string;
  capabilities: Array<{ type: string; instance: string; [key: string]: unknown }>;
  state: {
    on?: boolean;
    brightness?: number;
    color_rgb?: number;
    color_temperature_k?: number;
  };
}

export interface GoveeTestResult {
  ok: boolean;
  device_count: number;
  status: "connected" | "invalid_key" | "rate_limited" | "error";
  message: string | null;
}
