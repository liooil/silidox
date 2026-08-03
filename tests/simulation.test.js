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
    const desiredDirection = target > state.world.position ? 1 : -1;
    if (state.world.direction !== desiredDirection) {
      assert.equal(Simulation.performAction(state, "reverse"), true);
    }
    assert.equal(Simulation.performAction(state, "move"), true);
  }
}

function chopAllTrees(state) {
  for (const position of Data.TRACK.trees) {
    moveTo(state, position);
    assert.equal(Simulation.performAction(state, "harvest"), true);
  }
}

function digOneLayer(state) {
  const before = state.world.depth;
  const progress = Simulation.digProgress(state);
  if (progress.open) {
    assert.equal(Simulation.performAction(state, "digDown"), true);
  } else {
    for (let count = progress.current; count < progress.required; count += 1) {
      assert.equal(Simulation.performAction(state, "digDown"), true);
    }
  }
  assert.equal(state.world.depth, before + 1);
}

function ascendToSurface(state) {
  while (state.world.depth > 0) {
    assert.equal(Simulation.performAction(state, "ascend"), true);
  }
}

function startAndFinish(state, jobId) {
  assert.equal(Simulation.performAction(state, "startJob", jobId), true);
  advanceFor(state, Data.JOBS[jobId].durationMs);
  assert.equal(state.job, null);
}

function reachConfirmedAnomaly(state) {
  heartbeatThreeTimes(state);
  chopAllTrees(state);
  assert.equal(Simulation.performAction(state, "installController", "heart"), true);
  startAndFinish(state, "mineHead");

  digOneLayer(state);
  digOneLayer(state);
  digOneLayer(state);
  assert.equal(state.resources.material, 7);
  ascendToSurface(state);
  chopAllTrees(state);

  startAndFinish(state, "bench");
  startAndFinish(state, "generator");
  startAndFinish(state, "sensor");
  moveTo(state, Data.TRACK.anomaly);
  for (let depth = 1; depth <= Data.TRACK.anomalyDepth; depth += 1) {
    digOneLayer(state);
  }
  startAndFinish(state, "anomalySample");
  startAndFinish(state, "anomalySample");
  startAndFinish(state, "anomalySample");
  assert.equal(state.anomaly.confirmed, true);
}

function testInitialRecovery() {
  const state = Simulation.createState();
  assert.deepEqual(state.resources, {
    core: 25,
    energy: 30,
    wood: 0,
    material: 0,
    ore: 0,
    parts: 0,
  });
  assert.equal(state.stage, "recovery");
  assert.equal(state.unlocks.environment, false);

  heartbeatThreeTimes(state);
  assert.equal(state.resources.core, 100);
  assert.equal(state.resources.energy, 27);
  assert.equal(state.unlocks.environment, true);
  assert.equal(state.controllers.heart.available, true);
  assert.equal(state.stage, "survival");
}

function testForestFuelLoop() {
  const state = Simulation.createState();
  heartbeatThreeTimes(state);
  moveTo(state, 2);
  assert.equal(Simulation.performAction(state, "harvest"), true);
  assert.equal(state.resources.wood, Data.FOREST_RULES.woodPerTree);
  assert.equal(state.resources.energy, 25.5);
  assert.equal(Simulation.performAction(state, "burnWood"), true);
  assert.equal(state.resources.wood, Data.FOREST_RULES.woodPerTree - 1);
  assert.equal(state.resources.energy, 33.5);
  assert.equal(state.unlocks.workshop, true);
  assert.equal(state.controllers.pickup.available, true);

  state.resources.energy = Data.RESOURCE_LIMITS.energy - Data.FOREST_RULES.energyPerWood + 1;
  const woodBeforeRejectedBurn = state.resources.wood;
  assert.equal(Simulation.performAction(state, "burnWood"), false);
  assert.equal(state.resources.wood, woodBeforeRejectedBurn);

  assert.equal(state.controllers.drive.available, false);

  Simulation.performAction(state, "move");
  assert.equal(state.controllers.drive.available, true);

  advanceFor(state, Data.FOREST_RULES.treeRespawnMs);
  assert.equal(state.world.trees.includes(2), true);
}

