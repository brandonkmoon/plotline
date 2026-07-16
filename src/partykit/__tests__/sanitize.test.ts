import { describe, it, expect } from "vitest";
import { sanitize } from "../constants";

describe("sanitize", () => {
  it("strips HTML tags", () => {
    expect(sanitize("<script>alert('hi')</script>", 100)).toBe("alert('hi')");
    expect(sanitize("<b>bold</b>", 100)).toBe("bold");
    expect(sanitize("<img src=x onerror=alert(1)>", 100)).toBe("");
  });

  it("leaves special characters raw for the renderer to escape once", () => {
    // Tag-stripping is the XSS defense; entity-escaping is left to each output
    // sink (React/RN/satori all auto-escape), so we don't double-encode here.
    expect(sanitize("a & b", 100)).toBe("a & b");
    expect(sanitize("Tom & Jerry", 100)).toBe("Tom & Jerry");
    // A bare "<" that isn't a complete tag survives tag-stripping but is inert
    // once the renderer escapes it on output.
    expect(sanitize("a < b", 100)).toBe("a < b");
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
