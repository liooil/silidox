const assert = require("node:assert/strict");
const { test } = require("bun:test");

require("../src/inner-landscape.js");

const Inner = globalThis.SilidoxInnerLandscape;

function advanceFor(inner, milliseconds) {
  for (let elapsed = 0; elapsed < milliseconds; elapsed += Inner.STEP_MS) {
    Inner.advance(inner, Inner.STEP_MS);
  }
}

function testBaselineQuietRunsStable() {
  const inner = Inner.createInnerState();
  advanceFor(inner, 60000);
  assert.equal(inner.faults.length, 0, "quiet baseline must stay fault-free");
  assert.equal(inner.clock.stepCount, 240);
  assert.equal(inner.events.length, 0);
  assert.ok(inner.nodes.dantian.stored > 100, "dantian should fill with qi");
  assert.ok(inner.nodes.refine.converted > 0);

  const touch = Inner.getMetrics(inner, "touch");
  assert.ok(touch.purity > 0.9, `purity=${touch.purity}`);
  assert.ok(touch.temperature < 80, `temperature=${touch.temperature}`);
  assert.equal(Inner.getMetrics(inner, "missing"), null);
}

function testOverpressureFaultAndRelief() {
  const inner = Inner.createInnerState();
  Inner.setExternal(inner, { pressure: 100 });
  advanceFor(inner, 60000);
  assert.ok(
    inner.faults.includes("refine:overpressure"),
    `faults=${inner.faults.join(",")}`,
  );
  assert.ok(
    inner.events.some((event) => event.kind === "overpressure" && event.node === "refine"),
  );

  const mitigated = Inner.createInnerState();
  Inner.setExternal(mitigated, { pressure: 100 });
  Inner.applyControl(mitigated, { reliefOpen: 1 });
  advanceFor(mitigated, 60000);
  assert.ok(!mitigated.faults.includes("refine:overpressure"));
  assert.ok(
    mitigated.nodes.refine.pressure < inner.nodes.refine.pressure,
    "relief must vent refining pressure",
  );
}

function testOverheatFaultInBurst() {
  const inner = Inner.createInnerState();
  Inner.setExternal(inner, { pressure: 150 });
  Inner.applyControl(inner, { mode: "burst" });
  let peak = 0;
  for (let i = 0; i < 120; i += 1) {
    Inner.advance(inner, Inner.STEP_MS);
    peak = Math.max(peak, inner.nodes.refine.temperature);
  }
  assert.ok(peak > 80, `peak temperature=${peak.toFixed(1)}`);
  assert.ok(
    inner.events.some((event) => event.kind === "overheat" && event.node === "refine"),
    `events=${inner.events.map((event) => `${event.kind}@${event.node}`).join(",")}`,
  );
}

function testPollutionFaultAndPurge() {
  const inner = Inner.createInnerState();
  Inner.setExternal(inner, { pressure: 60, impurity: 1 });
  advanceFor(inner, 30000);
  assert.ok(
    inner.events.some((event) => event.kind === "pollution"),
    "dirty external input must raise a pollution fault",
  );
  assert.ok(inner.faults.some((key) => key.endsWith(":pollution")));

  const before = inner.nodes.refine.impurity;
  Inner.setExternal(inner, { impurity: 0 });
  Inner.applyControl(inner, { purgeOpen: 1 });
  advanceFor(inner, 10000);
  assert.ok(inner.nodes.refine.impurity < before, "purge must drain impurity");
  assert.ok(
    !inner.faults.includes("touch:pollution"),
    "intake node pollution must clear once intake is clean",
  );
  assert.ok(
    inner.faults.includes("duct:pollution"),
    "stagnant segments retain contamination until flushed",
  );
}

function testOscillationFault() {
  const inner = Inner.createInnerState();
  for (let i = 0; i < 40; i += 1) {
    Inner.setExternal(inner, { pressure: i % 2 === 0 ? 100 : 20 });
    advanceFor(inner, 500);
  }
  assert.ok(
    inner.faults.includes("touch:oscillation"),
    `faults=${inner.faults.join(",")}`,
  );
  assert.ok(
    inner.events.some((event) => event.kind === "oscillation" && event.node === "touch"),
  );
}

function testDeterministicReplay() {
  const run = () => {
    const inner = Inner.createInnerState();
    Inner.setExternal(inner, { pressure: 100 });
    Inner.applyControl(inner, { mode: "burst", reliefOpen: 0.5 });
    advanceFor(inner, 15000);
    Inner.setExternal(inner, { pressure: 40, impurity: 0.4 });
    Inner.applyControl(inner, { mode: "quiet", purgeOpen: 1 });
    advanceFor(inner, 10000);
    return JSON.stringify(inner);
  };
  assert.equal(run(), run(), "identical input must replay identical state");
}

function testPauseAndControlBounds() {
  const inner = Inner.createInnerState();
  inner.clock.paused = true;
  const snapshot = JSON.stringify(inner);
  Inner.advance(inner, 5000);
  assert.equal(JSON.stringify(inner), snapshot, "paused kernel must not advance");

  inner.clock.paused = false;
  assert.equal(Inner.applyControl(inner, { reliefOpen: 5, mode: "invalid" }), true);
  assert.equal(inner.control.reliefOpen, 1, "relief opening must clamp to [0,1]");
  assert.equal(inner.control.mode, "quiet", "invalid mode must be ignored");
  assert.equal(Inner.applyControl(inner, null), false);
  assert.equal(Inner.setExternal(inner, { pressure: 999 }), true);
  assert.equal(inner.external.pressure, 300, "external pressure must clamp");
}

test("baseline quiet circuit runs stable", testBaselineQuietRunsStable);
test("overpressure fault can be relieved", testOverpressureFaultAndRelief);
test("burst mode can overheat", testOverheatFaultInBurst);
test("pollution fault can be purged", testPollutionFaultAndPurge);
test("oscillation fault is detected", testOscillationFault);
test("inner landscape replay is deterministic", testDeterministicReplay);
test("pause and control bounds are enforced", testPauseAndControlBounds);
