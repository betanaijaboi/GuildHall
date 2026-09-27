import { describe, expect, it } from "vitest";
import { normaliseRecap, ruleRecap, toTaskTitle, transcriptFor } from "@/lib/huddles";

const people = [{ name: "Amara", handle: "amara" }, { name: "Mei", handle: "mei" }];

describe("toTaskTitle", () => {
  it("turns commitments into imperative titles", () => {
    expect(toTaskTitle("OK so I'll fix the dock shader tonight.")).toBe("Fix the dock shader tonight");
    expect(toTaskTitle("- [ ] export the storm presets")).toBe("Export the storm presets");
    expect(toTaskTitle("TODO @mei profile the web build")).toBe("Profile the web build");
    expect(toTaskTitle("can you send the capsule art?")).toBe("Send the capsule art");
  });
});

describe("ruleRecap", () => {
  it("finds decisions and owned follow-ups in captions and notes", () => {
    const r = ruleRecap(
      [
        { speaker: "Amara", handle: "amara", text: "We decided to ship the storm level first" },
        { speaker: "Mei", handle: "mei", text: "I'll fix the dock shader tonight" },
        { speaker: "Amara", handle: "amara", text: "The weather is nice" },
        { speaker: "Amara", handle: "amara", text: "Can you ping @mei about the export presets" },
      ],
      "Decision: web build first\nTODO update the GDD overview\n- [ ] Fix the dock shader tonight",
      people,
      12.4,
    );
    expect(r.source).toBe("rules");
    expect(r.decisions).toEqual(["Web build first", "We decided to ship the storm level first"]);
    expect(r.actions).toEqual([
      { title: "Update the GDD overview", owner: null },
      { title: "Fix the dock shader tonight", owner: null },
      { title: "Ping @mei about the export presets", owner: "mei" },
    ]);
    expect(r.summary).toBe("12-minute huddle with Amara, Mei. From 4 captioned lines and shared notes: 2 decisions and 3 follow-ups.");
  });

  it("handles a silent call", () => {
    const r = ruleRecap([], "", [], 0.2);
    expect(r).toMatchObject({ decisions: [], actions: [] });
    expect(r.summary).toBe("1-minute huddle with the team. No captions or notes. 0 decisions and 0 follow-ups.");
  });
});

describe("normaliseRecap", () => {
  it("drops owners who weren't on the call and bounds sizes", () => {
    const r = normaliseRecap(
      { summary: " ok ", decisions: ["a", " "], actions: [{ title: "Fix it", owner: "@Mei" }, { title: "Hack the planet", owner: "stranger" }, { title: "x", owner: null }] },
      people,
    );
    expect(r).toEqual({ summary: "ok", decisions: ["a"], actions: [{ title: "Fix it", owner: "mei" }, { title: "Hack the planet", owner: null }], source: "ai" });
  });
});

describe("transcriptFor", () => {
  it("keeps the latest captions when trimming", () => {
    const lines = Array.from({ length: 50 }, (_, i) => ({ speaker: "A", handle: "a", text: `line ${i}` }));
    const t = transcriptFor(lines, "", 100);
    expect(t).toContain("[earlier captions trimmed]");
    expect(t).toContain("line 49");
    expect(t).not.toContain("line 1\n");
  });
});
