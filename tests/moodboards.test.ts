import { describe, expect, it } from "vitest";
import { normaliseHex, safeImageUrl, textOn } from "@/lib/moodboards";

describe("moodboard helpers", () => {
  it("only accepts plain https image links", () => {
    expect(safeImageUrl(" https://cdna.artstation.com/p/x.jpg ")).toBe("https://cdna.artstation.com/p/x.jpg");
    expect(safeImageUrl("http://example.com/x.png")).toBeNull();
    expect(safeImageUrl("javascript:alert(1)")).toBeNull();
    expect(safeImageUrl("data:image/png;base64,AAAA")).toBeNull();
    expect(safeImageUrl("https://user:pw@example.com/x.png")).toBeNull();
    expect(safeImageUrl("not a url")).toBeNull();
  });
  it("normalises hex colours and picks readable text", () => {
    expect(normaliseHex("1D4E89")).toBe("#1d4e89");
    expect(normaliseHex("#abc")).toBe("#aabbcc");
    expect(normaliseHex("red")).toBeNull();
    expect(textOn("#ffffff")).toBe("#000000");
    expect(textOn("#1d4e89")).toBe("#ffffff");
  });
});
