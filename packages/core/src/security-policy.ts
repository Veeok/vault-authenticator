export const VAULT_PASSWORD_MIN_LENGTH = 12;
export const VAULT_PASSWORD_MAX_LENGTH = 128;
export const MOBILE_PIN_MIN_LENGTH = 6;
export const MOBILE_PIN_MAX_LENGTH = 12;
export const MOBILE_PIN_RECOMMENDED_LENGTH = 8;

const COMMON_PASSWORDS = new Set([
  "123456",
  "123456789",
  "12345678",
  "12345",
  "1234567",
  "password",
  "password1",
  "password123",
  "qwerty",
  "qwerty123",
  "qwertyuiop",
  "abc123",
  "111111",
  "123123",
  "admin",
  "welcome",
  "letmein",
  "monkey",
  "dragon",
  "iloveyou",
  "sunshine",
  "princess",
  "football",
  "baseball",
  "master",
  "shadow",
  "superman",
  "ashley",
  "bailey",
  "charlie",
  "donald",
  "freedom",
  "whatever",
  "trustno1",
  "654321",
  "666666",
  "7777777",
  "888888",
  "999999",
  "1q2w3e4r",
  "1q2w3e4r5t",
  "1qaz2wsx",
  "zaq12wsx",
  "passw0rd",
  "starwars",
  "hello123",
  "welcome1",
  "login",
  "admin123",
  "root",
  "root123",
  "user",
  "test",
  "guest",
  "changeme",
  "default",
  "secret",
  "access",
  "flower",
  "hottie",
  "loveme",
  "zaq1zaq1",
  "michael",
  "jessica",
  "jennifer",
  "michelle",
  "nicole",
  "pepper",
  "computer",
  "internet",
  "hunter",
  "hunter2",
  "soccer",
  "jordan23",
  "mustang",
  "maggie",
  "batman",
  "andrew",
  "tigger",
  "ginger",
  "joshua",
  "cheese",
  "amanda",
  "summer",
  "corvette",
  "austin",
  "thomas",
  "matrix",
  "naruto",
  "pokemon",
  "buster",
  "snoopy",
  "asdfgh",
  "asdfghjkl",
  "zxcvbnm",
  "pass1234",
  "hellohello",
  "11111111",
  "121212",
  "112233",
  "000000",
]);

const COMMON_PINS = new Set([
  "000000",
  "111111",
  "121212",
  "123123",
  "123321",
  "123456",
  "1234567",
  "12345678",
  "222222",
  "333333",
  "444444",
  "555555",
  "654321",
  "666666",
  "696969",
  "777777",
  "888888",
  "999999",
  "101010",
  "112233",
]);

export type VaultPasswordPolicyIssue = "required" | "too_short" | "too_long" | "too_common";
export type MobilePinPolicyIssue = "required" | "not_numeric" | "too_short" | "too_long" | "too_common";

export function getVaultPasswordPolicyIssue(password: string): VaultPasswordPolicyIssue | null {
  const normalized = password.trim();
  if (!normalized) return "required";
  if (normalized.length < VAULT_PASSWORD_MIN_LENGTH) return "too_short";
  if (normalized.length > VAULT_PASSWORD_MAX_LENGTH) return "too_long";
  if (COMMON_PASSWORDS.has(normalized.toLowerCase())) return "too_common";
  return null;
}

export function getVaultPasswordPolicyMessage(issue: VaultPasswordPolicyIssue): string {
  if (issue === "required") return "Enter a password.";
  if (issue === "too_short") return `Use at least ${VAULT_PASSWORD_MIN_LENGTH} characters.`;
  if (issue === "too_long") return `Use ${VAULT_PASSWORD_MAX_LENGTH} characters or fewer.`;
  return "This password is too common. Choose a less common password.";
}

export function getMobilePinPolicyIssue(pin: string): MobilePinPolicyIssue | null {
  const normalized = pin.trim();
  if (!normalized) return "required";
  if (!/^\d+$/.test(normalized)) return "not_numeric";
  if (normalized.length < MOBILE_PIN_MIN_LENGTH) return "too_short";
  if (normalized.length > MOBILE_PIN_MAX_LENGTH) return "too_long";
  if (COMMON_PINS.has(normalized)) return "too_common";
  return null;
}

export function getMobilePinPolicyMessage(issue: MobilePinPolicyIssue): string {
  if (issue === "required") return "Enter your PIN.";
  if (issue === "not_numeric") return "Use digits only for your PIN.";
  if (issue === "too_short") return `Use at least ${MOBILE_PIN_MIN_LENGTH} digits for your PIN.`;
  if (issue === "too_long") return `Use ${MOBILE_PIN_MAX_LENGTH} digits or fewer for your PIN.`;
  return "That PIN is too common. Choose a less predictable PIN.";
}
