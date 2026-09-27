/**
 * Asset review rules. Pure functions so they're unit-tested; DB code lives in the actions.
 */

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export type SniffedFile = { kind: "image" | "video" | "model"; mime: string; ext: string };

const startsWith = (b: Uint8Array, sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v);
const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));

/**
 * Identify an upload from its bytes, never from the client's filename or Content-Type.
 * SVG and HTML are deliberately unsupported (they can carry script).
 */
export function sniffFile(bytes: Uint8Array): SniffedFile | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { kind: "image", mime: "image/png", ext: "png" };
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { kind: "image", mime: "image/jpeg", ext: "jpg" };
  if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") return { kind: "image", mime: "image/gif", ext: "gif" };
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return { kind: "image", mime: "image/webp", ext: "webp" };
  if (ascii(bytes, 4, 8) === "ftyp") return { kind: "video", mime: "video/mp4", ext: "mp4" };
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return { kind: "video", mime: "video/webm", ext: "webm" };
  if (ascii(bytes, 0, 4) === "glTF") return { kind: "model", mime: "model/gltf-binary", ext: "glb" };
  return null;
}

export type Decision = "approved" | "changes_requested";
export type AssetStatus = "in_review" | "changes_requested" | "approved";

/** Status of an asset = the latest decision on its latest version; a new version resets to in_review. */
export function assetStatus(latestVersionId: string, reviews: { versionId: string; decision: Decision; createdAt: Date }[]): AssetStatus {
  const onLatest = reviews.filter((r) => r.versionId === latestVersionId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return onLatest[0]?.decision ?? "in_review";
}

export type PinInput = { x?: number; y?: number; timeSec?: number; position3d?: string; normal3d?: string };

const VEC3 = /^-?\d+(\.\d+)?(e-?\d+)?m? -?\d+(\.\d+)?(e-?\d+)?m? -?\d+(\.\d+)?(e-?\d+)?m?$/;

/** Validate a pin for the asset kind; returns only the fields that apply. */
export function normalisePin(kind: SniffedFile["kind"], pin: PinInput): PinInput {
  const unit = (v: number | undefined) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1 ? v : undefined);
  if (kind === "model") {
    const position3d = pin.position3d && VEC3.test(pin.position3d) ? pin.position3d : undefined;
    const normal3d = position3d && pin.normal3d && VEC3.test(pin.normal3d) ? pin.normal3d : undefined;
    return { position3d, normal3d };
  }
  const x = unit(pin.x);
  const y = unit(pin.y);
  const both = x !== undefined && y !== undefined;
  const timeSec = kind === "video" && typeof pin.timeSec === "number" && Number.isFinite(pin.timeSec) && pin.timeSec >= 0 ? pin.timeSec : undefined;
  return { x: both ? x : undefined, y: both ? y : undefined, timeSec };
}

export function formatTimecode(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const f = Math.floor((sec % 1) * 100);
  return `${m}:${String(s).padStart(2, "0")}.${String(f).padStart(2, "0")}`;
}
