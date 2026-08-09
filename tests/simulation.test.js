const assert = require("node:assert/strict");

require("../src/data.js");
require("../src/inner-landscape.js");
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

function performCheckedAction(state, budget, action, payload = null) {
  const changed = Simulation.performAction(state, action, payload);
  assert.equal(changed, true);
  if (budget) budget.actions += 1;
  return changed;
}


function heartbeatThreeTimes(state, budget = null) {
  performCheckedAction(state, budget, "heartbeat");
  performCheckedAction(state, budget, "heartbeat");
  performCheckedAction(state, budget, "heartbeat");
}


function moveTo(state, target, budget = null) {
  while (state.world.position !== target) {
    const desiredDirection = target > state.world.position ? 1 : -1;
    if (state.world.direction !== desiredDirection) {
      performCheckedAction(state, budget, "reverse");
    }
    performCheckedAction(state, budget, "move");
  }
}


function pickupAllBranches(state, budget = null) {
  for (const position of Data.TRACK.branches) {
    moveTo(state, position, budget);
    performCheckedAction(state, budget, "pickup");
  }
}


function digOneLayer(state, branch = "L", budget = null) {
  const before = state.world.depth;
  const action = branch === "L" ? "digLeft" : "digRight";
  const progress = Simulation.mineBranchProgress(state, branch);
  if (progress.open) {
    performCheckedAction(state, budget, action);
  } else {
    for (let count = progress.current; count < progress.required; count += 1) {
      performCheckedAction(state, budget, action);
    }
  }
  assert.equal(state.world.depth, before + 1);
}


function ascendToSurface(state, budget = null) {
  while (state.world.depth > 0) {
    performCheckedAction(state, budget, "ascend");
  }
}


function startAndFinish(state, jobId, budget = null) {
  performCheckedAction(state, budget, "startJob", jobId);
  advanceFor(state, Data.JOBS[jobId].durationMs);
  assert.equal(state.job, null);
}


function reachConfirmedAnomaly(state, budget = null) {
  heartbeatThreeTimes(state, budget);
  pickupAllBranches(state, budget);
  performCheckedAction(state, budget, "installController", "heart");
  startAndFinish(state, "mineHead", budget);
  moveTo(state, Data.TRACK.mineEntrance, budget);

  digOneLayer(state, "L", budget);
  digOneLayer(state, "L", budget);
  digOneLayer(state, "L", budget);
  digOneLayer(state, "L", budget);
  assert.equal(state.resources.material, 9);
  ascendToSurface(state, budget);
  performCheckedAction(state, budget, "burnWood");
  performCheckedAction(state, budget, "burnWood");

  startAndFinish(state, "bench", budget);
  startAndFinish(state, "generator", budget);
  startAndFinish(state, "sensor", budget);
  moveTo(state, Data.TRACK.mineEntrance, budget);
  for (const branch of Data.TRACK.anomalyPath) {
    digOneLayer(state, branch, budget);
  }
  startAndFinish(state, "anomalySample", budget);
  startAndFinish(state, "anomalySample", budget);
  startAndFinish(state, "anomalySample", budget);
  assert.equal(state.anomaly.confirmed, true);
}

