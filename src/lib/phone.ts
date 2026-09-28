/**
 * Utility functions for normalizing phone numbers across Angola
 * Supports formats:
 * - "+244 923 000 000"
 * - "244923000000"
 * - "+244923000000"
 * - "923000000"
 * - "923 000 000"
 * - "923-000-000"
 */

export function getPhoneCoreDigits(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("244") && digits.length === 12) {
    return digits.slice(3);
  }
  if (digits.length >= 9) {
    return digits.slice(-9);
  }
  return digits;
}

export function normalizePhoneNumber(raw: string | null | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return trimmed;

  const core = getPhoneCoreDigits(trimmed);
  if (core.length === 9 && core.startsWith("9")) {
    return `+244 ${core.slice(0, 3)} ${core.slice(3, 6)} ${core.slice(6)}`;
  }
  if (core.length === 9) {
    return `${core.slice(0, 3)} ${core.slice(3, 6)} ${core.slice(6)}`;
  }
  return trimmed;
}

export function isPhoneNumberInput(input: string): boolean {
  if (!input) return false;
  if (input.includes("@")) return false;
  const digits = input.replace(/\D/g, "");
  return digits.length >= 7;
}
