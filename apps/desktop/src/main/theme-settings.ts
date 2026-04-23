export const BASE_MODE_IDS = ["light", "dark", "amoled"] as const;
export type BaseModeId = (typeof BASE_MODE_IDS)[number];

export const THEME_COLOR_IDS = [
  "neutral",
  "gray",
  "slate",
  "black",
  "white",
  "lightGray",
  "red",
  "rose",
  "pink",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "lightBlue",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
] as const;
export type ThemeColorId = (typeof THEME_COLOR_IDS)[number];

export const LEGACY_ACCENT_IDS = [
  "none",
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "indigo",
  "violet",
  "purple",
  "pink",
  "teal",
  "cyan",
  "lime",
  "gray",
  "white",
  "black",
  "lightGray",
  "lightBlue",
] as const;
export type LegacyAccentId = (typeof LEGACY_ACCENT_IDS)[number];

export const ACCENT_OVERRIDE_IDS = ["none", "theme", ...LEGACY_ACCENT_IDS.filter((value) => value !== "none")] as const;
export type AccentOverrideId = (typeof ACCENT_OVERRIDE_IDS)[number];

export const DEFAULT_BASE_MODE_ID: BaseModeId = "dark";
export const DEFAULT_THEME_COLOR_ID: ThemeColorId = "neutral";
export const DEFAULT_ACCENT_OVERRIDE_ID: AccentOverrideId = "none";

export type ThemeNormalizationResult = {
  baseMode: BaseModeId;
  themeColor: ThemeColorId;
  accentOverride: AccentOverrideId;
  usedLegacyTheme: boolean;
  usedLegacyBaseThemeAccent: boolean;
  hadInvalidBaseMode: boolean;
  hadInvalidThemeColor: boolean;
  hadInvalidAccentOverride: boolean;
};

// Backward-compatible aliases for in-flight refactors.
export const BASE_THEME_IDS = BASE_MODE_IDS;
export type BaseThemeId = BaseModeId;
export const ACCENT_IDS = LEGACY_ACCENT_IDS;
export type AccentId = LegacyAccentId;
export const DEFAULT_BASE_THEME_ID = DEFAULT_BASE_MODE_ID;
export const DEFAULT_ACCENT_ID: AccentId = "none";

function isBaseModeId(value: unknown): value is BaseModeId {
  return value === "light" || value === "dark" || value === "amoled";
}

function isThemeColorId(value: unknown): value is ThemeColorId {
  return THEME_COLOR_IDS.some((themeColor) => themeColor === value);
}

function isLegacyAccentId(value: unknown): value is LegacyAccentId {
  return (
    value === "none" ||
    value === "red" ||
    value === "orange" ||
    value === "yellow" ||
    value === "green" ||
    value === "blue" ||
    value === "indigo" ||
    value === "violet" ||
    value === "purple" ||
    value === "pink" ||
    value === "teal" ||
    value === "cyan" ||
    value === "lime" ||
    value === "gray" ||
    value === "white" ||
    value === "black" ||
    value === "lightGray" ||
    value === "lightBlue"
  );
}

function isAccentOverrideId(value: unknown): value is AccentOverrideId {
  return value === "theme" || isLegacyAccentId(value);
}

function normalizeLookupKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_]+/g, "-");
}

function normalizeCompactKey(value: string): string {
  return normalizeLookupKey(value).replace(/-/g, "");
}

type LegacyThemeMigration = {
  baseMode: BaseModeId;
  themeColor: ThemeColorId;
  accentOverride: AccentOverrideId;
};

