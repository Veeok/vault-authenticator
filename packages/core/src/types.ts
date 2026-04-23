export type Algorithm = "SHA1" | "SHA256" | "SHA512";

export interface TotpAccountDisplay {
  issuer: string;
  label: string;
  digits: 6 | 8;
  period: number;
  algorithm: Algorithm;
}

export interface TotpSecretMaterial {
  secretBase32: string;
}

export interface TotpAccount extends TotpAccountDisplay, TotpSecretMaterial {}

export interface RendererAccountDetail extends TotpAccountDisplay {
  id: string;
}

export interface StoredTotpAccount extends TotpAccount {
  id: string;
}

export interface AccountMeta {
  id: string;
  issuer: string;
  label: string;
  digits: number;
  period: number;
}

export interface CodeResult {
  id: string;
  code: string;
  remainingSeconds: number;
}
