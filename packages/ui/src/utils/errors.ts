type ErrorMeta = {
  title: string;
  instruction: string;
};

const ERROR_MAP: Record<string, ErrorMeta> = {
  E_LOCKED: {
    title: "App is locked",
    instruction: "Unlock the app first, then try this action again.",
  },
  E_STEP_UP_REQUIRED: {
    title: "Authentication required",
    instruction: "Confirm your identity to continue with this sensitive action.",
  },
  E_VAULT_MODE_INVALID: {
    title: "Vault mode unavailable",
    instruction: "That vault protection action is not available in the current mode.",
  },
  E_VAULT_MASTER_PASSWORD_INVALID: {
    title: "Current password not accepted",
    instruction: "Check the current Password lock credential and try again.",
  },
  E_PIN_INVALID: {
    title: "PIN format invalid",
    instruction: "Use digits only. New mobile PIN setups require at least 6 digits and must not be too common.",
  },
  E_BIOMETRIC_INVALIDATED: {
    title: "Biometric unlock needs attention",
    instruction: "Your biometric settings changed. Re-enable Touch ID / Face ID in Security settings.",
  },
  E_PIN_REQUIRED: {
    title: "PIN required",
    instruction: "Set an app PIN before using this security option.",
  },
  E_RECOVERY_CODE_INVALID: {
    title: "Recovery secret not accepted",
    instruction: "Check the recovery secret and try again.",
  },
  E_RECOVERY_CODES_UNAVAILABLE: {
    title: "No recovery secret configured",
    instruction: "Create a recovery secret in Settings > Security first.",
  },
  E_URI_INVALID: {
    title: "Setup link not recognized",
    instruction: "Paste a valid 2FA setup link. It usually starts with otpauth://.",
  },
  E_SCAN_NO_QR: {
    title: "No QR code found",
    instruction: "Select a larger area around the QR code and try again.",
  },
  E_SECRET_INVALID: {
    title: "Secret is invalid",
    instruction: "Use Base32 characters only (A-Z and 2-7).",
  },
  E_DIGITS_INVALID: {
    title: "Digits setting invalid",
    instruction: "Choose either 6 or 8 digits.",
  },
  E_PERIOD_INVALID: {
    title: "Period setting invalid",
    instruction: "Use a whole number between 1 and 300 seconds.",
  },
  E_ALGORITHM_INVALID: {
    title: "Algorithm invalid",
    instruction: "Choose SHA1, SHA256, or SHA512.",
  },
  E_PASSPHRASE_INVALID: {
    title: "Passphrase too short",
    instruction: "Use a passphrase with at least 8 characters.",
  },
  E_BACKUP_FILE_INVALID: {
    title: "Backup file invalid",
    instruction: "Select a valid encrypted backup JSON file.",
  },
  E_BACKUP_DECRYPT_FAILED: {
    title: "Could not decrypt backup",
    instruction: "Check your passphrase and try importing again.",
  },
  E_SETTINGS_INVALID: {
    title: "Settings not accepted",
    instruction: "Review the selected options and try saving again.",
  },
  E_INTERNAL: {
    title: "Unexpected issue",
    instruction: "Please try again. If it keeps happening, restart the app.",
  },
  E_APP_RESTART_REQUIRED: {
    title: "Restart required",
    instruction: "Restart the desktop app to load the latest recovery flow, then try again.",
  },
};

type ErrorLike = {
  code?: unknown;
  message?: unknown;
};

function pickCode(value: unknown): string {
  if (!value || typeof value !== "object") return "E_INTERNAL";
  const candidate = (value as ErrorLike).code;
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : "E_INTERNAL";
}

function pickMessage(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = (value as ErrorLike).message;
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : undefined;
}

export type UiError = {
  code: string;
  title: string;
  instruction: string;
};

export function toUiError(error: unknown): UiError {
  const code = pickCode(error);
  const mapped = ERROR_MAP[code] ?? ERROR_MAP.E_INTERNAL;
  const message = pickMessage(error);
  if (!message) {
    return { code, ...mapped };
  }

  if (code in ERROR_MAP) {
    return { code, ...mapped };
  }

  return {
    code,
    title: "Action failed",
    instruction: message,
  };
}

export function toUiErrorText(error: unknown): string {
  const resolved = toUiError(error);
  return `${resolved.title}. ${resolved.instruction} (Code: ${resolved.code})`;
}

export function isStepUpRequiredError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as ErrorLike).code;
  return code === "E_STEP_UP_REQUIRED";
}