const LEGACY_THEME_MAP: Record<string, LegacyThemeMigration> = {
  light: { baseMode: "light", themeColor: "neutral", accentOverride: "none" },
  dark: { baseMode: "dark", themeColor: "neutral", accentOverride: "none" },
  amoled: { baseMode: "amoled", themeColor: "neutral", accentOverride: "none" },
  midnight: { baseMode: "dark", themeColor: "neutral", accentOverride: "none" },
  "true-dark": { baseMode: "dark", themeColor: "neutral", accentOverride: "none" },
  truedark: { baseMode: "dark", themeColor: "neutral", accentOverride: "none" },

  green: { baseMode: "dark", themeColor: "green", accentOverride: "theme" },
  purple: { baseMode: "dark", themeColor: "purple", accentOverride: "theme" },
  "purple-theme": { baseMode: "dark", themeColor: "purple", accentOverride: "theme" },
  violet: { baseMode: "dark", themeColor: "violet", accentOverride: "theme" },
  red: { baseMode: "dark", themeColor: "red", accentOverride: "theme" },
  rose: { baseMode: "dark", themeColor: "rose", accentOverride: "theme" },
  pink: { baseMode: "dark", themeColor: "pink", accentOverride: "theme" },
  orange: { baseMode: "dark", themeColor: "orange", accentOverride: "theme" },
  yellow: { baseMode: "dark", themeColor: "yellow", accentOverride: "theme" },
  amber: { baseMode: "dark", themeColor: "amber", accentOverride: "theme" },
  gold: { baseMode: "dark", themeColor: "amber", accentOverride: "theme" },
  lime: { baseMode: "dark", themeColor: "lime", accentOverride: "theme" },
  blue: { baseMode: "dark", themeColor: "blue", accentOverride: "theme" },
  "blue-dark": { baseMode: "dark", themeColor: "blue", accentOverride: "theme" },
  bluedark: { baseMode: "dark", themeColor: "blue", accentOverride: "theme" },
  sky: { baseMode: "dark", themeColor: "sky", accentOverride: "theme" },
  azure: { baseMode: "dark", themeColor: "sky", accentOverride: "theme" },
  cyan: { baseMode: "dark", themeColor: "cyan", accentOverride: "theme" },
  indigo: { baseMode: "dark", themeColor: "indigo", accentOverride: "theme" },
  teal: { baseMode: "dark", themeColor: "teal", accentOverride: "theme" },
  emerald: { baseMode: "dark", themeColor: "emerald", accentOverride: "theme" },
  mint: { baseMode: "dark", themeColor: "emerald", accentOverride: "theme" },
  slate: { baseMode: "dark", themeColor: "slate", accentOverride: "theme" },
  gray: { baseMode: "dark", themeColor: "gray", accentOverride: "theme" },
  grey: { baseMode: "dark", themeColor: "gray", accentOverride: "theme" },
  white: { baseMode: "dark", themeColor: "white", accentOverride: "theme" },
  black: { baseMode: "dark", themeColor: "black", accentOverride: "theme" },
  "light-gray": { baseMode: "dark", themeColor: "lightGray", accentOverride: "theme" },
  lightgray: { baseMode: "dark", themeColor: "lightGray", accentOverride: "theme" },
  "light-blue": { baseMode: "dark", themeColor: "lightBlue", accentOverride: "theme" },
  lightblue: { baseMode: "dark", themeColor: "lightBlue", accentOverride: "theme" },

  none: { baseMode: "dark", themeColor: "neutral", accentOverride: "none" },
};

export function normalizeBaseMode(value: unknown): BaseModeId {
  return isBaseModeId(value) ? value : DEFAULT_BASE_MODE_ID;
}

export function normalizeThemeColor(value: unknown): ThemeColorId {
  return isThemeColorId(value) ? value : DEFAULT_THEME_COLOR_ID;
}

export function normalizeAccentOverride(value: unknown): AccentOverrideId {
  return isAccentOverrideId(value) ? value : DEFAULT_ACCENT_OVERRIDE_ID;
}

// Backward-compatible aliases for in-flight refactors.
export function normalizeBaseTheme(value: unknown): BaseThemeId {
  return normalizeBaseMode(value);
}

export function normalizeAccent(value: unknown): AccentId {
  return isLegacyAccentId(value) ? value : DEFAULT_ACCENT_ID;
}

