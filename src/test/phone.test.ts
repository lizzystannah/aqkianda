import { describe, it, expect } from "vitest";
import { normalizePhoneNumber, getPhoneCoreDigits, isPhoneNumberInput } from "../lib/phone";

describe("Phone Normalization", () => {
  it("normalizes 2449xxxxxxxx without +", () => {
    expect(normalizePhoneNumber("244923000000")).toBe("+244 923 000 000");
    expect(getPhoneCoreDigits("244923000000")).toBe("923000000");
  });

  it("normalizes +2449xxxxxxxx with +", () => {
    expect(normalizePhoneNumber("+244923000000")).toBe("+244 923 000 000");
    expect(getPhoneCoreDigits("+244923000000")).toBe("923000000");
  });

  it("normalizes 9xxxxxxxxx (9 digits without prefix)", () => {
    expect(normalizePhoneNumber("923000000")).toBe("+244 923 000 000");
    expect(getPhoneCoreDigits("923000000")).toBe("923000000");
  });

  it("normalizes 9xx xxx xxx (with spaces)", () => {
    expect(normalizePhoneNumber("923 000 000")).toBe("+244 923 000 000");
    expect(getPhoneCoreDigits("923 000 000")).toBe("923000000");
  });

  it("normalizes phone with hyphens and parentheses", () => {
    expect(normalizePhoneNumber("(244) 923-000-000")).toBe("+244 923 000 000");
    expect(getPhoneCoreDigits("(244) 923-000-000")).toBe("923000000");
  });

  it("correctly identifies phone inputs vs email inputs", () => {
    expect(isPhoneNumberInput("923000000")).toBe(true);
    expect(isPhoneNumberInput("244923000000")).toBe(true);
    expect(isPhoneNumberInput("+244 923 000 000")).toBe(true);
    expect(isPhoneNumberInput("user@email.ao")).toBe(false);
  });
});
