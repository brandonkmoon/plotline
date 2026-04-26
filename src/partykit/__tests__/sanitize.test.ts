import { describe, it, expect } from "vitest";
import { sanitize } from "../constants";

describe("sanitize", () => {
  it("strips HTML tags", () => {
    expect(sanitize("<script>alert('hi')</script>", 100)).toBe("alert('hi')");
    expect(sanitize("<b>bold</b>", 100)).toBe("bold");
    expect(sanitize("<img src=x onerror=alert(1)>", 100)).toBe("");
  });

  it("escapes special characters", () => {
    expect(sanitize("a & b", 100)).toBe("a &amp; b");
    expect(sanitize("a < b", 100)).toBe("a &lt; b");
    expect(sanitize("a > b", 100)).toBe("a &gt; b");
  });

  it("trims whitespace", () => {
    expect(sanitize("  hello  ", 100)).toBe("hello");
    expect(sanitize("\n\t test \n", 100)).toBe("test");
  });

  it("enforces max length", () => {
    expect(sanitize("abcdefghij", 5)).toBe("abcde");
    expect(sanitize("short", 100)).toBe("short");
  });

  it("handles empty string", () => {
    expect(sanitize("", 100)).toBe("");
  });

  it("handles string of only tags", () => {
    expect(sanitize("<div><span></span></div>", 100)).toBe("");
  });

  it("preserves normal game responses", () => {
    expect(sanitize("a retired sword swallower with trust issues", 500))
      .toBe("a retired sword swallower with trust issues");
    expect(sanitize("I didn't know you worked here.", 500))
      .toBe("I didn't know you worked here.");
  });
});
