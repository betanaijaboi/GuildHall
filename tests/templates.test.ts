import { describe, expect, it } from "vitest";
import { templateFiles } from "@/lib/github/templates";

const file = (engine: string, path: string) => templateFiles(engine, "Demo").find((f) => f.path === path)?.content ?? "";

describe("templateFiles", () => {
  it("routes Unreal assets to LFS as lockable and ignores build output", () => {
    expect(file("unreal", ".gitattributes")).toContain("*.uasset filter=lfs diff=lfs merge=lfs -text lockable");
    expect(file("unreal", ".gitattributes")).toContain("*.umap filter=lfs");
    expect(file("unreal", ".gitignore")).toContain("DerivedDataCache/");
  });

  it("uses Unity smart merge for scenes and skips LFS on CI checkout", () => {
    expect(file("unity", ".gitattributes")).toContain("*.unity merge=unityyamlmerge");
    expect(file("unity", ".gitignore")).toContain("/[Ll]ibrary/");
    expect(file("unity", ".github/workflows/unity-ci.yml")).toContain("lfs: false");
  });

  it("ignores Godot's cache and adds a web export workflow", () => {
    expect(file("godot", ".gitignore")).toContain(".godot/");
    expect(file("godot", ".gitignore")).not.toContain("export_presets.cfg");
    expect(file("godot", ".github/workflows/godot-ci.yml")).toContain("--export-release");
  });

  it("always adds issue templates and credits, with no duplicate paths", () => {
    for (const engine of ["unity", "unreal", "godot", "custom"]) {
      const files = templateFiles(engine, "Demo");
      expect(new Set(files.map((f) => f.path)).size).toBe(files.length);
      expect(files.map((f) => f.path)).toEqual(expect.arrayContaining([".gitattributes", "CREDITS.md", ".github/ISSUE_TEMPLATE/playtest-report.md"]));
    }
  });
});
