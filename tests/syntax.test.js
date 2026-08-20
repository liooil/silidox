const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("bun:test");

const root = path.resolve(__dirname, "..");
const scripts = [
  "src/data.js",
  "src/renderer/kerr/grid-background.js",
  "src/renderer/kerr/kerr-lens.js",
  "src/renderer/kerr/ring-direct.js",
  "src/renderer/kerr/energy-flow.js",
  "src/renderer/kerr/post-process.js",
  "src/renderer/kerr/kerr-scene.js",
  "src/opening-kerr.js",
  "src/simulation.js",
  "src/inner-landscape.js",
  "src/ladder-editor.js",
  "src/automation-plan.js",
  "src/ui.js",
  "src/app.js",
  "debug/kerr-opening.js",
];

test("classic JavaScript files parse without executing browser globals", () => {
  for (const script of scripts) {
    const source = fs.readFileSync(path.join(root, script), "utf8");
    assert.doesNotThrow(() => new Function(source), `${script} has invalid syntax`);
  }
});

test("kerr opening keeps the classic multi-pass renderer boundary", () => {
  const opening = fs.readFileSync(path.join(root, "src/opening-kerr.js"), "utf8");
  const background = fs.readFileSync(path.join(root, "src/renderer/kerr/grid-background.js"), "utf8");
  const direct = fs.readFileSync(path.join(root, "src/renderer/kerr/ring-direct.js"), "utf8");
  const scene = fs.readFileSync(path.join(root, "src/renderer/kerr/kerr-scene.js"), "utf8");

  assert.doesNotMatch(opening, /@fragment/);
  assert.match(opening, /SilidoxKerr\.createScene/);
  assert.match(background, /namespace\.createSourceCanvas/);
  assert.match(background, /stars: "stars"/);
  assert.match(background, /grid: "grid"/);
  assert.match(direct, /namespace\.ringDirectShader/);
  for (const pass of [
    "simulation.compute",
    "kerr-lens.fragment",
    "ring-direct.render",
    "foreground.render",
    "energy-ribbons.render",
    "bloom.render",
    "tone-map.render",
  ]) {
    assert.match(scene, new RegExp(pass.replace(".", "\\.")));
  }
});
