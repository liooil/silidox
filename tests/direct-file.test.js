const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("bun:test");

const root = path.resolve(__dirname, "..");
const pages = [
  {
    file: "index.html",
    scripts: [
      "./src/data.js",
      "./src/renderer/kerr/grid-background.js",
      "./src/renderer/kerr/kerr-lens.js",
      "./src/renderer/kerr/ring-direct.js",
      "./src/renderer/kerr/energy-flow.js",
      "./src/renderer/kerr/post-process.js",
      "./src/renderer/kerr/kerr-scene.js",
      "./src/opening-kerr.js",
      "./src/simulation.js",
      "./src/inner-landscape.js",
      "./src/ladder-editor.js",
      "./src/automation-plan.js",
      "./src/ui.js",
      "./src/app.js",
    ],
    styles: ["./styles.css"],
  },
  {
    file: "debug/index.html",
    scripts: [],
    styles: ["../styles.css", "./debug.css"],
  },
  {
    file: "debug/kerr-opening.html",
    scripts: [
      "../src/data.js",
      "../src/renderer/kerr/grid-background.js",
      "../src/renderer/kerr/kerr-lens.js",
      "../src/renderer/kerr/ring-direct.js",
      "../src/renderer/kerr/energy-flow.js",
      "../src/renderer/kerr/post-process.js",
      "../src/renderer/kerr/kerr-scene.js",
      "../src/opening-kerr.js",
      "./kerr-opening.js",
    ],
    styles: ["../styles.css", "./debug.css"],
  },
];

test("direct-file pages use classic scripts and relative assets", () => {
  for (const page of pages) {
    const htmlPath = path.join(root, page.file);
    const html = fs.readFileSync(htmlPath, "utf8");
    const baseDir = path.dirname(htmlPath);
    const scriptSources = Array.from(
      html.matchAll(/<script\s+src="([^"]+)"\s*><\/script>/g),
      (match) => match[1],
    );
    const styleSources = Array.from(
      html.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g),
      (match) => match[1],
    );

    assert.deepEqual(scriptSources, page.scripts, `${page.file} script order changed`);
    assert.deepEqual(styleSources, page.styles, `${page.file} stylesheet order changed`);
    assert.equal(/type\s*=\s*["']module["']/.test(html), false, `${page.file} uses modules`);

    for (const source of scriptSources) {
      const resolved = path.resolve(baseDir, source);
      assert.equal(
        fs.existsSync(resolved),
        true,
        `missing direct-file script in ${page.file}: ${source}`,
      );
      assert.doesNotThrow(
        () => new vm.Script(fs.readFileSync(resolved, "utf8"), { filename: resolved }),
        `invalid direct-file script syntax in ${page.file}: ${source}`,
      );
    }

    for (const source of styleSources) {
      assert.equal(
        fs.existsSync(path.resolve(baseDir, source)),
        true,
        `missing direct-file stylesheet in ${page.file}: ${source}`,
      );
    }
  }

});

test("kerr debug page exposes local timeline and canvas diagnostics", () => {
  const html = fs.readFileSync(path.join(root, "debug/kerr-opening.html"), "utf8");
  const debugSource = fs.readFileSync(path.join(root, "debug/kerr-opening.js"), "utf8");
  const openingSource = fs.readFileSync(path.join(root, "src/opening-kerr.js"), "utf8");
  const sceneSource = fs.readFileSync(path.join(root, "src/renderer/kerr/kerr-scene.js"), "utf8");

  for (const id of [
    "debugPlayPauseBtn",
    "debugStepBtn",
    "debugTimeRange",
    "debugProgressRange",
    "debugTracerToggle",
    "debugSourceStarsBtn",
    "debugSourceGridBtn",
    "debugPixelCheckBtn",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }

  assert.match(debugSource, /opening\.readDiagnosticPixels\(\)/);
  assert.doesNotMatch(debugSource, /localStorage/);
  assert.match(openingSource, /setDebugPlayback/);
  assert.match(sceneSource, /GPUTextureUsage\.RENDER_ATTACHMENT \| GPUTextureUsage\.COPY_SRC/);
  assert.match(sceneSource, /copyTextureToBuffer/);
});
