import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { feedbackKeys } from "@/db/schema";
import { sniffFile } from "@/lib/assets";
import { hashKey, KEY_PREFIX, MAX_SCREENSHOT_BYTES, RateLimiter, sdkReportSchema } from "@/lib/feedback";
import { ingestSdkReport } from "@/lib/feedback-db";
import { putFile } from "@/lib/storage";

const limiter = new RateLimiter(20, 10);
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status: number) => NextResponse.json(body, { status, headers: CORS });

/** Web builds (HTML5 exports) call this cross-origin. The key is the only credential; no cookies. */
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/**
 * In-game reporter: `POST /api/feedback` with `Authorization: Bearer ghfb_…` and a JSON body
 * { kind, title, description, build, platform, player, screenshot (base64 PNG/JPEG/WebP) }.
 */
export async function POST(req: NextRequest) {
  const key = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!key.startsWith(KEY_PREFIX) || key.length > 100) return json({ error: "Missing or invalid feedback key" }, 401);
  const hash = hashKey(key);
  if (!limiter.take(hash)) return json({ error: "Too many reports; try again in a minute" }, 429);
  const [row] = await db.select().from(feedbackKeys).where(eq(feedbackKeys.keyHash, hash)).limit(1);
  if (!row) return json({ error: "Missing or invalid feedback key" }, 401);

  const text = await req.text();
  if (text.length > 5_000_000) return json({ error: "Report too large" }, 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }
  const parsed = sdkReportSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Invalid report", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, 400);

  let screenshotKey: string | undefined;
  let screenshotMime: string | undefined;
  if (parsed.data.screenshot) {
    const bytes = Buffer.from(parsed.data.screenshot.replace(/^data:[^,]*,/, ""), "base64");
    const sniffed = sniffFile(bytes);
    if (!sniffed || sniffed.kind !== "image" || bytes.length > MAX_SCREENSHOT_BYTES) return json({ error: "Screenshot must be a PNG, JPEG or WebP under 3 MB" }, 400);
    screenshotKey = await putFile(bytes, sniffed.ext);
    screenshotMime = sniffed.mime;
  }
  const report = await ingestSdkReport(db, row.projectId, { ...parsed.data, screenshotKey, screenshotMime });
  await db.update(feedbackKeys).set({ lastUsedAt: new Date() }).where(eq(feedbackKeys.keyHash, hash));
  return json({ id: report.id }, 201);
}
