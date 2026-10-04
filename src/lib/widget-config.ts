export const WIDGET_STATES = [
  "idle",
  "listening",
  "thinking",
  "speaking",
  "message",
  "success",
  "handoff",
  "error",
  "offline",
] as const;

export type WidgetState = (typeof WIDGET_STATES)[number];

export type WidgetStateConfig = {
  enabled: boolean;
  speed: number;
  energy: number;
  color?: string;
};

export type WidgetConfig = {
  style: "metal-balls";
  primary: string;
  secondary: string;
  center: string;
  glow: string;
  size: number;
  position: "bottom-right" | "bottom-left";
  ballCount: number;
  radius: number;
  ballSize: number;
  centerSize: number;
  tilt: number;
  variation: number;
  shine: boolean;
  speed: number;
  stateAnimations: Partial<Record<WidgetState, WidgetStateConfig>>;
  labels: Partial<Record<WidgetState, string>>;
  welcome: string;
  placeholder: string;
  sound: boolean;
  chat: {
    title: string;
    subtitle: string;
    autoOpen: boolean;
  };
  mobile: {
    hidden: boolean;
    size: number;
  };
  desktop: {
    size: number;
  };
  fallback: {
    enabled: boolean;
    type: "static";
  };
  advanced: {
    debug: boolean;
  };
  retrievalTopK?: number;
  behavior?: string;
};

const STATE_DEFAULTS: Record<WidgetState, WidgetStateConfig> = {
  idle: { enabled: true, speed: 1, energy: 0.25 },
  listening: { enabled: true, speed: 1.1, energy: 0.6 },
  thinking: { enabled: true, speed: 1.3, energy: 0.85 },
  speaking: { enabled: true, speed: 1.25, energy: 1 },
  message: { enabled: true, speed: 1.1, energy: 0.7 },
  success: { enabled: true, speed: 0.9, energy: 0.5 },
  handoff: { enabled: true, speed: 1, energy: 0.5 },
  error: { enabled: true, speed: 1, energy: 0.9 },
  offline: { enabled: false, speed: 0, energy: 0 },
};

export const DEFAULT_WIDGET_CONFIG: WidgetConfig = {
  style: "metal-balls",
  primary: "#FF0000",
  secondary: "#FF0000",
  center: "#FBFBFB",
  glow: "#FF0000",
  size: 64,
  position: "bottom-right",
  ballCount: 32,
  radius: 37,
  ballSize: 3,
  centerSize: 31,
  tilt: 49,
  variation: 0.14,
  shine: true,
  speed: 1,
  stateAnimations: STATE_DEFAULTS,
  labels: {
    idle: "Online",
    listening: "Listening…",
    thinking: "Thinking…",
    speaking: "Replying…",
    message: "New message",
    success: "Done",
    handoff: "Connecting you to a person",
    error: "Something went wrong",
    offline: "Offline",
  },
  welcome: "Hello! How can I help you today?",
  placeholder: "Type your message…",
  sound: false,
  chat: { title: "AI Assistant", subtitle: "Usually replies instantly", autoOpen: false },
  mobile: { hidden: false, size: 56 },
  desktop: { size: 64 },
  fallback: { enabled: true, type: "static" },
  advanced: { debug: false },
  retrievalTopK: 8,
  behavior: "",
};

function asHex(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function asNumber(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  return Number.isFinite(n) ? clamp(n, min, max) : fallback;
}

function normalizeStateConfig(value: unknown, fallback: WidgetStateConfig) {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    enabled: typeof source.enabled === "boolean" ? source.enabled : fallback.enabled,
    speed: asNumber(source.speed, fallback.speed, 0, 5),
    energy: asNumber(source.energy, fallback.energy, 0, 3),
    ...(source.color ? { color: asHex(source.color, fallback.color ?? DEFAULT_WIDGET_CONFIG.primary) } : {}),
  } satisfies WidgetStateConfig;
}

