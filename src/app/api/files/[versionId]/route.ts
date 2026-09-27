import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { assets, assetVersions } from "@/db/schema";
import { getRole } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { readFileStream } from "@/lib/storage";

/** Serves an asset version to project members, with Range support so video can seek. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(versionId)) return new NextResponse("Not found", { status: 404 });
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const [row] = await db
    .select({ version: assetVersions, projectId: assets.projectId })
    .from(assetVersions)
    .innerJoin(assets, eq(assets.id, assetVersions.assetId))
    .where(eq(assetVersions.id, versionId))
    .limit(1);
  if (!row || !(await getRole(row.projectId, user.id))) return new NextResponse("Not found", { status: 404 });

  const { size, mime, fileKey } = row.version;
  const headers: Record<string, string> = {
    "Content-Type": mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Content-Disposition": "inline",
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    return new NextResponse(readFileStream(fileKey, { start, end }), {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  return new NextResponse(readFileStream(fileKey), { headers: { ...headers, "Content-Length": String(size) } });
}
