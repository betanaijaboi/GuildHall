/**
 * Engine repo templates applied via a pull request (never pushed straight to the default branch).
 * Keeps binaries in Git LFS and marks unmergeable ones `lockable`, per github-integration.md §5.
 */

export type TemplateFile = { path: string; content: string };

const lfs = (patterns: string[], lockable = true) =>
  patterns.map((p) => `${p} filter=lfs diff=lfs merge=lfs -text${lockable ? " lockable" : ""}`).join("\n");

const COMMON_BINARIES = [
  "*.png", "*.jpg", "*.jpeg", "*.psd", "*.tga", "*.tif", "*.exr", "*.hdr",
  "*.fbx", "*.obj", "*.blend", "*.glb", "*.gltf",
  "*.wav", "*.mp3", "*.ogg", "*.flac",
  "*.mp4", "*.mov",
  "*.ttf", "*.otf",
];

const ENGINE_FILES: Record<string, { gitignore: string; lfs: string[]; extraAttributes?: string; ci?: TemplateFile }> = {
  unity: {
    gitignore: [
      "/[Ll]ibrary/", "/[Tt]emp/", "/[Oo]bj/", "/[Bb]uild/", "/[Bb]uilds/", "/[Ll]ogs/", "/[Uu]ser[Ss]ettings/",
      "/[Mm]emoryCaptures/", "*.csproj", "*.sln", "*.pidb.meta", "*.pdb.meta", ".vs/", ".idea/", "*.apk", "*.aab",
    ].join("\n"),
    lfs: [...COMMON_BINARIES, "*.unitypackage", "*.cubemap"],
    extraAttributes: ["*.unity merge=unityyamlmerge eol=lf", "*.prefab merge=unityyamlmerge eol=lf", "*.meta eol=lf"].join("\n"),
    ci: {
      path: ".github/workflows/unity-ci.yml",
      content: `name: Unity CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          lfs: false # LFS bandwidth is metered; enable only for jobs that need assets.
      - uses: game-ci/unity-test-runner@v4
        env:
          UNITY_LICENSE: \${{ secrets.UNITY_LICENSE }}
          UNITY_EMAIL: \${{ secrets.UNITY_EMAIL }}
          UNITY_PASSWORD: \${{ secrets.UNITY_PASSWORD }}
`,
    },
  },
  unreal: {
    gitignore: [
      "Binaries/", "DerivedDataCache/", "Intermediate/", "Saved/", ".vs/", ".idea/",
      "*.sln", "*.VC.db", "*.opensdf", "*.sdf", "Plugins/*/Binaries/", "Plugins/*/Intermediate/",
    ].join("\n"),
    lfs: [...COMMON_BINARIES, "*.uasset", "*.umap", "*.ubulk", "*.upk"],
  },
  godot: {
    gitignore: [".godot/", ".import/", "*.translation", ".mono/", "data_*/", "mono_crash.*.json"].join("\n"),
    lfs: [...COMMON_BINARIES, "*.res", "*.scn"],
    ci: {
      path: ".github/workflows/godot-ci.yml",
      content: `name: Godot CI
on: [push, pull_request]
jobs:
  export-web:
    runs-on: ubuntu-latest
    container: barichello/godot-ci:4.3
    steps:
      - uses: actions/checkout@v4
        with:
          lfs: true
      - name: Web export
        run: |
          mkdir -p build/web
          godot --headless --export-release "Web" build/web/index.html
      - uses: actions/upload-artifact@v4
        with:
          name: web-build
          path: build/web
`,
    },
  },
};

const ISSUE_TEMPLATES: TemplateFile[] = [
  {
    path: ".github/ISSUE_TEMPLATE/bug.md",
    content: `---\nname: Bug\nabout: Something is broken\nlabels: bug\n---\n\n**What happened**\n\n**Steps to reproduce**\n\n**Build / platform**\n`,
  },
  {
    path: ".github/ISSUE_TEMPLATE/art-request.md",
    content: `---\nname: Art request\nabout: Request an asset from the art team\nlabels: art\n---\n\n**Asset**\n\n**References**\n\n**Technical constraints** (poly budget, texture size, format)\n\n**Needed by**\n`,
  },
  {
    path: ".github/ISSUE_TEMPLATE/playtest-report.md",
    content: `---\nname: Playtest report\nabout: Feedback from a playtest session\nlabels: playtest\n---\n\n**Build**\n\n**What felt good**\n\n**What was confusing or frustrating**\n\n**Bugs seen**\n`,
  },
];

export function templateFiles(engine: string, projectName: string): TemplateFile[] {
  const e = ENGINE_FILES[engine];
  const files: TemplateFile[] = [];
  const attributes = [
    "# Managed by Guildhall. Binary assets go to Git LFS; `lockable` files can be locked with `git lfs lock`.",
    "* text=auto",
    lfs(e?.lfs ?? COMMON_BINARIES),
    e?.extraAttributes ?? "",
  ].filter(Boolean).join("\n");
  files.push({ path: ".gitattributes", content: `${attributes}\n` });
  if (e) files.push({ path: ".gitignore", content: `${e.gitignore}\n` });
  if (e?.ci) files.push(e.ci);
  files.push(...ISSUE_TEMPLATES);
  files.push({
    path: "CREDITS.md",
    content: `# ${projectName} — Credits\n\nMaintained on Guildhall. Add yourself when you join the project.\n\n| Name | Role |\n|---|---|\n`,
  });
  files.push({
    path: "CONTRIBUTING.md",
    content: `# Contributing to ${projectName}\n\n- Binary assets are stored with Git LFS. Run \`git lfs install\` once before cloning.\n- Lock unmergeable files before editing: \`git lfs lock <path>\`, and unlock when done.\n- Open a pull request for every change; link the Guildhall task or GitHub issue it closes.\n`,
  });
  return files;
}