export function migrateLegacyTheme(value: unknown): LegacyThemeMigration | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = normalizeLookupKey(trimmed);
  const compact = normalizeCompactKey(trimmed);
  return LEGACY_THEME_MAP[normalized] ?? LEGACY_THEME_MAP[compact] ?? null;
}

export function normalizeThemeSettings(input: {
  baseMode?: unknown;
  themeColor?: unknown;
  accentOverride?: unknown;
  baseTheme?: unknown;
  accent?: unknown;
  theme?: unknown;
}): ThemeNormalizationResult {
  const hasBaseMode = input.baseMode !== undefined;
  const hasThemeColor = input.themeColor !== undefined;
  const hasAccentOverride = input.accentOverride !== undefined;
  const hasCurrentBaseTheme = input.baseTheme !== undefined;
  const hasCurrentAccent = input.accent !== undefined;

  const hasV3 = hasBaseMode || hasThemeColor || hasAccentOverride;
  const hasCurrent = hasCurrentBaseTheme || hasCurrentAccent;

  let baseMode: BaseModeId = DEFAULT_BASE_MODE_ID;
  let themeColor: ThemeColorId = DEFAULT_THEME_COLOR_ID;
  let accentOverride: AccentOverrideId = DEFAULT_ACCENT_OVERRIDE_ID;

  let usedLegacyTheme = false;
  let usedLegacyBaseThemeAccent = false;
  let hadInvalidBaseMode = false;
  let hadInvalidThemeColor = false;
  let hadInvalidAccentOverride = false;

  if (hasV3) {
    baseMode = normalizeBaseMode(input.baseMode);
    themeColor = normalizeThemeColor(input.themeColor);
    accentOverride = normalizeAccentOverride(input.accentOverride);

    hadInvalidBaseMode = hasBaseMode && !isBaseModeId(input.baseMode);
    hadInvalidThemeColor = hasThemeColor && !isThemeColorId(input.themeColor);
    hadInvalidAccentOverride = hasAccentOverride && !isAccentOverrideId(input.accentOverride);
  } else if (hasCurrent) {
    const migratedBaseMode = normalizeBaseMode(input.baseTheme);
    const migratedAccent = normalizeAccent(input.accent);

    baseMode = migratedBaseMode;
    themeColor = DEFAULT_THEME_COLOR_ID;
    accentOverride = migratedAccent === "none" ? "none" : migratedAccent;

    usedLegacyBaseThemeAccent = true;
    hadInvalidBaseMode = hasCurrentBaseTheme && !isBaseModeId(input.baseTheme);
    hadInvalidAccentOverride = hasCurrentAccent && !isLegacyAccentId(input.accent);
  } else {
    const migrated = migrateLegacyTheme(input.theme);
    if (migrated) {
      baseMode = migrated.baseMode;
      themeColor = migrated.themeColor;
      accentOverride = migrated.accentOverride;
      usedLegacyTheme = input.theme !== undefined;
    } else {
      baseMode = DEFAULT_BASE_MODE_ID;
      themeColor = DEFAULT_THEME_COLOR_ID;
      accentOverride = DEFAULT_ACCENT_OVERRIDE_ID;
      usedLegacyTheme = input.theme !== undefined;
      hadInvalidBaseMode = input.theme !== undefined;
      hadInvalidThemeColor = input.theme !== undefined;
      hadInvalidAccentOverride = input.theme !== undefined;
    }
  }

  if (baseMode === "amoled") {
    if (themeColor !== "neutral") {
      hadInvalidThemeColor = true;
    }
    if (accentOverride !== "none") {
      hadInvalidAccentOverride = true;
    }
    themeColor = "neutral";
    accentOverride = "none";
  }

  return {
    baseMode,
    themeColor,
    accentOverride,
    usedLegacyTheme,
    usedLegacyBaseThemeAccent,
    hadInvalidBaseMode,
    hadInvalidThemeColor,
    hadInvalidAccentOverride,
  };
}
