const assert = require("node:assert/strict");

require("../src/data.js");
require("../src/simulation.js");
require("../src/ladder-editor.js");
require("../src/automation-plan.js");

const Data = globalThis.SilidoxData;
const Simulation = globalThis.SilidoxSimulation;
const Ladder = globalThis.SilidoxLadder;
const AutomationPlan = globalThis.SilidoxAutomationPlan;

function advanceFor(state, milliseconds, evaluator = () => ({ outputs: [], scanCost: 0 })) {
  for (let elapsed = 0; elapsed < milliseconds; elapsed += Data.STEP_MS) {
    Simulation.advance(state, Data.STEP_MS, evaluator);
  }
}

function heartbeatThreeTimes(state) {
  assert.equal(Simulation.performAction(state, "heartbeat"), true);
  assert.equal(Simulation.performAction(state, "heartbeat"), true);
  assert.equal(Simulation.performAction(state, "heartbeat"), true);
}

function moveTo(state, target) {
  while (state.world.position !== target) {
    if (Simulation.atBoundary(state)) {
      assert.equal(Simulation.performAction(state, "reverse"), true);
    }
    assert.equal(Simulation.performAction(state, "move"), true);
  }
}

function collectAllSalvage(state) {
  for (const position of Data.TRACK.salvage) {
    moveTo(state, position);
    assert.equal(Simulation.performAction(state, "pickup"), true);
  }
}

function startAndFinish(state, jobId) {
  assert.equal(Simulation.performAction(state, "startJob", jobId), true);
  advanceFor(state, Data.JOBS[jobId].durationMs);
  assert.equal(state.job, null);
}

function testInitialRecovery() {
  const state = Simulation.createState();
  assert.deepEqual(state.resources, { core: 25, energy: 30, material: 0, ore: 0, parts: 0 });
  assert.equal(state.stage, "recovery");
  assert.equal(state.unlocks.environment, false);

  heartbeatThreeTimes(state);
  assert.equal(state.resources.core, 100);
  assert.equal(state.resources.energy, 27);
  assert.equal(state.unlocks.environment, true);
  assert.equal(state.controllers.heart.available, true);
  assert.equal(state.stage, "survival");
}

function testPhysicalSalvageLoop() {
  const state = Simulation.createState();
  heartbeatThreeTimes(state);
  moveTo(state, 2);
  assert.equal(Simulation.performAction(state, "pickup"), true);
  assert.equal(state.resources.material, 5);
  assert.equal(state.resources.energy, 33.5);
  assert.equal(state.unlocks.workshop, true);
  assert.equal(state.controllers.pickup.available, true);
  assert.equal(state.controllers.drive.available, false);

  Simulation.performAction(state, "move");
  assert.equal(state.controllers.drive.available, true);
}

function testRecoverableShutdown() {
  const state = Simulation.createState();
  state.resources.core = 0.1;
  state.resources.energy = 0;
  Simulation.advance(state, Data.STEP_MS);
  assert.equal(state.shutdown, true);
  assert.equal(state.resources.core, 0);

  advanceFor(state, 6000);
  assert.equal(state.emergency.charge, 3);
  assert.equal(Simulation.performAction(state, "emergencyPulse"), true);
  assert.equal(Simulation.performAction(state, "emergencyPulse"), true);
  assert.equal(Simulation.performAction(state, "emergencyPulse"), true);
  assert.equal(state.shutdown, false);
  assert.equal(state.resources.core, 25);
  assert.equal(state.resources.energy, 3);
}

