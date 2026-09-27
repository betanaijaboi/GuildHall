import { describe, expect, it } from "vitest";
import { assetStatus, formatTimecode, normalisePin, sniffFile } from "@/lib/assets";

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));

describe("sniffFile", () => {
  it("identifies supported formats from magic bytes", () => {
    expect(sniffFile(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], [0, 0]))).toMatchObject({ mime: "image/png", kind: "image" });
    expect(sniffFile(bytes([0xff, 0xd8, 0xff, 0xe0])))?.toMatchObject({ ext: "jpg" });
    expect(sniffFile(bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 "))).toMatchObject({ mime: "image/webp" });
    expect(sniffFile(bytes([0, 0, 0, 0x18], "ftypmp42"))).toMatchObject({ kind: "video", ext: "mp4" });
    expect(sniffFile(bytes([0x1a, 0x45, 0xdf, 0xa3]))).toMatchObject({ mime: "video/webm" });
    expect(sniffFile(bytes("glTF", [2, 0, 0, 0]))).toMatchObject({ kind: "model", ext: "glb" });
  });

  it("rejects SVG, HTML and unknown data regardless of name", () => {
    expect(sniffFile(bytes('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(sniffFile(bytes("<!doctype html><script>"))).toBeNull();
    expect(sniffFile(bytes([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))).toBeNull();
  });
});

describe("assetStatus", () => {
  const t = (n: number) => new Date(2026, 0, 1, 0, n);
  it("uses the latest decision on the latest version", () => {
    const reviews = [
      { versionId: "v1", decision: "approved" as const, createdAt: t(1) },
      { versionId: "v2", decision: "changes_requested" as const, createdAt: t(2) },
      { versionId: "v2", decision: "approved" as const, createdAt: t(3) },
    ];
    expect(assetStatus("v2", reviews)).toBe("approved");
    expect(assetStatus("v3", reviews)).toBe("in_review");
  });
});

describe("normalisePin", () => {
  it("keeps only valid fields for the asset kind", () => {
    expect(normalisePin("image", { x: 0.5, y: 0.25, timeSec: 3 })).toEqual({ x: 0.5, y: 0.25, timeSec: undefined });
    expect(normalisePin("image", { x: 1.5, y: 0.2 })).toEqual({ x: undefined, y: undefined, timeSec: undefined });
    expect(normalisePin("video", { x: 0.1, y: 0.9, timeSec: 12.5 })).toEqual({ x: 0.1, y: 0.9, timeSec: 12.5 });
    expect(normalisePin("model", { position3d: "0.1m 1.2m -0.3m", normal3d: "0m 1m 0m" })).toEqual({ position3d: "0.1m 1.2m -0.3m", normal3d: "0m 1m 0m" });
    expect(normalisePin("model", { position3d: "alert(1)" })).toEqual({ position3d: undefined, normal3d: undefined });
  });

  it("formats timecodes", () => {
    expect(formatTimecode(75.5)).toBe("1:15.50");
  });
});