function testOpeningRouteBudget() {
  const state = Simulation.createState();
  const budget = { actions: 0 };
  reachConfirmedAnomaly(state, budget);

  const machineMs =
    Data.JOBS.mineHead.durationMs +
    Data.JOBS.bench.durationMs +
    Data.JOBS.generator.durationMs +
    Data.JOBS.sensor.durationMs +
    Data.JOBS.anomalySample.durationMs * 3;
  const estimatedActiveMs =
    machineMs + budget.actions * Data.PROGRESSION_RULES.manualActionWindowMs;

  assert.equal(state.clock.elapsedMs, machineMs);
  assert.equal(budget.actions, 51);
  assert.ok(
    estimatedActiveMs >= Data.PROGRESSION_RULES.openingMinMs &&
      estimatedActiveMs <= Data.PROGRESSION_RULES.openingMaxMs,
    `estimated opening time=${estimatedActiveMs}ms`,
  );
  assert.equal(state.shutdown, false);
  assert.ok(state.resources.core > 0);
  assert.ok(state.resources.energy > 0);
  assert.ok(state.resources.wood >= Data.FOREST_RULES.generatorWoodReserve);
  console.log(
    `opening budget: ${budget.actions} actions, ` +
      `${(estimatedActiveMs / 60000).toFixed(2)} minutes, ` +
      `${state.resources.energy.toFixed(1)} energy, ` +
      `${state.resources.wood.toFixed(1)} wood`,
  );
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
  assert.equal(state.clock.savedAt, 0);
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
  assert.deepEqual(state.world.trees, []);
  assert.deepEqual(state.world.branches, Data.TRACK.branches);
  assert.deepEqual(state.world.branchRespawn, {});
  assert.ok(Data.FOREST_RULES.branchRespawnMs < Data.FOREST_RULES.treeRespawnMs);
  assert.ok(Data.FOREST_RULES.treeRespawnMs >= 300000);
  assert.equal(Data.FOREST_MODEL.branchSites, Data.TRACK.branches.length);
  assert.equal(Data.FOREST_MODEL.branchWoodPerCycle, 24);
  assert.equal(Data.FOREST_MODEL.branchWoodPerMinute, 24);
  assert.equal(Data.FOREST_MODEL.maxGeneratorWoodPerMinute, 3.75);
  assert.equal(Data.FOREST_MODEL.branchSupplyToGeneratorRatio, 6.4);
  assert.equal(Data.FOREST_MODEL.initialSweepEnergy, 10);
  assert.equal(Data.FOREST_MODEL.initialEnergyAfterSweep, 20);

  moveTo(state, Data.TRACK.branches[1]);
  assert.equal(Simulation.performAction(state, "pickup"), true);
  assert.equal(state.resources.wood, Data.FOREST_RULES.woodPerBranch);
  assert.equal(state.world.branches.includes(Data.TRACK.branches[1]), false);
  assert.equal(
    state.world.branchRespawn[Data.TRACK.branches[1]],
    Data.FOREST_RULES.branchRespawnMs,
  );
  state.world.branchRespawn[Data.TRACK.branches[1]] = Data.STEP_MS * 2;
  assert.equal(Simulation.nextBranchRespawnMs(state), Data.STEP_MS * 2);
  advanceFor(state, Data.STEP_MS * 2);
  assert.equal(state.world.branches.includes(Data.TRACK.branches[1]), true);
  assert.equal(
    state.world.branchRespawn[Data.TRACK.branches[1]],
    undefined,
  );
  assert.equal(state.resources.energy, 26);
  assert.equal(Simulation.performAction(state, "burnWood"), true);
  assert.equal(state.resources.wood, Data.FOREST_RULES.woodPerBranch - 1);
  assert.equal(state.resources.energy, 34);
  assert.equal(state.unlocks.workshop, true);
  assert.equal(state.controllers.pickup.available, true);

  state.resources.energy = Data.RESOURCE_LIMITS.energy - Data.FOREST_RULES.energyPerWood + 1;
  const woodBeforeRejectedBurn = state.resources.wood;
  assert.equal(Simulation.performAction(state, "burnWood"), false);
  assert.equal(state.resources.wood, woodBeforeRejectedBurn);

  assert.equal(state.controllers.drive.available, false);
  assert.equal(Simulation.performAction(state, "move"), true);
  assert.equal(state.controllers.drive.available, false);
  assert.equal(Simulation.performAction(state, "move"), true);
  assert.equal(state.controllers.drive.available, true);

  const treeState = Simulation.createState();
  heartbeatThreeTimes(treeState);
  treeState.world.branches = [];
  treeState.world.position = Data.TRACK.trees[0];
  treeState.world.trees = [Data.TRACK.trees[0]];
  treeState.world.treeRespawn = {};
  assert.equal(Simulation.performAction(treeState, "pickup"), true);
  assert.equal(treeState.resources.wood, Data.FOREST_RULES.woodPerTree);
  assert.equal(
    treeState.world.treeRespawn[Data.TRACK.trees[0]],
    Data.FOREST_RULES.treeRespawnMs,
  );
  treeState.world.treeRespawn[Data.TRACK.trees[0]] = Data.STEP_MS * 2;
  advanceFor(treeState, Data.STEP_MS * 2);
  assert.equal(treeState.world.trees.includes(Data.TRACK.trees[0]), true);
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

function testBinaryTreeMining() {
  const state = Simulation.createState();
  heartbeatThreeTimes(state);
  pickupAllBranches(state);
  assert.equal(Simulation.performAction(state, "installController", "heart"), true);
  startAndFinish(state, "mineHead");
  moveTo(state, Data.TRACK.mineEntrance);

  assert.equal(state.unlocks.mining, true);
  assert.equal(state.stage, "mining");
  assert.equal(state.world.depth, 0);
  assert.equal(Simulation.mineBranchProgress(state, "L").required, 2);
  assert.equal(Simulation.mineBranchProgress(state, "R").required, 2);

  assert.equal(Simulation.performAction(state, "digLeft"), true);
  assert.equal(state.world.depth, 0);
  assert.equal(Simulation.mineBranchProgress(state, "L").current, 1);
  assert.equal(Simulation.mineBranchProgress(state, "R").current, 0);
  assert.equal(Simulation.performAction(state, "digLeft"), true);
  assert.equal(state.world.depth, 1);
  assert.equal(state.world.minePath, "L");
  assert.equal(state.resources.material, 2);
  assert.deepEqual(state.world.mineNodes, ["L"]);
  assert.equal(state.controllers.excavator.available, true);

  digOneLayer(state, "R");
  assert.equal(state.world.depth, 2);
  assert.equal(state.world.minePath, "LR");
  assert.equal(state.resources.material, 4);
  assert.equal(state.resources.ore, 2);
  assert.equal(state.milestones.orePickups, 1);

  assert.equal(Simulation.performAction(state, "move"), false);
  assert.equal(Simulation.performAction(state, "ascend"), true);
  assert.equal(state.world.depth, 1);
  assert.equal(state.world.minePath, "L");
  assert.equal(Simulation.mineBranchProgress(state, "R").open, true);
  assert.equal(Simulation.performAction(state, "digRight"), true);
  assert.equal(state.world.depth, 2);
  assert.equal(state.world.minePath, "LR");

  ascendToSurface(state);
  digOneLayer(state, "R");
  ascendToSurface(state);
  assert.equal(Simulation.performAction(state, "digLeft"), true);
  assert.deepEqual(Simulation.visibleMineNodes(state), ["L", "LR"]);

  assert.equal(
    Simulation.performAction(state, "installController", "excavator"),
    true,
  );
  advanceFor(state, 5000);
  assert.ok(state.world.mineNodes.some((path) => path.startsWith("LL")));
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
  assert.equal(state.world.position, Data.TRACK.mineEntrance);
  assert.equal(state.world.minePath, Data.TRACK.anomalyPath);
  assert.equal(state.world.depth, Data.TRACK.anomalyPath.length);
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
  assert.equal(excavatorJob.physical_limits.branch_factor, 2);
  assert.equal(excavatorJob.physical_limits.max_depth, Data.MINING_RULES.maxDepth);
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
function testInnerAwakeningChapter() {
  const state = Simulation.createState();
  reachConfirmedAnomaly(state);
  assert.equal(Simulation.performAction(state, "startJob", "processor"), true);
  advanceFor(state, Data.JOBS.processor.durationMs);

  state.resources.ore = Data.INDUSTRY_RULES.processorRecipeOre;
  advanceFor(state, Data.INDUSTRY_RULES.processorCycleMs);
  assert.equal(state.industry.batches, 1);
  assert.equal(Simulation.jobAvailable(state, "anomalyResearch"), true);

  assert.equal(Simulation.performAction(state, "startJob", "anomalyResearch"), true);
  advanceFor(state, Data.JOBS.anomalyResearch.durationMs);
  assert.equal(state.research.completed, true);
  assert.equal(state.research.modelVersion, Data.RESEARCH_MODEL.version);
  assert.equal(state.research.observations.length, 3);
  assert.equal(Simulation.jobAvailable(state, "lingchu"), true);

  state.resources.parts = Data.JOBS.lingchu.cost.amount;
  assert.equal(Simulation.performAction(state, "startJob", "lingchu"), true);
  advanceFor(state, Data.JOBS.lingchu.durationMs);
  assert.equal(state.structures.lingchu, true);
  assert.equal(state.unlocks.inner, true);
  assert.equal(state.stage, "awakening");

  for (let count = 0; count < Data.INNER_RULES.manualPulsesRequired; count += 1) {
    assert.equal(Simulation.performAction(state, "innerPulse"), true);
    advanceFor(state, Data.INNER_RULES.pulseDurationMs);
  }
  assert.equal(state.inner.observations.length, Data.INNER_RULES.manualPulsesRequired);
  assert.deepEqual(
    state.inner.observations.map((observation) => observation.pulse),
    [1, 2, 3],
  );
  assert.ok(state.inner.observations.every((observation) => observation.eventCount === 0));
  assert.equal(Simulation.performAction(state, "innerPulse"), false);
  assert.equal(state.inner.manualPulses, Data.INNER_RULES.manualPulsesRequired);
  assert.equal(state.stage, "inner");
  assert.ok(Simulation.innerMetrics(state).dantian.pressure > 0);
  assert.equal(Simulation.innerMetrics(state).faults.length, 0);

  const loaded = Simulation.normalizeState(JSON.parse(JSON.stringify(state)));
  assert.equal(loaded.inner.manualPulses, Data.INNER_RULES.manualPulsesRequired);
  assert.equal(loaded.inner.observations.length, Data.INNER_RULES.manualPulsesRequired);
  assert.deepEqual(
    loaded.inner.observations.map((observation) => observation.pulse),
    [1, 2, 3],
  );
  assert.ok(loaded.inner.kernel.nodes.dantian.pressure > 0);
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
  state.world.position = Data.TRACK.mineEntrance;
  state.world.depth = 2;
  state.world.minePath = "LR";
  state.world.mineNodes = ["L", "LR"];
  state.world.mineProgress = { "LRR": 2 };
  const loaded = Simulation.normalizeState(JSON.parse(JSON.stringify(state)));
  assert.equal(loaded.world.depth, 2);
  assert.equal(loaded.world.minePath, "LR");
  assert.deepEqual(loaded.world.mineNodes, ["L", "LR"]);
  assert.equal(loaded.world.mineProgress.LRR, 2);
  assert.equal(loaded.resources.ore, 7);
  assert.equal(loaded.resources.parts, 3);
  assert.equal(loaded.industry.batches, 2);

  const raw = Simulation.createState();
  raw.world.trees = [2, 2, 99];
  raw.world.treeRespawn = {
    5: 5000,
    7: Data.FOREST_RULES.treeRespawnMs + 25000,
  };
  raw.world.branches = [1, 1, 99];
  raw.world.branchRespawn = {
    3: 5000,
    4: Data.FOREST_RULES.branchRespawnMs + 25000,
  };
  raw.world.minePath = "LR";
  raw.world.mineNodes = ["L", "LR", "LR", "bad", "L".repeat(13)];
  raw.world.mineProgress = { LRL: 1, LRR: 99, bad: 1, R: 1 };
  const sanitized = Simulation.normalizeState(JSON.parse(JSON.stringify(raw)));
  assert.deepEqual(sanitized.world.trees, [2]);
  assert.equal(sanitized.world.treeRespawn[5], 5000);
  assert.equal(sanitized.world.treeRespawn[7], Data.FOREST_RULES.treeRespawnMs);
  assert.deepEqual(sanitized.world.branches, [1]);
  assert.equal(sanitized.world.branchRespawn[3], 5000);
  assert.equal(
    sanitized.world.branchRespawn[4],
    Data.FOREST_RULES.branchRespawnMs,
  );
  assert.deepEqual(sanitized.world.mineNodes, ["L", "LR"]);
  assert.equal(sanitized.world.mineProgress.LRL, 1);
  assert.equal(sanitized.world.mineProgress.LRR, 2);
  assert.equal(sanitized.world.mineProgress.R, 1);
  assert.equal(sanitized.world.mineProgress.bad, undefined);

  const legacy = Simulation.createState();
  delete legacy.world.minePath;
  delete legacy.world.mineNodes;
  delete legacy.world.mineProgress;
  legacy.world.position = 7;
  legacy.world.depth = 2;
  legacy.world.excavated = ["7:1", "7:2"];
  legacy.world.digProgress = { "7:3": 2 };
  const migratedMine = Simulation.normalizeState(JSON.parse(JSON.stringify(legacy)));
  assert.equal(migratedMine.world.position, Data.TRACK.mineEntrance);
  assert.equal(migratedMine.world.depth, 2);
  assert.ok(migratedMine.world.minePath);
  assert.ok(migratedMine.world.mineNodes.includes(migratedMine.world.minePath));

  const legacyWorkshop = Simulation.createState();
  legacyWorkshop.structures.bench = true;
  const migrated = Simulation.normalizeState(JSON.parse(JSON.stringify(legacyWorkshop)));
  assert.equal(migrated.structures.mineHead, true);
  assert.equal(migrated.unlocks.mining, true);
}

testInitialRecovery();
testForestFuelLoop();
testOpeningRouteBudget();
testWoodGenerator();
testBinaryTreeMining();
testIndustryChapter();
testInnerAwakeningChapter();
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