function testLadderOptimizationBenefit() {
  const preset = Simulation.createState();
  heartbeatThreeTimes(preset);
  preset.resources.material = 10;
  assert.equal(
    Simulation.performAction(preset, "installController", "heart"),
    true,
  );

  const ladder = Simulation.normalizeState(JSON.parse(JSON.stringify(preset)));
  assert.equal(
    Simulation.performAction(ladder, "setControllerMode", {
      id: "heart",
      mode: "ladder",
    }),
    true,
  );

  advanceFor(preset, 60000);
  advanceFor(ladder, 60000, (_programId, signals) => ({
    outputs: signals.I0 ? ["Q0"] : [],
    scanCost: 2,
  }));

  assert.ok(preset.resources.core > 0);
  assert.ok(ladder.resources.core > 0);
  assert.ok(
    ladder.controllers.heart.energySpent < preset.controllers.heart.energySpent,
    `ladder=${ladder.controllers.heart.energySpent}, preset=${preset.controllers.heart.energySpent}`,
  );
  assert.ok(ladder.control.lifetimeWork < preset.control.lifetimeWork);
  assert.ok(ladder.resources.energy > preset.resources.energy);
}

function testControllerEdgeCases() {
  const state = Simulation.createState();
  heartbeatThreeTimes(state);
  state.resources.material = 10;
  state.structures.bench = true;
  state.stage = "workshop";
  assert.equal(
    Simulation.performAction(state, "installController", "heart"),
    true,
  );
  assert.equal(state.stage, "workshop");

  state.resources.energy = 0.001;
  Simulation.advance(state, Data.STEP_MS);
  assert.equal(state.resources.energy, 0);
}

function testFullOpeningSlice() {
  const state = Simulation.createState();
  heartbeatThreeTimes(state);
  collectAllSalvage(state);
  assert.equal(state.resources.material, 15);
  assert.equal(state.world.salvage.length, 0);

  assert.equal(
    Simulation.performAction(state, "installController", "heart"),
    true,
  );
  startAndFinish(state, "bench");
  assert.equal(state.structures.bench, true);
  startAndFinish(state, "generator");
  assert.equal(state.structures.generator, true);
  startAndFinish(state, "sensor");
  assert.equal(state.structures.sensor, true);
  assert.equal(state.anomaly.revealed, true);
  assert.equal(state.unlocks.anomaly, false);

  moveTo(state, Data.TRACK.anomaly);
  startAndFinish(state, "anomalySample");
  startAndFinish(state, "anomalySample");
  startAndFinish(state, "anomalySample");
  assert.equal(state.anomaly.confirmed, true);
  assert.equal(state.unlocks.anomaly, true);
  assert.equal(state.stage, "anomaly");
  assert.match(Simulation.objective(state), /非守恒输出/);
  assert.equal(state.shutdown, false);
}

function testNoImplicitOfflineCatchupAndLegacyArchive() {
  const archive = { metaV1: { epoch: 3, cultivation: { qi: 42 } } };
  const state = Simulation.createState(archive);
  state.clock.elapsedMs = 12345;
  state.clock.savedAt = 1;

  const loaded = Simulation.normalizeState(JSON.parse(JSON.stringify(state)));
  assert.equal(loaded.clock.elapsedMs, 12345);
  assert.deepEqual(loaded.legacyArchive, archive);
}

function testAutomationPlan() {
  const state = Simulation.createState();
  heartbeatThreeTimes(state);
  state.resources.material = 10;
  Simulation.performAction(state, "installController", "heart");
  Simulation.performAction(state, "setControllerMode", {
    id: "heart",
    mode: "ladder",
  });

  const programs = {
    "body.heart": [
      {
        id: "rung-1",
        enabled: true,
        contacts: [{ op: "XIC", pin: "I0" }],
        coil: "Q0",
      },
    ],
  };
  const plan = AutomationPlan.createPlan(state, programs);
  assert.equal(AutomationPlan.validatePlan(plan), true);
  assert.equal(plan.jobs[0].program_ir[0].contacts[0].pin, "I0");
  assert.equal(plan.jobs[0].estimated_scan_cost, 2);
  assert.equal(JSON.stringify(plan).includes("function"), false);
}

