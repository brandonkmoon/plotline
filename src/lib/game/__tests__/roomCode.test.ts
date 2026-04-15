import { describe, it, expect } from "vitest";
import {
  generateRoomCode,
  generateUniqueRoomCode,
  VALID_CHARS,
} from "../roomCode";

describe("VALID_CHARS", () => {
  it("excludes I, O, 0, and 1", () => {
    expect(VALID_CHARS).not.toContain("I");
    expect(VALID_CHARS).not.toContain("O");
    expect(VALID_CHARS).not.toContain("0");
    expect(VALID_CHARS).not.toContain("1");
  });

  it("contains only uppercase letters and digits", () => {
    for (const ch of VALID_CHARS) {
      expect(ch).toMatch(/[A-Z2-9]/);
    }
  });
});

describe("generateRoomCode", () => {
  it("produces a 4-character string", () => {
    const code = generateRoomCode();
    expect(code).toHaveLength(4);
  });

  it("only uses valid characters", () => {
    for (let i = 0; i < 100; i++) {
      const code = generateRoomCode();
      for (const ch of code) {
        expect(VALID_CHARS).toContain(ch);
      }
    }
  });
});

describe("generateUniqueRoomCode", () => {
  it("produces a code not in the existing list", () => {
    const existing = ["ABCD", "EFGH", "JKLM"];
    const code = generateUniqueRoomCode(existing);
    expect(existing).not.toContain(code);
  });

  it("handles empty existing list", () => {
    const code = generateUniqueRoomCode([]);
    expect(code).toHaveLength(4);
  });
});