/** Normalizes both the canonical Gen 2 shape and older widget-editor shapes. */
export function normalizeWidgetConfig(input: unknown): WidgetConfig {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const legacyRadius = raw.radius !== undefined ? Number(raw.radius) : NaN;
  const legacyBallSize = raw.ballSize !== undefined ? Number(raw.ballSize) : NaN;
  const legacyCenterSize = raw.centerSize !== undefined ? Number(raw.centerSize) : NaN;
  const legacyTilt = raw.tilt !== undefined ? Number(raw.tilt) : NaN;

  const stateSource = raw.stateAnimations && typeof raw.stateAnimations === "object"
    ? (raw.stateAnimations as Record<string, unknown>)
    : raw.states && typeof raw.states === "object"
      ? (raw.states as Record<string, unknown>)
      : {};

  const stateAnimations = Object.fromEntries(
    WIDGET_STATES.map((state) => {
      const fallback = DEFAULT_WIDGET_CONFIG.stateAnimations[state]!;
      const source = stateSource[state];
      return [state, normalizeStateConfig(source, fallback)];
    }),
  ) as WidgetConfig["stateAnimations"];

  const labelsSource = raw.labels && typeof raw.labels === "object" ? (raw.labels as Record<string, unknown>) : {};

  const primary = asHex(raw.primary ?? raw.orb_color_primary, DEFAULT_WIDGET_CONFIG.primary);
  const secondary = asHex(raw.secondary ?? raw.orb_color_secondary, DEFAULT_WIDGET_CONFIG.secondary);
  const glow = asHex(raw.glow ?? raw.orb_color_accent ?? raw.accent, primary);
  const center = asHex(raw.center ?? raw.centerColor, DEFAULT_WIDGET_CONFIG.center);

  return {
    style: "metal-balls",
    primary,
    secondary,
    center,
    glow,
    size: asNumber(raw.size, DEFAULT_WIDGET_CONFIG.size, 44, 132),
    position: raw.position === "bottom-left" ? "bottom-left" : "bottom-right",
    ballCount: Math.round(asNumber(raw.ballCount, DEFAULT_WIDGET_CONFIG.ballCount, 8, 128)),
    radius: legacyRadius > 0 && legacyRadius <= 0.6 ? legacyRadius * 50 : asNumber(raw.radius, DEFAULT_WIDGET_CONFIG.radius, 8, 60),
    ballSize: legacyBallSize > 0 && legacyBallSize <= 0.35 ? legacyBallSize * 25 : asNumber(raw.ballSize, DEFAULT_WIDGET_CONFIG.ballSize, 1, 12),
    centerSize: legacyCenterSize >= 0 && legacyCenterSize <= 0.5 ? legacyCenterSize * 172 : asNumber(raw.centerSize, DEFAULT_WIDGET_CONFIG.centerSize, 3, 70),
    tilt: legacyTilt >= 0 && legacyTilt <= 1 ? legacyTilt * 140 : asNumber(raw.tilt, DEFAULT_WIDGET_CONFIG.tilt, 0, 180),
    variation: asNumber(raw.variation, DEFAULT_WIDGET_CONFIG.variation, 0, 1),
    shine: typeof raw.shine === "number" ? raw.shine > 0 : raw.shine !== false,
    speed: asNumber(raw.speed ?? raw.animation_speed, DEFAULT_WIDGET_CONFIG.speed, 0.1, 4),
    stateAnimations,
    labels: Object.fromEntries(
      WIDGET_STATES.map((state) => [state, typeof labelsSource[state] === "string" ? labelsSource[state] : DEFAULT_WIDGET_CONFIG.labels[state]]),
    ) as WidgetConfig["labels"],
    welcome: String(raw.welcome ?? raw.text ?? raw.greeting_text ?? DEFAULT_WIDGET_CONFIG.welcome).slice(0, 400),
    placeholder: String(raw.placeholder ?? DEFAULT_WIDGET_CONFIG.placeholder).slice(0, 120),
    sound: raw.sound === true,
    chat: {
      title: String((raw.chat && typeof raw.chat === "object" ? (raw.chat as Record<string, unknown>).title : raw.title) ?? DEFAULT_WIDGET_CONFIG.chat.title).slice(0, 60),
      subtitle: String((raw.chat && typeof raw.chat === "object" ? (raw.chat as Record<string, unknown>).subtitle : raw.subtitle) ?? DEFAULT_WIDGET_CONFIG.chat.subtitle).slice(0, 80),
      autoOpen: Boolean((raw.chat && typeof raw.chat === "object" ? (raw.chat as Record<string, unknown>).autoOpen : raw.autoOpen) ?? false),
    },
    mobile: {
      hidden: Boolean((raw.mobile && typeof raw.mobile === "object" ? (raw.mobile as Record<string, unknown>).hidden : raw.mobileHidden) ?? false),
      size: asNumber((raw.mobile && typeof raw.mobile === "object" ? (raw.mobile as Record<string, unknown>).size : raw.mobileSize), DEFAULT_WIDGET_CONFIG.mobile.size, 40, 100),
    },
    desktop: {
      size: asNumber((raw.desktop && typeof raw.desktop === "object" ? (raw.desktop as Record<string, unknown>).size : raw.size), DEFAULT_WIDGET_CONFIG.desktop.size, 44, 132),
    },
    fallback: { enabled: raw.fallback && typeof raw.fallback === "object" ? (raw.fallback as Record<string, unknown>).enabled !== false : true, type: "static" },
    advanced: { debug: raw.advanced && typeof raw.advanced === "object" ? Boolean((raw.advanced as Record<string, unknown>).debug) : false },
    retrievalTopK: Math.round(asNumber(raw.retrievalTopK, DEFAULT_WIDGET_CONFIG.retrievalTopK ?? 8, 1, 20)),
    behavior: typeof raw.behavior === "string" ? raw.behavior.slice(0, 4000) : typeof raw.owner_instructions === "string" ? raw.owner_instructions.slice(0, 4000) : "",
  };
}