function testWoodGenerator() {
  const state = Simulation.createState();
  heartbeatThreeTimes(state);
  state.structures.generator = true;
  state.resources.energy = 10;
  state.resources.wood = 2;

  advanceFor(state, 4000);
  assert.equal(state.resources.energy, 12);
  assert.equal(state.resources.wood, 1.75);
}

function testTwoDimensionalMining() {
  const state = Simulation.createState();
  heartbeatThreeTimes(state);
  chopAllTrees(state);
  assert.equal(Simulation.performAction(state, "installController", "heart"), true);
  startAndFinish(state, "mineHead");

  assert.equal(state.unlocks.mining, true);
  assert.equal(state.stage, "mining");
  assert.equal(state.world.depth, 0);
  assert.equal(Simulation.digProgress(state).required, 2);

  assert.equal(Simulation.performAction(state, "digDown"), true);
  assert.equal(state.world.depth, 0);
  assert.equal(Simulation.digProgress(state).current, 1);
  assert.equal(Simulation.performAction(state, "digDown"), true);
  assert.equal(state.world.depth, 1);
  assert.equal(state.resources.material, 2);
  assert.equal(Simulation.cellExcavated(state, 7, 1), true);
  assert.equal(state.controllers.excavator.available, true);

  digOneLayer(state);
  assert.equal(state.world.depth, 2);
  assert.equal(state.resources.material, 4);
  assert.equal(state.resources.ore, 2);
  assert.equal(state.milestones.orePickups, 1);

  assert.equal(Simulation.performAction(state, "move"), false);
  assert.equal(Simulation.performAction(state, "ascend"), true);
  assert.equal(state.world.depth, 1);
  assert.equal(Simulation.digProgress(state).open, true);
  assert.equal(Simulation.performAction(state, "digDown"), true);
  assert.equal(state.world.depth, 2);
  assert.equal(
    Simulation.performAction(state, "installController", "excavator"),
    true,
  );
  advanceFor(state, 5000);
  assert.equal(state.world.depth, 3);
  assert.equal(Simulation.cellExcavated(state, 7, 3), true);
  ascendToSurface(state);
  assert.equal(state.world.depth, 0);
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
  preset.resources.wood = 10;
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
  state.resources.wood = 10;
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

function testControllerPauseToManual() {
  const state = Simulation.createState();
  heartbeatThreeTimes(state);
  state.resources.wood = 10;
  assert.equal(
    Simulation.performAction(state, "installController", "heart"),
    true,
  );
  assert.equal(state.controllers.heart.mode, "preset");

  assert.equal(
    Simulation.performAction(state, "setControllerMode", {
      id: "heart",
      mode: "manual",
    }),
    true,
  );
  assert.equal(state.controllers.heart.mode, "manual");

  const outputsBefore = state.controllers.heart.outputCount;
  const energyBefore = state.controllers.heart.energySpent;
  advanceFor(state, 10000);
  assert.equal(
    state.controllers.heart.outputCount,
    outputsBefore,
    "paused automation must not fire",
  );
  assert.equal(
    state.controllers.heart.energySpent,
    energyBefore,
    "paused automation must not spend energy",
  );

  assert.equal(Simulation.performAction(state, "heartbeat"), true);
  assert.equal(state.controllers.heart.outputCount, outputsBefore + 1);

  assert.equal(
    Simulation.performAction(state, "setControllerMode", {
      id: "heart",
      mode: "ladder",
    }),
    true,
  );
  state.resources.core = 40;
  advanceFor(state, 10000, () => ({ outputs: ["Q0"], scanCost: 2 }));
  assert.ok(
    state.controllers.heart.outputCount > outputsBefore + 1,
    "resumed ladder automation must fire again",
  );
}

function testFullOpeningSlice() {
  const state = Simulation.createState();
  reachConfirmedAnomaly(state);
  assert.equal(state.structures.mineHead, true);
  assert.equal(state.structures.bench, true);
  assert.equal(state.structures.generator, true);
  assert.equal(state.structures.sensor, true);
  assert.equal(state.world.position, Data.TRACK.anomaly);
  assert.equal(state.world.depth, Data.TRACK.anomalyDepth);
  assert.equal(state.unlocks.anomaly, true);
  assert.equal(state.stage, "anomaly");
  assert.match(Simulation.objective(state), /部件加工台/);
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
  state.resources.wood = 10;
  Simulation.performAction(state, "installController", "heart");
  Simulation.performAction(state, "setControllerMode", {
    id: "heart",
    mode: "ladder",
  });
  state.structures.mineHead = true;
  state.unlocks.mining = true;
  state.controllers.excavator.available = true;
  state.resources.material = 3;
  assert.equal(
    Simulation.performAction(state, "installController", "excavator"),
    true,
  );

  const programs = {
    "body.heart": [
      {
        id: "rung-1",
        enabled: true,
        contacts: [{ op: "XIC", pin: "I0" }],
        coil: "Q0",
      },
    ],
    "environment.excavator": [
      {
        id: "rung-2",
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
  const excavatorJob = plan.jobs.find((job) => job.device === "excavator");
  assert.equal(excavatorJob.physical_limits.energy_per_action, Data.MINING_RULES.digEnergy);
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
  reachConfirmedAnomaly(state);
  assert.ok(state.resources.ore >= 4);
  assert.ok(state.resources.material >= 4);
  assert.ok(state.milestones.orePickups >= 1);

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
  state.structures.mineHead = true;
  state.unlocks.mining = true;
  state.resources.ore = 7;
  state.resources.parts = 3;
  state.industry.processorMs = 4000;
  state.industry.batches = 2;
  state.world.position = 7;
  state.world.depth = 2;
  state.world.excavated = ["7:1", "7:2"];
  state.world.digProgress = { "7:3": 2 };
  const loaded = Simulation.normalizeState(JSON.parse(JSON.stringify(state)));
  assert.equal(loaded.world.depth, 2);
  assert.deepEqual(loaded.world.excavated, ["7:1", "7:2"]);
  assert.equal(loaded.world.digProgress["7:3"], 2);
  assert.equal(loaded.resources.ore, 7);
  assert.equal(loaded.resources.parts, 3);
  assert.equal(loaded.industry.batches, 2);

  const raw = Simulation.createState();
  raw.world.trees = [2, 2, 99];
  raw.world.treeRespawn = { 5: 5000, 7: 25000 };
  raw.world.excavated = ["2:1", "2:1", "99:1", "3:9", "bad"];
  raw.world.digProgress = { "2:1": 1, "5:2": 1, "6:3": 99, bad: 1 };
  const sanitized = Simulation.normalizeState(JSON.parse(JSON.stringify(raw)));
  assert.deepEqual(sanitized.world.trees, [2]);
  assert.equal(sanitized.world.treeRespawn[5], 5000);
  assert.equal(sanitized.world.treeRespawn[7], Data.FOREST_RULES.treeRespawnMs);
  assert.deepEqual(sanitized.world.excavated, ["2:1"]);
  assert.equal(sanitized.world.digProgress["2:1"], undefined);
  assert.equal(sanitized.world.digProgress["5:2"], 1);
  assert.equal(sanitized.world.digProgress["6:3"], 3);

  const legacyWorkshop = Simulation.createState();
  legacyWorkshop.structures.bench = true;
  const migrated = Simulation.normalizeState(JSON.parse(JSON.stringify(legacyWorkshop)));
  assert.equal(migrated.structures.mineHead, true);
  assert.equal(migrated.unlocks.mining, true);
}

testInitialRecovery();
testForestFuelLoop();
testWoodGenerator();
testTwoDimensionalMining();
testIndustryChapter();
testIndustryStatePersistence();
testRecoverableShutdown();
testLadderOptimizationBenefit();
testControllerEdgeCases();
testControllerPauseToManual();
testFullOpeningSlice();
testNoImplicitOfflineCatchupAndLegacyArchive();
testAutomationPlan();
testLegacyLadderArchive();

console.log("simulation tests passed");
