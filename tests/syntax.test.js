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
  "debug/render-capture.js",
  "debug/kerr-opening.js",
];

test("render capture requests have deterministic safe defaults", () => {
  const source = fs.readFileSync(path.join(root, "debug/render-capture.js"), "utf8");
  const sandbox = {};
  new Function("globalThis", source)(sandbox);

  const request = sandbox.SilidoxRenderCapture.parseRequest(
    "?capture=frame&captureId=review/one&time=12&progress=1",
  );
  assert.deepEqual(request, {
    kind: "frame",
    captureId: "review-one",
    timeSeconds: 12,
    progress: 1,
    speed: 1,
    durationSeconds: 6,
    tracer: false,
    width: 1600,
    height: 900,
  });
  assert.equal(sandbox.SilidoxRenderCapture.parseRequest("?time=12"), null);
});

test("classic JavaScript files parse without executing browser globals", () => {
  for (const script of scripts) {
    const source = fs.readFileSync(path.join(root, script), "utf8");
    assert.doesNotThrow(() => new Function(source), `${script} has invalid syntax`);
  }
});

test("kerr opening uses a multi-pass black-hole construction graph", () => {
  const opening = fs.readFileSync(path.join(root, "src/opening-kerr.js"), "utf8");
  const grid = fs.readFileSync(path.join(root, "src/renderer/kerr/grid-background.js"), "utf8");
  const lens = fs.readFileSync(path.join(root, "src/renderer/kerr/kerr-lens.js"), "utf8");
  const direct = fs.readFileSync(path.join(root, "src/renderer/kerr/ring-direct.js"), "utf8");
  const energy = fs.readFileSync(path.join(root, "src/renderer/kerr/energy-flow.js"), "utf8");
  const post = fs.readFileSync(path.join(root, "src/renderer/kerr/post-process.js"), "utf8");
  const scene = fs.readFileSync(path.join(root, "src/renderer/kerr/kerr-scene.js"), "utf8");

  assert.doesNotMatch(opening, /@fragment/);
  assert.match(opening, /SilidoxKerr\.createScene/);
  assert.match(grid, /namespace\.createGridCanvas/);
  assert.match(grid, /KERR LENS SOURCE PLANE/);
  assert.match(lens, /fn sampleEscapedGrid/);
  assert.match(lens, /grid_sampler, fract\(uv\)/);
  assert.match(lens, /textureSampleLevel\(grid_texture/);
  assert.doesNotMatch(lens, /fn pseudoKerrAcceleration/);
  assert.match(lens, /const CRITICAL_E_SQUARE: f32 = 4\.0 \/ 27\.0/);
  assert.match(lens, /fn orbitPosition/);
  assert.match(lens, /for \(var stepIndex = 0; stepIndex < 256; stepIndex \+= 1\)/);
  assert.match(lens, /fn sampleDisk/);
  assert.match(lens, /fn sampleRingSource/);
  assert.match(lens, /fn orbitalRateAt/);
  assert.match(lens, /fn orbitingArc/);
  assert.match(lens, /time \* orbitalRateAt\(orbitRadius\)/);
  assert.doesNotMatch(lens, /time \* orbitalRateAt\(radius\)/);
  assert.match(lens, /let orbitingStructure =/);
  assert.match(lens, /let hotStreams = innerArcA/);
  assert.doesNotMatch(lens, /fn noise2/);
  assert.match(lens, /pow\(max\(frequencyShift, 0\.05\), 2\.65\) \* 0\.82/);
  assert.match(lens, /fn sampleMagnetosphere/);
  assert.match(direct, /namespace\.foregroundShader/);
  assert.match(energy, /@compute @workgroup_size\(64\)/);
  assert.match(energy, /var<storage, read_write> segments/);
  assert.match(energy, /var<storage, read_write> particles/);
  assert.match(post, /fn acesToneMap/);
  assert.match(scene, /const HDR_FORMAT = "rgba16float"/);
  assert.match(scene, /copyExternalImageToTexture/);
  for (const pass of [
    "simulation.compute",
    "kerr-lens.fragment",
    "foreground.render",
    "energy-ribbons.render",
    "bloom.render",
    "tone-map.render",
  ]) {
    assert.match(scene, new RegExp(pass.replace(".", "\\.")));
  }
  assert.doesNotMatch(scene, /ring-direct\.render/);
  assert.doesNotMatch(scene, /this\.ringPipeline/);
  assert.match(scene, /pass\.setScissorRect/);
  assert.match(scene, /diagnostics\.tracer \? 1 : 0/);
});
