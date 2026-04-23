import { randomUUID } from "node:crypto";
import {
  clearPasskeyCredential as clearStoredPasskeyCredential,
  loadPasskeyCredentials,
  savePasskeyCredentials,
  type PasskeyCredentialRecord,
} from "./secure-store";

export type PasskeySummary = {
  id: string;
  name: string;
  credentialId: string;
};

function normalizePasskeyName(input: string | undefined, fallback: string): string {
  const raw = (input ?? "").trim();
  if (!raw) return fallback;
  return raw.length > 80 ? raw.slice(0, 80) : raw;
}

function nextPasskeyName(records: PasskeyCredentialRecord[]): string {
  return `Passkey ${records.length + 1}`;
}

export function listPasskeyCredentials(): PasskeyCredentialRecord[] {
  return loadPasskeyCredentials();
}

export function listPasskeySummaries(): PasskeySummary[] {
  return listPasskeyCredentials().map((item) => ({
    id: item.id,
    name: item.name,
    credentialId: item.credentialId,
  }));
}

export function savePasskeyCredential(
  credentialId: string,
  publicKey: string,
  name?: string,
  signCount = 0
): { id: string; name: string; credentialId: string } {
  const records = listPasskeyCredentials();
  const existingIndex = records.findIndex((item) => item.credentialId === credentialId);
  const fallbackName = nextPasskeyName(records);

  if (existingIndex >= 0) {
    const existing = records[existingIndex];
    const updated: PasskeyCredentialRecord = {
      ...existing,
      publicKey,
      name: normalizePasskeyName(name, existing.name || fallbackName),
      signCount,
    };
    records[existingIndex] = updated;
    savePasskeyCredentials(records);
    return { id: updated.id, name: updated.name, credentialId: updated.credentialId };
  }

  const created: PasskeyCredentialRecord = {
    id: randomUUID().replace(/-/g, "").slice(0, 16),
    name: normalizePasskeyName(name, fallbackName),
    credentialId,
    publicKey,
    signCount,
  };
  records.push(created);
  savePasskeyCredentials(records);
  return { id: created.id, name: created.name, credentialId: created.credentialId };
}

export function renamePasskeyCredential(id: string, name: string): boolean {
  const records = listPasskeyCredentials();
  const index = records.findIndex((item) => item.id === id);
  if (index < 0) return false;

  const nextName = normalizePasskeyName(name, records[index].name);
  if (nextName === records[index].name) return true;
  records[index] = { ...records[index], name: nextName };
  savePasskeyCredentials(records);
  return true;
}

export function removePasskeyCredential(id: string): boolean {
  const records = listPasskeyCredentials();
  const next = records.filter((item) => item.id !== id);
  if (next.length === records.length) return false;
  savePasskeyCredentials(next);
  return true;
}

export function updatePasskeyCredentialSignCount(credentialId: string, signCount: number): boolean {
  const records = listPasskeyCredentials();
  const index = records.findIndex((item) => item.credentialId === credentialId);
  if (index < 0) return false;
  records[index] = {
    ...records[index],
    signCount,
  };
  savePasskeyCredentials(records);
  return true;
}

export function getPasskeyCredential(): { credentialId: string; publicKey: string } | null {
  const first = listPasskeyCredentials()[0];
  if (!first) return null;
  return {
    credentialId: first.credentialId,
    publicKey: first.publicKey,
  };
}

export function clearPasskeyCredential(): void {
  clearStoredPasskeyCredential();
}

export function hasPasskeyCredential(): boolean {
  return listPasskeyCredentials().length > 0;
}
