import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { runWeekly } from "@/lib/automations-db";
import { runJamReminders } from "@/lib/jams-db";
import { runWeeklyDigests } from "@/lib/alerts-db";
import { pruneAnalytics } from "@/lib/analytics-db";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/mailer";

/** Hourly cron hook for weekly automations, jam deadline reminders and weekly digests: `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const now = new Date();
  await pruneAnalytics(db, now);
  return NextResponse.json({ fired: await runWeekly(db, now), jamReminders: await runJamReminders(db, now), digests: await runWeeklyDigests(db, now, sendEmail, env.appUrl) });
}
