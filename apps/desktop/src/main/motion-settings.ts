export const MOTION_MODE_IDS = ["system", "full", "reduced", "off"] as const;

export type MotionMode = (typeof MOTION_MODE_IDS)[number];

export const DEFAULT_MOTION_MODE: MotionMode = "system";
export const DEFAULT_PAUSE_WHEN_BACKGROUND = true;

function isMotionMode(value: unknown): value is MotionMode {
  return value === "system" || value === "full" || value === "reduced" || value === "off";
}

export function normalizeMotionMode(value: unknown): MotionMode {
  return isMotionMode(value) ? value : DEFAULT_MOTION_MODE;
}

export function normalizePauseWhenBackground(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  return DEFAULT_PAUSE_WHEN_BACKGROUND;
}
