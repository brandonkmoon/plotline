import { describe, it, expect } from "vitest";
import {
  normalizeLocation,
  normalizeAction,
  normalizeDialogue,
  normalizeEnding,
} from "../normalize";

describe("normalizeLocation", () => {
  it("returns 'somewhere' for empty input", () => {
    expect(normalizeLocation("")).toBe("somewhere");
    expect(normalizeLocation("  ")).toBe("somewhere");
  });

  it("prepends 'in' when no preposition", () => {
    expect(normalizeLocation("the park")).toBe("in the park");
  });

  it("preserves existing preposition", () => {
    expect(normalizeLocation("at the zoo")).toBe("at the zoo");
  });

  it("lowercases first letter but preserves rest", () => {
    expect(normalizeLocation("IN THE FOREST")).toBe("in THE FOREST");
  });

  it("strips trailing punctuation", () => {
    expect(normalizeLocation("the park.")).toBe("in the park");
    expect(normalizeLocation("at the zoo!")).toBe("at the zoo");
  });
});

describe("normalizeAction", () => {
  it("returns default for empty input", () => {
    expect(normalizeAction("")).toBe("doing something mysterious");
  });

  it("lowercases first letter", () => {
    expect(normalizeAction("Dancing")).toBe("dancing");
  });

  it("strips trailing punctuation", () => {
    expect(normalizeAction("running fast!")).toBe("running fast");
  });
});

describe("normalizeDialogue", () => {
  it("returns '...' for empty input", () => {
    expect(normalizeDialogue("")).toBe("...");
  });

  it("strips surrounding quotes", () => {
    expect(normalizeDialogue('"hello"')).toBe("hello.");
  });

  it("preserves existing terminal punctuation", () => {
    expect(normalizeDialogue("hello!")).toBe("hello!");
  });

  it("appends period if no terminal punctuation", () => {
    expect(normalizeDialogue("hello")).toBe("hello.");
  });
});

describe("normalizeEnding", () => {
  it("returns default for empty input", () => {
    expect(normalizeEnding("")).toBe("nothing happened");
  });

  it("lowercases first letter and strips trailing punctuation", () => {
    expect(normalizeEnding("They ran away.")).toBe("they ran away");
  });
});
