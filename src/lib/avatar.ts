import { z } from "zod";

/**
 * Guildhall avatars are layered SVG characters described by a small config object.
 * Users design theirs in the avatar builder; anyone who hasn't gets a unique default
 * derived from their handle, so nobody is stuck with initials.
 */

export const SKIN_TONES = ["#fde2c8", "#f6c9a0", "#e8b184", "#d1965f", "#b07745", "#8d5a34", "#6b4226", "#4a2d1a", "#a8e6cf", "#c3b1ff"] as const;
export const HAIR_COLORS = ["#1f1b24", "#4b3526", "#8a5a33", "#d8a657", "#f2e3b3", "#b83b3b", "#e86fae", "#6d5dfc", "#2fc3d6", "#e8e8f0"] as const;
export const OUTFIT_COLORS = ["#6d5dfc", "#22b8cf", "#f59f00", "#e64980", "#2f9e44", "#e8590c", "#495057", "#f1f3f5"] as const;
export const BG_COLORS = ["#2b2150", "#12324a", "#3b1f3a", "#1f3a2c", "#3d2a14", "#1c1c2e", "#472a59", "#0f3b3b"] as const;

export const HEADS = ["round", "square", "long"] as const;
export const HAIR_STYLES = ["short", "spiky", "long", "bun", "mohawk", "afro", "hood", "none"] as const;
export const EYES = ["dots", "happy", "visor", "wink", "sleepy", "stars"] as const;
export const MOUTHS = ["smile", "grin", "flat", "open", "smirk"] as const;
export const FACIAL_HAIR = ["none", "beard", "mustache", "stubble"] as const;
export const ACCESSORIES = ["none", "headset", "glasses", "goggles", "crown", "horns", "catears", "eyepatch"] as const;
export const PATTERNS = ["none", "dots", "stripes", "stars", "grid"] as const;

export const avatarSchema = z.object({
  head: z.enum(HEADS),
  skin: z.enum(SKIN_TONES),
  hair: z.enum(HAIR_STYLES),
  hairColor: z.enum(HAIR_COLORS),
  eyes: z.enum(EYES),
  mouth: z.enum(MOUTHS),
  facialHair: z.enum(FACIAL_HAIR),
  accessory: z.enum(ACCESSORIES),
  outfit: z.enum(OUTFIT_COLORS),
  bg: z.enum(BG_COLORS),
  pattern: z.enum(PATTERNS),
  blush: z.boolean(),
  /** "photo" shows the GitHub photo instead of the character. */
  mode: z.enum(["character", "photo"]),
});

export type AvatarConfig = z.infer<typeof avatarSchema>;

/** FNV-1a — small, stable string hash for deterministic defaults. */
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function picker(seed: string) {
  let state = hash(seed) || 1;
  return <T,>(list: readonly T[]): T => {
    // xorshift32
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return list[(state >>> 0) % list.length];
  };
}

export function defaultAvatar(seed: string): AvatarConfig {
  const pick = picker(seed);
  const accessory = pick(["none", "none", "none", "headset", "glasses", "goggles", "crown", "catears"] as const);
  return {
    head: pick(HEADS),
    skin: pick(SKIN_TONES.slice(0, 8)),
    hair: pick(HAIR_STYLES.filter((h) => h !== "hood")),
    hairColor: pick(HAIR_COLORS),
    eyes: pick(["dots", "dots", "happy", "wink", "sleepy"] as const),
    mouth: pick(MOUTHS),
    facialHair: pick(["none", "none", "none", "beard", "stubble"] as const),
    accessory,
    outfit: pick(OUTFIT_COLORS),
    bg: pick(BG_COLORS),
    pattern: pick(PATTERNS),
    blush: pick([true, false]),
    mode: "character",
  };
}

export function randomAvatar(): AvatarConfig {
  return defaultAvatar(Math.random().toString(36));
}

/** Parse a stored config, falling back to the handle's default for missing or invalid data. */
export function resolveAvatar(stored: unknown, seed: string): AvatarConfig {
  const parsed = avatarSchema.safeParse(stored);
  return parsed.success ? parsed.data : defaultAvatar(seed);
}
