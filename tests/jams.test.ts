import { describe, expect, it } from "vitest";
import { formatCountdown, jamPhase, nextReminder, remindersDue, validSubmission, visibleTheme } from "@/lib/jams";

const h = (n: number) => new Date(Date.UTC(2026, 9, 1) + n * 3_600_000);
const jam = { startsAt: h(0), endsAt: h(48), theme: "Borrowed", hostId: "host" };

describe("jam phases and theme", () => {
  it("moves through upcoming, running and ended", () => {
    expect(jamPhase(jam, h(-1))).toBe("upcoming");
    expect(jamPhase(jam, h(0))).toBe("running");
    expect(jamPhase(jam, h(48))).toBe("ended");
  });
  it("keeps the theme secret until the start, except from the host", () => {
    expect(visibleTheme(jam, "someone", h(-1))).toBeNull();
    expect(visibleTheme(jam, null, h(-1))).toBeNull();
    expect(visibleTheme(jam, "host", h(-1))).toBe("Borrowed");
    expect(visibleTheme(jam, null, h(0))).toBe("Borrowed");
    expect(visibleTheme({ ...jam, theme: "" }, null, h(5))).toBeNull();
  });
});

describe("deadline reminders", () => {
  it("are due at 24h, 1h and the end", () => {
    expect(remindersDue(jam, h(-5))).toBe(0);
    expect(remindersDue(jam, h(10))).toBe(0);
    expect(remindersDue(jam, h(24))).toBe(1);
    expect(remindersDue(jam, h(47))).toBe(2);
    expect(remindersDue(jam, h(49))).toBe(3);
  });
  it("only send the latest due reminder, never a backlog", () => {
    expect(nextReminder(0, 3)).toMatchObject({ index: 3, text: expect.stringContaining("over") });
    expect(nextReminder(1, 2)!.text).toContain("1 hour left");
    expect(nextReminder(2, 2)).toBeNull();
  });
  it("skip the 24h reminder for jams shorter than a day", () => {
    const short = { startsAt: h(0), endsAt: h(6) };
    expect(remindersDue(short, h(1))).toBe(1);
  });
});

describe("submissions", () => {
  it("need https, and an itch.io page for itch jams", () => {
    expect(validSubmission("https://me.itch.io/storm", true)).toBeNull();
    expect(validSubmission("https://example.com/storm", true)).toMatch(/itch.io/);
    expect(validSubmission("https://example.com/storm", false)).toBeNull();
    expect(validSubmission("http://me.itch.io/x", false)).toMatch(/https/);
    expect(validSubmission("javascript:alert(1)", false)).toMatch(/https/);
    expect(validSubmission("storm", false)).toMatch(/full link/);
  });
  it("formats countdowns", () => {
    expect(formatCountdown(90 * 60_000)).toBe("1h 30m");
    expect(formatCountdown(26 * 3_600_000)).toBe("1d 2h");
    expect(formatCountdown(-5)).toBe("0m");
  });
});