function testLegacyLadderArchive() {
  const legacyProgram = [
    {
      id: "rung-7",
      enabled: true,
      contacts: [{ op: "XIC", pin: "I7" }],
      coil: "Q4",
    },
  ];
  const store = Ladder.createProgramStoreFromRaw(null, JSON.stringify(legacyProgram));
  assert.deepEqual(store.archive.legacyV2, legacyProgram);
  assert.deepEqual(store.programs["body.heart"], []);
  assert.equal(store.version, 3);
}

function testIndustryChapter() {
  const state = Simulation.createState();
  heartbeatThreeTimes(state);
  collectAllSalvage(state);
  Simulation.performAction(state, "installController", "heart");
  startAndFinish(state, "bench");
  startAndFinish(state, "generator");
  startAndFinish(state, "sensor");
  moveTo(state, Data.TRACK.anomaly);
  startAndFinish(state, "anomalySample");
  startAndFinish(state, "anomalySample");
  startAndFinish(state, "anomalySample");
  assert.equal(state.anomaly.confirmed, true);
  assert.deepEqual(state.world.veins, Data.INDUSTRY_RULES.veinPositions);

  moveTo(state, Data.INDUSTRY_RULES.veinPositions[0]);
  assert.equal(Simulation.veinAtPosition(state), true);
  assert.equal(Simulation.performAction(state, "pickup"), true);
  assert.equal(state.resources.ore, Data.INDUSTRY_RULES.veinRewardOre);
  assert.equal(state.resources.material, 6);
  assert.equal(state.milestones.orePickups, 1);
  assert.equal(Simulation.veinAtPosition(state), false);
  advanceFor(state, Data.INDUSTRY_RULES.veinRespawnMs);
  assert.equal(Simulation.veinAtPosition(state), true);

  assert.equal(Simulation.jobAvailable(state, "processor"), true);
  assert.equal(Simulation.performAction(state, "startJob", "processor"), true);
  advanceFor(state, Data.JOBS.processor.durationMs);
  assert.equal(state.structures.processor, true);
  assert.equal(state.stage, "industry");

  state.resources.ore = 10;
  advanceFor(state, Data.INDUSTRY_RULES.processorCycleMs * 2);
  assert.equal(state.resources.parts, 2);
  assert.equal(state.resources.ore, 6);

  state.resources.parts = Data.RESOURCE_LIMITS.parts;
  state.resources.ore = 10;
  const oreBefore = state.resources.ore;
  advanceFor(state, Data.INDUSTRY_RULES.processorCycleMs * 3);
  assert.equal(state.resources.parts, Data.RESOURCE_LIMITS.parts);
  assert.equal(state.resources.ore, oreBefore);
}

function testIndustryStatePersistence() {
  const state = Simulation.createState();
  state.anomaly.confirmed = true;
  state.resources.ore = 7;
  state.resources.parts = 3;
  state.industry.processorMs = 4000;
  state.industry.batches = 2;
  const loaded = Simulation.normalizeState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(loaded.world.veins, Data.INDUSTRY_RULES.veinPositions);
  assert.equal(loaded.resources.ore, 7);
  assert.equal(loaded.resources.parts, 3);
  assert.equal(loaded.industry.batches, 2);

  const raw = Simulation.createState();
  raw.world.veins = [1, 1, 99];
  raw.world.veinRespawn = { 3: 5000, 6: 25000 };
  const sanitized = Simulation.normalizeState(JSON.parse(JSON.stringify(raw)));
  assert.deepEqual(sanitized.world.veins, [1]);
  assert.equal(sanitized.world.veinRespawn[3], 5000);
  assert.equal(sanitized.world.veinRespawn[6], Data.INDUSTRY_RULES.veinRespawnMs);
}

testInitialRecovery();
testPhysicalSalvageLoop();
testIndustryChapter();
testIndustryStatePersistence();
testRecoverableShutdown();
testLadderOptimizationBenefit();
testControllerEdgeCases();
testFullOpeningSlice();
testNoImplicitOfflineCatchupAndLegacyArchive();
testAutomationPlan();
testLegacyLadderArchive();

console.log("simulation tests passed");
