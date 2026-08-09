// Deterministic survival simulation. DOM and localStorage access stay outside this module.
(function defineSilidoxSimulation(global) {
  const {
    CONTROLLERS,
    FOREST_RULES,
    INDUSTRY_RULES,
    INNER_RULES,
    JOBS,
    MINING_RULES,
    OPENING_ORIGINS,
    RESEARCH_MODEL,
    RESOURCE_LIMITS,
    STARTING_RESOURCES,
    SURVIVAL_RULES,
    TRACK,
  } = global.SilidoxData;

  function createState(legacyArchive = null) {
    return {
      version: 2,
      origin: createOriginState(false),
      stage: "recovery",
      clock: {
        elapsedMs: 0,
        paused: false,
        savedAt: 0,
      },
      resources: { ...STARTING_RESOURCES },
      unlocks: {
        body: true,
        environment: false,
        workshop: false,
        mining: false,
        anomaly: false,
        research: false,
        inner: false,
      },
      milestones: {
        manualHeartbeats: 0,
        manualMoves: 0,
        branchPickups: 0,
        chops: 0,
        fuelBurns: 0,
        digs: 0,
        deepestDepth: 0,
        orePickups: 0,
        shutdowns: 0,
      },
      controllers: {
        heart: createControllerState("heart"),
        drive: createControllerState("drive"),
        pickup: createControllerState("pickup"),
        excavator: createControllerState("excavator"),
      },
      structures: {
        mineHead: false,
        bench: false,
        generator: false,
        sensor: false,
        processor: false,
        lingchu: false,
      },
      control: {
        currentLoad: 0,
        lifetimeWork: 0,
      },
      emergency: {
        charge: 3,
        rechargeMs: 0,
        restartPulses: 0,
      },
      world: {
        position: TRACK.start,
        depth: 0,
        direction: 1,
        trees: [],
        treeRespawn: initialTreeRespawn(),
        branches: [...TRACK.branches],
        branchRespawn: {},
        minePath: null,
        mineNodes: [],
        mineProgress: {},
      },
      anomaly: {
        revealed: false,
        samples: 0,
        confirmed: false,
      },
      research: {
        modelVersion: 0,
        completed: false,
        observations: [],
        conclusions: [],
      },
      industry: {
        processorMs: 0,
        batches: 0,
      },
      inner: null,
      job: null,
      shutdown: false,
      legacyArchive,
      logs: [
        createLog("info", "损坏前最后可恢复记录：克尔黑洞取能环。", 0),
        createLog("warn", "核心循环尚未稳定。释放三次手动脉冲以恢复机体。", 0),
        createLog("info", "当前只能读取最低限度的机体状态。", 0),
      ],
    };
  }
  function initialTreeRespawn() {
    return Object.fromEntries(
      TRACK.trees.map((position, index) => [
        position,
        FOREST_RULES.initialTreeGrowthMs +
          index * FOREST_RULES.initialTreeGrowthStepMs,
      ]),
    );
  }

  function createOriginState(openingViewed) {
    const origin = OPENING_ORIGINS.kerrBlackHole;
    return {
      id: origin.id,
      name: origin.name,
      memory: origin.memory,
      accident: origin.accident,
      openingViewed: Boolean(openingViewed),
      openingCompletedAtMs: null,
      pausedBeforeOpening: null,
    };
  }

  function createControllerState(id) {
    return {
      id,
      available: false,
      installed: false,
      mode: "manual",
      intervalMs: 0,
      scanMs: 0,
      lastScanCost: 0,
      outputCount: 0,
      energySpent: 0,
    };
  }

  function normalizeState(value, legacyArchive = null) {
    if (!value || typeof value !== "object" || value.version !== 2) {
      return createState(legacyArchive);
    }

    const base = createState(value.legacyArchive ?? legacyArchive);
    base.origin = normalizeOriginState(value.origin);
    base.stage = typeof value.stage === "string" ? value.stage : base.stage;
    base.clock.elapsedMs = finite(value.clock?.elapsedMs, 0, Number.MAX_SAFE_INTEGER);
    base.clock.paused = Boolean(value.clock?.paused);
    base.clock.savedAt = finite(value.clock?.savedAt, 0, Number.MAX_SAFE_INTEGER);

    for (const resource of Object.keys(base.resources)) {
      base.resources[resource] = finite(
        value.resources?.[resource],
        0,
        RESOURCE_LIMITS[resource],
      );
    }

    for (const key of Object.keys(base.unlocks)) {
      base.unlocks[key] = Boolean(value.unlocks?.[key]);
    }
    base.unlocks.body = true;

    for (const key of Object.keys(base.milestones)) {
      base.milestones[key] = Math.floor(finite(value.milestones?.[key], 0, 999999));
    }
    if (value.milestones?.chops == null && value.milestones?.pickups != null) {
      base.milestones.chops = Math.floor(finite(value.milestones.pickups, 0, 999999));
    }

    for (const id of Object.keys(base.controllers)) {
      const stored = value.controllers?.[id];
      if (!stored || typeof stored !== "object") continue;
      base.controllers[id] = {
        ...base.controllers[id],
        available: Boolean(stored.available),
        installed: Boolean(stored.installed),
        mode: ["manual", "preset", "ladder"].includes(stored.mode)
          ? stored.mode
          : "manual",
        intervalMs: finite(stored.intervalMs, 0, 600000),
        scanMs: finite(stored.scanMs, 0, 600000),
        lastScanCost: finite(stored.lastScanCost, 0, 999999),
        outputCount: Math.floor(finite(stored.outputCount, 0, 999999999)),
        energySpent: finite(stored.energySpent, 0, 999999999),
      };
      if (!base.controllers[id].installed) base.controllers[id].mode = "manual";
    }

    for (const key of Object.keys(base.structures)) {
      base.structures[key] = Boolean(value.structures?.[key]);
    }

    base.control.currentLoad = finite(value.control?.currentLoad, 0, 999999);
    base.control.lifetimeWork = finite(value.control?.lifetimeWork, 0, 999999999);
    base.emergency.charge = Math.floor(finite(value.emergency?.charge, 0, 3));
    base.emergency.rechargeMs = finite(value.emergency?.rechargeMs, 0, 60000);
    base.emergency.restartPulses = Math.floor(
      finite(value.emergency?.restartPulses, 0, SURVIVAL_RULES.emergencyPulsesRequired),
    );

    base.world.position = Math.floor(finite(value.world?.position, 0, TRACK.length - 1));
    base.world.direction = value.world?.direction === -1 ? -1 : 1;
    base.world.trees = Array.isArray(value.world?.trees)
      ? value.world.trees
          .filter((position) => Number.isInteger(position) && TRACK.trees.includes(position))
          .filter((position, index, list) => list.indexOf(position) === index)
      : [...TRACK.trees];
    base.world.branches = Array.isArray(value.world?.branches)
      ? value.world.branches
          .filter((position) => Number.isInteger(position) && TRACK.branches.includes(position))
          .filter((position, index, list) => list.indexOf(position) === index)
      : [];
    base.world.branchRespawn = {};
    if (value.world?.branchRespawn && typeof value.world.branchRespawn === "object") {
      for (const position of TRACK.branches) {
        const remaining = Number(value.world.branchRespawn[position]);
        if (Number.isFinite(remaining)) {
          base.world.branchRespawn[position] = Math.max(
            0,
            Math.min(remaining, FOREST_RULES.branchRespawnMs),
          );
        }
      }
    }
    for (const position of TRACK.branches) {
      if (
        !base.world.branches.includes(position) &&
        !Object.hasOwn(base.world.branchRespawn, position)
      ) {
        base.world.branchRespawn[position] = FOREST_RULES.branchRespawnMs;
      }
    }
    base.world.treeRespawn = {};
    if (value.world?.treeRespawn && typeof value.world.treeRespawn === "object") {
      for (const position of TRACK.trees) {
        const remaining = Number(value.world.treeRespawn[position]);
        if (Number.isFinite(remaining)) {
          base.world.treeRespawn[position] = Math.max(
            0,
            Math.min(remaining, FOREST_RULES.treeRespawnMs),
          );
        }
      }
    }
    for (const position of TRACK.trees) {
      if (
        !base.world.trees.includes(position) &&
        !Object.hasOwn(base.world.treeRespawn, position)
      ) {
        base.world.treeRespawn[position] = FOREST_RULES.treeRespawnMs;
      }
    }
    const storedMineNodes = Array.isArray(value.world?.mineNodes)
      ? value.world.mineNodes.filter(validMinePath)
      : [];
    base.world.mineNodes = [];
    for (const path of storedMineNodes) {
      addMinePathWithAncestors(base.world.mineNodes, path);
    }
    if (base.world.mineNodes.length === 0 && Array.isArray(value.world?.excavated)) {
      for (const key of value.world.excavated) {
        if (!validLegacyMineCellKey(key)) continue;
        const cell = parseLegacyMineCellKey(key);
        addMinePathWithAncestors(base.world.mineNodes, legacyMinePath(cell.position, cell.depth));
      }
    }
    base.world.mineNodes = [...new Set(base.world.mineNodes)].sort(compareMinePaths);

    const storedPath = validMinePath(value.world?.minePath) ? value.world.minePath : null;
    const legacyDepth = Math.floor(finite(value.world?.depth, 0, MINING_RULES.maxDepth));
    if (storedPath && base.world.mineNodes.includes(storedPath)) {
      base.world.minePath = storedPath;
    } else if (legacyDepth > 0) {
      base.world.minePath = legacyMinePath(base.world.position, legacyDepth);
      addMinePathWithAncestors(base.world.mineNodes, base.world.minePath);
    }
    if (base.world.minePath) base.world.position = TRACK.mineEntrance;
    base.world.depth = base.world.minePath?.length ?? 0;

    base.world.mineProgress = {};
    const storedProgress = value.world?.mineProgress;
    if (storedProgress && typeof storedProgress === "object") {
      for (const [path, progress] of Object.entries(storedProgress)) {
        restoreMineProgress(base.world, path, progress);
      }
    } else if (value.world?.digProgress && typeof value.world.digProgress === "object") {
      for (const [key, progress] of Object.entries(value.world.digProgress)) {
        if (!validLegacyMineCellKey(key)) continue;
        const cell = parseLegacyMineCellKey(key);
        restoreMineProgress(base.world, legacyMinePath(cell.position, cell.depth), progress);
      }
    }

    const excavatedDepths = base.world.mineNodes.map((path) => path.length);
    base.milestones.digs = Math.max(base.milestones.digs, base.world.mineNodes.length);
    base.milestones.deepestDepth = Math.max(
      base.milestones.deepestDepth,
      base.world.depth,
      ...excavatedDepths,
    );

    base.anomaly.revealed = Boolean(value.anomaly?.revealed);
    base.anomaly.samples = Math.floor(finite(value.anomaly?.samples, 0, 3));
    base.anomaly.confirmed = Boolean(value.anomaly?.confirmed);
    base.research.modelVersion = Math.floor(
      finite(value.research?.modelVersion, 0, 1),
    );
    base.research.completed = Boolean(value.research?.completed);
    base.research.observations = normalizeResearchRecords(value.research?.observations);
    base.research.conclusions = normalizeResearchRecords(value.research?.conclusions);
    base.industry.processorMs = finite(value.industry?.processorMs, 0, 600000);
    base.industry.batches = Math.floor(finite(value.industry?.batches, 0, 999999));
    base.inner = normalizeInnerRuntime(value.inner);
    if (base.structures.lingchu && !base.inner) {
      base.inner = createInnerRuntime();
    }
    base.shutdown = Boolean(value.shutdown);
    if (base.shutdown) base.resources.core = 0;

    if (value.job && JOBS[value.job.id]) {
      const definition = JOBS[value.job.id];
      base.job = {
        id: definition.id,
        durationMs: definition.durationMs,
        remainingMs: finite(value.job.remainingMs, 0, definition.durationMs),
      };
    }

    if (Array.isArray(value.logs)) {
      base.logs = value.logs
        .slice(-80)
        .filter((entry) => entry && typeof entry.text === "string")
        .map((entry) =>
          createLog(
            ["info", "good", "warn", "bad"].includes(entry.type) ? entry.type : "info",
            entry.text,
            finite(entry.atMs, 0, Number.MAX_SAFE_INTEGER),
          ),
        );
    }

    applyDerivedUnlocks(base);
    return base;
  }

  function normalizeOriginState(value) {
    if (!value || typeof value !== "object") {
      return createOriginState(true);
    }
    const isKnownOrigin = value.id === OPENING_ORIGINS.kerrBlackHole.id;
    const origin = createOriginState(
      isKnownOrigin ? Boolean(value.openingViewed) : true,
    );
    origin.openingCompletedAtMs =
      value.openingCompletedAtMs == null
        ? null
        : finite(value.openingCompletedAtMs, 0, Number.MAX_SAFE_INTEGER);
    origin.pausedBeforeOpening =
      value.pausedBeforeOpening == null ? null : Boolean(value.pausedBeforeOpening);
    return origin;
  }

  function finite(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.min(max, Math.max(min, number));
  }
  function normalizeResearchRecords(value) {
    if (!Array.isArray(value)) return [];
    return value
      .slice(-12)
      .filter((record) => record && typeof record === "object")
      .map((record) => ({
        id: typeof record.id === "string" ? record.id : "unknown",
        label: typeof record.label === "string" ? record.label : "未命名观测",
        value: typeof record.value === "string" ? record.value : "未记录",
        confidence: typeof record.confidence === "string" ? record.confidence : "unknown",
      }));
  }
  function normalizeInnerObservations(value) {
    if (!Array.isArray(value)) return [];
    return value
      .slice(-12)
      .filter((observation) => observation && typeof observation === "object")
      .map((observation, index) => ({
        id:
          typeof observation.id === "string"
            ? observation.id
            : `pulse-${index + 1}`,
        pulse: Math.floor(
          finite(
            observation.pulse,
            index + 1,
            INNER_RULES.manualPulsesRequired,
          ),
        ),
        atStep: Math.floor(finite(observation.atStep, 0, 999999)),
        touchPressure: finite(observation.touchPressure, 0, 999),
        refinePressure: finite(observation.refinePressure, 0, 999),
        dantianPressure: finite(observation.dantianPressure, 0, 999),
        purity: finite(observation.purity, 0, 1),
        temperature: finite(observation.temperature, 20, 300),
        stability: finite(observation.stability, 0, 100),
        faults: Array.isArray(observation.faults)
          ? observation.faults
              .filter((fault) => typeof fault === "string")
              .slice(0, 12)
          : [],
        eventCount: Math.floor(finite(observation.eventCount, 0, 80)),
      }));
  }


  function createInnerRuntime() {
    const kernel = global.SilidoxInnerLandscape;
    if (!kernel?.createInnerState) return null;
    return {
      version: 1,
      active: false,
      pulseMs: 0,
      manualPulses: 0,
      lastEventCount: 0,
      observations: [],
      kernel: kernel.createInnerState(),
    };
  }

  function normalizeInnerRuntime(value) {
    if (!value || typeof value !== "object") return null;
    const kernel = global.SilidoxInnerLandscape;
    if (!kernel?.normalizeInnerState) return null;
    return {
      version: 1,
      active: Boolean(value.active) && finite(value.pulseMs, 0, INNER_RULES.pulseDurationMs) > 0,
      pulseMs: finite(value.pulseMs, 0, INNER_RULES.pulseDurationMs),
      manualPulses: Math.floor(
        finite(value.manualPulses, 0, INNER_RULES.manualPulsesRequired),
      ),
      lastEventCount: Math.floor(finite(value.lastEventCount, 0, 999999)),
      observations: normalizeInnerObservations(value.observations),
      kernel: kernel.normalizeInnerState(value.kernel),
    };
  }

  function createLog(type, text, atMs) {
    return { type, text, atMs };
  }

  function log(state, type, text) {
    state.logs.push(createLog(type, text, state.clock.elapsedMs));
    if (state.logs.length > 80) state.logs.splice(0, state.logs.length - 80);
  }

  function advance(state, deltaMs, evaluateProgram = null) {
    if (state.clock.paused || deltaMs <= 0) return state;

    const boundedDelta = Math.min(deltaMs, 1000);
    state.clock.elapsedMs += boundedDelta;

    if (state.shutdown) {
      advanceEmergencyCharge(state, boundedDelta);
      state.control.currentLoad = 0;
      if (state.inner) {
        state.inner.active = false;
        state.inner.pulseMs = 0;
      }
      return state;
    }

    state.resources.core = clampResource(
      "core",
      state.resources.core -
        (SURVIVAL_RULES.coreDecayPerSecond * boundedDelta) / 1000,
    );

    if (state.resources.core <= 0) {
      enterShutdown(state);
      return state;
    }

    advanceWoodGenerator(state, boundedDelta);

    advanceJob(state, boundedDelta);
    advanceControllers(state, boundedDelta, evaluateProgram);
    advanceBranches(state, boundedDelta);
    advanceTrees(state, boundedDelta);
    advanceProcessor(state, boundedDelta);
    advanceInner(state, boundedDelta);
    applyControlEnergy(state, boundedDelta);
    return state;
  }

  function advanceEmergencyCharge(state, deltaMs) {
    if (state.emergency.charge >= SURVIVAL_RULES.emergencyPulsesRequired) return;
    state.emergency.rechargeMs += deltaMs;
    while (
      state.emergency.rechargeMs >= SURVIVAL_RULES.emergencyRechargeMs &&
      state.emergency.charge < SURVIVAL_RULES.emergencyPulsesRequired
    ) {
      state.emergency.rechargeMs -= SURVIVAL_RULES.emergencyRechargeMs;
      state.emergency.charge += 1;
    }
  }

  function enterShutdown(state) {
    state.resources.core = 0;
    state.shutdown = true;
    state.milestones.shutdowns += 1;
    state.emergency.charge = 0;
    state.emergency.rechargeMs = 0;
    state.emergency.restartPulses = 0;
    log(state, "bad", "核心归零，机体进入低功耗停机。已有进度保持不变。");
  }

  function applyControlEnergy(state, deltaMs) {
    const load = calculateControlLoad(state);
    state.control.currentLoad = load;
    state.control.lifetimeWork += (load * deltaMs) / 1000;
    const energy =
      load * SURVIVAL_RULES.controlEnergyPerWork * (deltaMs / 1000);
    if (energy > 0) addResource(state, "energy", -energy);
  }

  function advanceWoodGenerator(state, deltaMs) {
    const availableWood = state.resources.wood - FOREST_RULES.generatorWoodReserve;
    if (!state.structures.generator || availableWood <= 0) return;
    const needed = Math.max(
      0,
      FOREST_RULES.generatorReserveTarget - state.resources.energy,
    );
    if (needed <= 0) return;

    const generated = Math.min(
      needed,
      (FOREST_RULES.generatorEnergyPerSecond * deltaMs) / 1000,
      availableWood * FOREST_RULES.energyPerWood,
    );
    if (generated <= 0) return;
    spendResource(state, "wood", generated / FOREST_RULES.energyPerWood);
    addResource(state, "energy", generated);
  }

  function calculateControlLoad(state) {
    return Object.values(state.controllers).reduce((total, controller) => {
      if (!controller.installed || controller.mode === "manual") return total;
      if (controller.mode === "preset") {
        return total + CONTROLLERS[controller.id].presetLoad;
      }
      return total + controller.lastScanCost;
    }, 0);
  }

  function advanceControllers(state, deltaMs, evaluateProgram) {
    for (const controller of Object.values(state.controllers)) {
      if (!controller.installed || controller.mode === "manual") continue;
      if (controller.mode === "preset") {
        advancePresetController(state, controller, deltaMs);
      } else {
        advanceLadderController(state, controller, deltaMs, evaluateProgram);
      }
    }
  }

  function advancePresetController(state, controller, deltaMs) {
    const definition = CONTROLLERS[controller.id];
    controller.intervalMs += deltaMs;
    if (controller.intervalMs < definition.presetIntervalMs) return;
    controller.intervalMs %= definition.presetIntervalMs;

    if (controller.id === "heart") applyHeartbeat(state, "preset");
    if (controller.id === "drive") presetDrive(state);
    if (controller.id === "pickup") pickup(state, "preset");
    if (controller.id === "excavator") presetExcavator(state);
  }

  function advanceLadderController(state, controller, deltaMs, evaluateProgram) {
    controller.scanMs += deltaMs;
    if (
      controller.scanMs < SURVIVAL_RULES.controllerScanMs ||
      typeof evaluateProgram !== "function"
    ) {
      return;
    }
    controller.scanMs %= SURVIVAL_RULES.controllerScanMs;

    const definition = CONTROLLERS[controller.id];
    const result =
      evaluateProgram(definition.programId, controlSignals(state, controller.id)) ?? {};
    const outputs = Array.isArray(result.outputs) ? result.outputs : [];
    controller.lastScanCost = finite(result.scanCost, 0, 999999);
    if (outputs.length === 0) return;

    if (controller.id === "heart" && outputs.includes("Q0")) {
      applyHeartbeat(state, "ladder");
    }
    if (controller.id === "drive") {
      if (outputs.includes("Q2")) ascend(state, "ladder");
      else if (outputs.includes("Q1")) reverse(state, "ladder");
      else if (outputs.includes("Q0")) move(state, "ladder");
    }
    if (controller.id === "pickup" && outputs.includes("Q0")) {
      pickup(state, "ladder");
    }
    if (controller.id === "excavator") {
      if (outputs.includes("Q1")) digBranch(state, "R", "ladder");
      else if (outputs.includes("Q0")) digBranch(state, "L", "ladder");
    }
  }

  function controlSignals(state, controllerId) {
    if (controllerId === "heart") {
      return {
        I0: state.resources.core <= 50,
        I1: state.shutdown,
        0: false,
        1: true,
      };
    }
    if (controllerId === "drive") {
      return {
        I0: atBoundary(state),
        I1: state.world.position === TRACK.start,
        I2: state.world.depth > 0,
        0: false,
        1: true,
      };
    }
    if (controllerId === "excavator") {
      return {
        I0: canDigBranch(state, "L"),
        I1: canDigBranch(state, "R"),
        I2: state.world.depth < MINING_RULES.maxDepth,
        0: false,
        1: true,
      };
    }
    return {
      I0: pickupAvailable(state),
      0: false,
      1: true,
    };
  }

  function performAction(state, action, payload = null) {
    if (action === "togglePause") {
      state.clock.paused = !state.clock.paused;
      return true;
    }
    if (action === "completeOpening") return completeOpening(state);
    if (action === "emergencyPulse") return emergencyPulse(state);
    if (state.shutdown) return false;

    if (action === "heartbeat") return manualHeartbeat(state);
    if (action === "move") return move(state, "manual");
    if (action === "reverse") return reverse(state, "manual");
    if (action === "pickup") return pickup(state, "manual");
    if (action === "digLeft") return digBranch(state, "L", "manual");
    if (action === "digRight") return digBranch(state, "R", "manual");
    if (action === "digDown") return digBranch(state, "L", "manual");
    if (action === "ascend") return ascend(state, "manual");
    if (action === "burnWood") return burnWood(state);
    if (action === "innerPulse") return innerPulse(state);
    if (action === "installController") return installController(state, payload);
    if (action === "setControllerMode") {
      return setControllerMode(state, payload?.id, payload?.mode);
    }
    if (action === "startJob") return startJob(state, payload);
    return false;
  }

  function completeOpening(state) {
    if (!state.origin) state.origin = createOriginState(false);
    if (state.origin.openingViewed) return false;
    state.origin.openingViewed = true;
    state.origin.openingCompletedAtMs = state.clock.elapsedMs;
    state.origin.pausedBeforeOpening = null;
    log(state, "info", "巨构施工记录已归档：保留引力与时空数据残片。");
    return true;
  }

  function manualHeartbeat(state) {
    const applied = applyHeartbeat(state, "manual");
    if (!applied) return false;

    state.milestones.manualHeartbeats += 1;
    if (state.milestones.manualHeartbeats >= 3) {
      state.controllers.heart.available = true;
    }
    if (!state.unlocks.environment && state.resources.core >= 75) {
      state.unlocks.environment = true;
      state.stage = "survival";
      log(state, "good", "核心响应稳定。环境执行器已经解除锁定。");
    }
    return true;
  }

  function applyHeartbeat(state, source) {
    if (!spendResource(state, "energy", SURVIVAL_RULES.manualHeartbeatEnergy)) {
      if (source === "manual") log(state, "warn", "能源不足，无法释放核心脉冲。");
      return false;
    }

    addResource(state, "core", SURVIVAL_RULES.heartbeatRestore);
    const controller = state.controllers.heart;
    controller.outputCount += 1;
    controller.energySpent += SURVIVAL_RULES.manualHeartbeatEnergy;
    if (source === "manual") {
      log(state, "good", `手动脉冲完成，核心恢复至 ${Math.ceil(state.resources.core)}%。`);
    }
    return true;
  }

  function emergencyPulse(state) {
    if (!state.shutdown || state.emergency.charge < 1) return false;
    state.emergency.charge -= 1;
    state.emergency.restartPulses += 1;
    if (state.emergency.restartPulses < SURVIVAL_RULES.emergencyPulsesRequired) {
      log(
        state,
        "warn",
        `应急起搏 ${state.emergency.restartPulses}/${SURVIVAL_RULES.emergencyPulsesRequired}。`,
      );
      return true;
    }

    state.shutdown = false;
    state.resources.core = 25;
    state.resources.energy = Math.max(state.resources.energy, 3);
    state.emergency.charge = 0;
    state.emergency.restartPulses = 0;
    log(state, "good", "低功耗重启完成。机体恢复响应。");
    return true;
  }

  function move(state, source) {
    if (!state.unlocks.environment || state.world.depth > 0 || atBoundary(state)) return false;
    if (!spendResource(state, "energy", SURVIVAL_RULES.moveEnergy)) return false;
    state.world.position += state.world.direction;
    state.controllers.drive.outputCount += 1;
    state.controllers.drive.energySpent += SURVIVAL_RULES.moveEnergy;
    if (source === "manual") {
      state.milestones.manualMoves += 1;
      if (state.milestones.manualMoves >= 3) state.controllers.drive.available = true;
      log(state, "info", `沿地表移动至横向位置 ${state.world.position}。`);
    }
    return true;
  }

  function reverse(state, source) {
    if (!state.unlocks.environment || state.world.depth > 0) return false;
    if (!spendResource(state, "energy", SURVIVAL_RULES.reverseEnergy)) return false;
    state.world.direction *= -1;
    state.controllers.drive.outputCount += 1;
    state.controllers.drive.energySpent += SURVIVAL_RULES.reverseEnergy;
    if (source === "manual") log(state, "info", "行走方向已切换。");
    return true;
  }

  function presetDrive(state) {
    if (state.world.depth > 0) return;
    if (atBoundary(state)) reverse(state, "preset");
    else move(state, "preset");
  }

  function pickup(state, source) {
    if (!state.unlocks.environment || state.world.depth > 0) return false;
    if (branchAtPosition(state)) return pickupBranch(state, source);
    if (treeAtPosition(state)) return harvestTree(state, source);
    return false;
  }

  function pickupBranch(state, source) {
    if (!spendResource(state, "energy", SURVIVAL_RULES.pickupEnergy)) return false;
    state.world.branches = state.world.branches.filter(
      (position) => position !== state.world.position,
    );
    state.world.branchRespawn[state.world.position] = FOREST_RULES.branchRespawnMs;
    addResource(state, "wood", FOREST_RULES.woodPerBranch);
    state.milestones.branchPickups += 1;
    recordPickup(state);
    if (source === "manual") {
      log(
        state,
        "good",
        `拾取树枝完成：木材 +${FOREST_RULES.woodPerBranch}。可用于建设或投入燃烧。`,
      );
    }
    return true;
  }

  function harvestTree(state, source) {
    if (!spendResource(state, "energy", SURVIVAL_RULES.pickupEnergy)) return false;
    state.world.trees = state.world.trees.filter(
      (position) => position !== state.world.position,
    );
    state.world.treeRespawn[state.world.position] = FOREST_RULES.treeRespawnMs;
    addResource(state, "wood", FOREST_RULES.woodPerTree);
    state.milestones.chops += 1;
    recordPickup(state);
    if (source === "manual") {
      log(
        state,
        "good",
        `伐木完成：木材 +${FOREST_RULES.woodPerTree}。下一轮林木再生很慢。`,
      );
    }
    return true;
  }

  function recordPickup(state) {
    state.controllers.pickup.outputCount += 1;
    state.controllers.pickup.energySpent += SURVIVAL_RULES.pickupEnergy;
    state.controllers.pickup.available = true;
    state.unlocks.workshop = true;
  }

  function presetExcavator(state) {
    if (state.world.depth >= MINING_RULES.maxDepth) return ascend(state, "preset");
    const left = mineTargetPath(state, "L");
    const right = mineTargetPath(state, "R");
    if (left && !state.world.mineNodes.includes(left)) return digBranch(state, "L", "preset");
    if (right && !state.world.mineNodes.includes(right)) return digBranch(state, "R", "preset");
    if (state.world.depth > 0) return ascend(state, "preset");
    return false;
  }

  function digBranch(state, branch, source) {
    if (!canDigBranch(state, branch)) return false;
    const targetPath = mineTargetPath(state, branch);
    const targetDepth = targetPath.length;
    const excavator = state.controllers.excavator;

    if (state.world.mineNodes.includes(targetPath)) {
      if (!spendResource(state, "energy", MINING_RULES.verticalMoveEnergy)) return false;
      state.world.minePath = targetPath;
      state.world.depth = targetDepth;
      state.world.position = TRACK.mineEntrance;
      excavator.outputCount += 1;
      excavator.energySpent += MINING_RULES.verticalMoveEnergy;
      if (source === "manual") {
        log(state, "info", `进入${branch === "L" ? "左下" : "右下"}支路，当前深度 ${targetDepth}。`);
      }
      return true;
    }

    if (!spendResource(state, "energy", MINING_RULES.digEnergy)) return false;
    const progress = (state.world.mineProgress[targetPath] ?? 0) + 1;
    state.world.mineProgress[targetPath] = progress;
    excavator.outputCount += 1;
    excavator.energySpent += MINING_RULES.digEnergy;

    const required = hardnessAtDepth(targetDepth);
    if (progress < required) {
      if (source === "manual") {
        log(
          state,
          "info",
          `${branch === "L" ? "左下" : "右下"}岩层掘进 ${progress}/${required}。`,
        );
      }
      return true;
    }

    delete state.world.mineProgress[targetPath];
    state.world.mineNodes.push(targetPath);
    state.world.mineNodes.sort(compareMinePaths);
    state.world.minePath = targetPath;
    state.world.depth = targetDepth;
    state.world.position = TRACK.mineEntrance;
    const material = materialAtDepth(targetDepth);
    const ore = oreAtPath(targetPath);
    addResource(state, "material", material);
    if (ore > 0) {
      addResource(state, "ore", ore);
      state.milestones.orePickups += 1;
    }
    state.milestones.digs += 1;
    state.milestones.deepestDepth = Math.max(
      state.milestones.deepestDepth,
      targetDepth,
    );
    excavator.available = true;
    if (source === "manual") {
      const oreText = ore > 0 ? `，矿石 +${ore}` : "";
      log(
        state,
        "good",
        `击穿${branch === "L" ? "左下" : "右下"}支路至深度 ${targetDepth}：结构料 +${material}${oreText}。`,
      );
    }
    return true;
  }

  function ascend(state, source) {
    if (!state.unlocks.mining || state.world.depth <= 0) return false;
    if (!spendResource(state, "energy", MINING_RULES.verticalMoveEnergy)) return false;
    const parentPath = state.world.minePath.slice(0, -1);
    state.world.minePath = parentPath || null;
    state.world.depth = parentPath.length;
    state.world.position = TRACK.mineEntrance;
    state.controllers.drive.outputCount += 1;
    state.controllers.drive.energySpent += MINING_RULES.verticalMoveEnergy;
    if (source === "manual") {
      log(
        state,
        "info",
        state.world.depth === 0 ? "已经向上到矿井入口。" : `向上，当前深度 ${state.world.depth}。`,
      );
    }
    return true;
  }

  function burnWood(state) {
    if (!state.unlocks.environment || state.clock.paused || state.shutdown) return false;
    if (state.resources.wood < FOREST_RULES.manualBurnWood) return false;
    const capacity = RESOURCE_LIMITS.energy - state.resources.energy;
    if (capacity + 0.0001 < FOREST_RULES.energyPerWood) return false;

    spendResource(state, "wood", FOREST_RULES.manualBurnWood);
    const gained = FOREST_RULES.energyPerWood;
    addResource(state, "energy", gained);
    state.milestones.fuelBurns += 1;
    log(state, "good", `投入 ${FOREST_RULES.manualBurnWood} 木材，能源 +${formatAmount(gained)}。`);
    return true;
  }
  function innerPulse(state) {
    const kernel = global.SilidoxInnerLandscape;
    if (
      !state.unlocks.inner ||
      !state.inner ||
      !kernel ||
      state.clock.paused ||
      state.shutdown ||
      state.inner.active ||
      state.inner.manualPulses >= INNER_RULES.manualPulsesRequired
    ) {
      return false;
    }
    if (!spendResource(state, "energy", INNER_RULES.pulseEnergy)) {
      log(state, "warn", "能源不足，无法启动低功率引灵脉冲。");
      return false;
    }
    kernel.applyControl(state.inner.kernel, {
      mode: "quiet",
      reliefOpen: 0,
      purgeOpen: 0,
    });
    state.inner.active = true;
    state.inner.pulseMs = INNER_RULES.pulseDurationMs;
    state.inner.lastEventCount = state.inner.kernel.events.length;
    log(state, "info", "低功率引灵脉冲启动，正在记录灵触响应。");
    return true;
  }

  function installController(state, id) {
    const definition = CONTROLLERS[id];
    const controller = state.controllers[id];
    if (!definition || !controller?.available || controller.installed) return false;
    if (!spendDefinitionCost(state, definition)) return false;

    controller.installed = true;
    controller.mode = "preset";
    controller.intervalMs = 0;
    controller.scanMs = 0;
    if (id === "heart" && ["recovery", "survival"].includes(state.stage)) {
      state.stage = "stabilization";
    }
    log(state, "good", `${definition.name}已安装，当前使用低效预设程序。`);
    return true;
  }

  function setControllerMode(state, id, mode) {
    const controller = state.controllers[id];
    if (!controller?.installed || !["manual", "preset", "ladder"].includes(mode)) {
      return false;
    }
    controller.mode = mode;
    controller.intervalMs = 0;
    controller.scanMs = 0;
    log(
      state,
      "info",
      `${CONTROLLERS[id].name}切换为${
        mode === "manual"
          ? "手动控制，自动化已暂停"
          : mode === "preset"
            ? "预设控制"
            : "梯形图控制"
      }。`,
    );
    return true;
  }

  function startJob(state, id) {
    const definition = JOBS[id];
    if (!definition || state.job || !jobAvailable(state, id)) return false;
    if (!spendDefinitionCost(state, definition)) return false;
    state.job = {
      id,
      durationMs: definition.durationMs,
      remainingMs: definition.durationMs,
    };
    log(state, "info", `${definition.name}开始。`);
    return true;
  }

  function jobAvailable(state, id) {
    if (id === "mineHead") {
      return state.unlocks.workshop && !state.structures.mineHead;
    }
    if (id === "bench") {
      return state.structures.mineHead && state.milestones.digs >= 1 && !state.structures.bench;
    }
    if (id === "generator") {
      return state.structures.bench && !state.structures.generator;
    }
    if (id === "sensor") {
      return state.structures.generator && !state.structures.sensor;
    }
    if (id === "anomalySample") {
      return (
        state.structures.sensor &&
        state.anomaly.revealed &&
        state.anomaly.samples < 3 &&
        state.world.minePath === TRACK.anomalyPath
      );
    }
    if (id === "processor") {
      return (
        state.anomaly.confirmed &&
        state.milestones.orePickups >= 1 &&
        !state.structures.processor
      );
    }
    if (id === "anomalyResearch") {
      return (
        state.anomaly.confirmed &&
        state.structures.processor &&
        state.industry.batches >= 1 &&
        !state.research.completed
      );
    }
    if (id === "lingchu") {
      return state.research.completed && !state.structures.lingchu;
    }
    return false;
  }

  function advanceJob(state, deltaMs) {
    if (!state.job) return;
    state.job.remainingMs = Math.max(0, state.job.remainingMs - deltaMs);
    if (state.job.remainingMs > 0) return;

    const id = state.job.id;
    state.job = null;
    if (id === "mineHead") {
      state.structures.mineHead = true;
      state.unlocks.mining = true;
      state.stage = "mining";
      log(state, "good", "简易掘进头完成。地表末端已经建立二叉矿路入口。");
    }
    if (id === "bench") {
      state.structures.bench = true;
      state.stage = "workshop";
      log(state, "good", "基础维修台投入使用。物理生产体系有了第一个支点。");
    }
    if (id === "generator") {
      state.structures.generator = true;
      log(state, "good", "木气化炉投入使用。能源偏低时会自动消耗木材供能。");
    }
    if (id === "sensor") {
      state.structures.sensor = true;
      state.anomaly.revealed = true;
      state.stage = "observation";
      log(state, "warn", "频谱传感器捕获到无法由物理输入解释的残阵输出。");
    }
    if (id === "anomalySample") {
      state.anomaly.samples += 1;
      if (state.anomaly.samples >= 3) {
        state.anomaly.confirmed = true;
        state.unlocks.anomaly = true;
        state.stage = "anomaly";
        log(state, "good", "三次采样一致：残阵输出持续大于可测物理输入。");
        log(state, "info", "地下矿石可以进入标准化加工，为制造灵气接口准备部件。");
      } else {
        log(state, "warn", `异常样本 ${state.anomaly.samples}/3 已记录。`);
      }
    }
    if (id === "processor") {
      state.structures.processor = true;
      state.stage = "industry";
      log(state, "good", "部件加工台投入使用。矿石可以转化为标准部件。");
    }
    if (id === "anomalyResearch") {
      state.research.modelVersion = RESEARCH_MODEL.version;
      state.research.completed = true;
      state.research.observations = RESEARCH_MODEL.observations.map((record) => ({ ...record }));
      state.research.conclusions = RESEARCH_MODEL.conclusions.map((record) => ({ ...record }));
      state.unlocks.research = true;
      state.stage = "research";
      log(state, "good", "第一版异常响应模型整理完成。");
      log(state, "info", "残阵不是可直接使用的能源；需要主体接口才能验证意念响应。");
    }
    if (id === "lingchu") {
      state.structures.lingchu = true;
      state.inner = createInnerRuntime();
      state.unlocks.inner = Boolean(state.inner);
      state.stage = state.inner ? "awakening" : "research";
      log(
        state,
        state.inner ? "good" : "bad",
        state.inner
          ? "灵触接口装配完成。机体获得了第一次受控接触未知场的可能。"
          : "灵触接口装配完成，但内景内核尚未加载。",
      );
    }
  }


  function jobProgress(state) {
    if (!state.job) return 0;
    return 1 - state.job.remainingMs / state.job.durationMs;
  }

  function applyDerivedUnlocks(state) {
    if (state.milestones.manualHeartbeats >= 3) state.controllers.heart.available = true;
    if (state.milestones.manualMoves >= 3) state.controllers.drive.available = true;
    if (state.milestones.branchPickups >= 1 || state.milestones.chops >= 1) {
      state.controllers.pickup.available = true;
      state.unlocks.workshop = true;
    }
    if (
      state.structures.mineHead ||
      state.milestones.digs >= 1 ||
      state.structures.bench ||
      state.anomaly.revealed
    ) {
      state.structures.mineHead = true;
      state.unlocks.mining = true;
    }
    if (state.milestones.digs >= 1) state.controllers.excavator.available = true;
    if (state.resources.core >= 75 || state.stage !== "recovery") {
      state.unlocks.environment = true;
    }
    if (state.anomaly.confirmed) {
      state.unlocks.anomaly = true;
    }
    if (state.research.completed) {
      state.unlocks.research = true;
    }
    if (state.structures.lingchu) {
      state.inner ??= createInnerRuntime();
      state.unlocks.inner = Boolean(state.inner);
    }
  }

  function addResource(state, resource, amount) {
    state.resources[resource] = clampResource(resource, state.resources[resource] + amount);
  }

  function spendResource(state, resource, amount) {
    if (state.resources[resource] + 0.0001 < amount) return false;
    state.resources[resource] = clampResource(resource, state.resources[resource] - amount);
    return true;
  }

  function spendDefinitionCost(state, definition) {
    const cost = definition?.cost;
    if (!cost || cost.amount <= 0) return true;
    if (!Object.hasOwn(state.resources, cost.resource)) return false;
    return spendResource(state, cost.resource, cost.amount);
  }

  function clampResource(resource, value) {
    return Math.min(RESOURCE_LIMITS[resource], Math.max(0, value));
  }

  function formatAmount(value) {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }

  function atBoundary(state) {
    const next = state.world.position + state.world.direction;
    return next < 0 || next >= TRACK.length;
  }

  function branchAtPosition(state) {
    return state.world.depth === 0 && state.world.branches.includes(state.world.position);
  }

  function treeAtPosition(state) {
    return state.world.depth === 0 && state.world.trees.includes(state.world.position);
  }

  function pickupAvailable(state) {
    return branchAtPosition(state) || treeAtPosition(state);
  }

  function woodGathered(state) {
    return state.milestones.branchPickups + state.milestones.chops;
  }

  function parseLegacyMineCellKey(key) {
    const [position, depth] = String(key).split(":").map(Number);
    return { position, depth };
  }

  function validLegacyMineCellKey(key) {
    const { position, depth } = parseLegacyMineCellKey(key);
    return (
      Number.isInteger(position) &&
      Number.isInteger(depth) &&
      position >= 0 &&
      position < TRACK.length &&
      depth >= 1 &&
      depth <= 4 &&
      key === `${position}:${depth}`
    );
  }

  function validMinePath(path) {
    return (
      typeof path === "string" &&
      path.length >= 1 &&
      path.length <= MINING_RULES.maxDepth &&
      /^[LR]+$/.test(path)
    );
  }

  function compareMinePaths(left, right) {
    return left.length - right.length || left.localeCompare(right);
  }

  function addMinePathWithAncestors(paths, path) {
    if (!validMinePath(path)) return;
    for (let depth = 1; depth <= path.length; depth += 1) {
      const ancestor = path.slice(0, depth);
      if (!paths.includes(ancestor)) paths.push(ancestor);
    }
  }

  function legacyMinePath(position, depth) {
    let path = "";
    for (let level = 0; level < depth; level += 1) {
      path += (position >> (level % 4)) & 1 ? "R" : "L";
    }
    return path;
  }

  function restoreMineProgress(world, path, progress) {
    if (!validMinePath(path) || world.mineNodes.includes(path)) return;
    const parent = path.slice(0, -1);
    if (parent && !world.mineNodes.includes(parent)) return;
    world.mineProgress[path] = Math.floor(
      finite(progress, 0, hardnessAtDepth(path.length) - 1),
    );
  }

  function hardnessAtDepth(depth) {
    return Math.min(
      MINING_RULES.maxHardness,
      MINING_RULES.baseHardness +
        Math.floor((Math.max(1, depth) - 1) / MINING_RULES.hardnessDepthStep),
    );
  }

  function materialAtDepth(depth) {
    return (
      MINING_RULES.baseMaterial +
      Math.floor((Math.max(1, depth) - 1) / MINING_RULES.materialDepthStep)
    );
  }

  function pathHash(path) {
    let hash = 2166136261;
    for (const character of path) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function oreAtPath(path) {
    if (!validMinePath(path) || path.length < MINING_RULES.guaranteedOreDepth) return 0;
    if (path === TRACK.anomalyPath) return 4;
    if (path.length === MINING_RULES.guaranteedOreDepth) return 2;
    return pathHash(path) % MINING_RULES.oreFrequency === 0
      ? 1 + Math.floor(path.length / 4)
      : 0;
  }

  function mineTargetPath(state, branch) {
    if (branch !== "L" && branch !== "R") return null;
    if (state.world.depth >= MINING_RULES.maxDepth) return null;
    if (state.world.depth === 0 && state.world.position !== TRACK.mineEntrance) return null;
    return `${state.world.minePath ?? ""}${branch}`;
  }

  function canDigBranch(state, branch) {
    if (!state.unlocks.mining || !state.structures.mineHead || state.shutdown) return false;
    const target = mineTargetPath(state, branch);
    if (!target) return false;
    const energy = state.world.mineNodes.includes(target)
      ? MINING_RULES.verticalMoveEnergy
      : MINING_RULES.digEnergy;
    return state.resources.energy + 0.0001 >= energy;
  }

  function mineBranchProgress(state, branch) {
    const target = mineTargetPath(state, branch);
    if (!target || state.world.mineNodes.includes(target)) {
      return { current: 0, required: 0, ratio: 0, open: Boolean(target) };
    }
    const current = state.world.mineProgress[target] ?? 0;
    const required = hardnessAtDepth(target.length);
    return { current, required, ratio: current / required, open: false, path: target };
  }

  function visibleMineNodes(state) {
    if (state.world.depth === 0 && state.world.position !== TRACK.mineEntrance) return [];
    const root = state.world.minePath ?? "";
    return state.world.mineNodes.filter((path) => path.startsWith(root));
  }

  function nextBranchRespawnMs(state) {
    const timers = Object.values(state.world.branchRespawn).filter((value) => value > 0);
    return timers.length > 0 ? Math.min(...timers) : 0;
  }

  function advanceBranches(state, deltaMs) {
    for (const position of TRACK.branches) {
      if (state.world.branches.includes(position)) continue;
      const remaining =
        (state.world.branchRespawn[position] ?? FOREST_RULES.branchRespawnMs) - deltaMs;
      if (remaining <= 0) {
        state.world.branches.push(position);
        state.world.branches.sort((left, right) => left - right);
        delete state.world.branchRespawn[position];
      } else {
        state.world.branchRespawn[position] = remaining;
      }
    }
  }


  function nextTreeRespawnMs(state) {
    const timers = Object.values(state.world.treeRespawn).filter((value) => value > 0);
    return timers.length > 0 ? Math.min(...timers) : 0;
  }

  function advanceTrees(state, deltaMs) {
    for (const position of TRACK.trees) {
      if (state.world.trees.includes(position)) continue;
      const remaining =
        (state.world.treeRespawn[position] ?? FOREST_RULES.treeRespawnMs) - deltaMs;
      if (remaining <= 0) {
        state.world.trees.push(position);
        delete state.world.treeRespawn[position];
      } else {
        state.world.treeRespawn[position] = remaining;
      }
    }
  }

  function advanceProcessor(state, deltaMs) {
    if (!state.structures.processor) {
      state.industry.processorMs = 0;
      return;
    }
    state.industry.processorMs += deltaMs;
    while (
      state.industry.processorMs >= INDUSTRY_RULES.processorCycleMs &&
      state.resources.ore >= INDUSTRY_RULES.processorRecipeOre &&
      state.resources.parts < RESOURCE_LIMITS.parts
    ) {
      state.industry.processorMs -= INDUSTRY_RULES.processorCycleMs;
      spendResource(state, "ore", INDUSTRY_RULES.processorRecipeOre);
      addResource(state, "parts", INDUSTRY_RULES.processorRecipeParts);
      state.industry.batches += 1;
      if (state.industry.batches === 1) {
        log(state, "good", "加工台完成第一批标准部件。");
      }
    }
  }
  function advanceInner(state, deltaMs) {
    const runtime = state.inner;
    const kernel = global.SilidoxInnerLandscape;
    if (!runtime?.active || !kernel || runtime.pulseMs <= 0) return;

    const eventStart = Math.min(runtime.lastEventCount, runtime.kernel.events.length);
    const stepMs = Math.min(deltaMs, runtime.pulseMs);
    kernel.advance(runtime.kernel, stepMs);
    runtime.pulseMs = Math.max(0, runtime.pulseMs - stepMs);
    runtime.lastEventCount = runtime.kernel.events.length;
    if (runtime.pulseMs > 0) return;

    runtime.active = false;
    runtime.manualPulses = Math.min(
      INNER_RULES.manualPulsesRequired,
      runtime.manualPulses + 1,
    );
    const newEvents = runtime.kernel.events.slice(eventStart);
    const touch = kernel.getMetrics(runtime.kernel, "touch");
    const refine = kernel.getMetrics(runtime.kernel, "refine");
    const dantian = kernel.getMetrics(runtime.kernel, "dantian");
    runtime.observations.push({
      id: `pulse-${runtime.manualPulses}`,
      pulse: runtime.manualPulses,
      atStep: runtime.kernel.clock.stepCount,
      touchPressure: touch?.pressure ?? 0,
      refinePressure: refine?.pressure ?? 0,
      dantianPressure: dantian?.pressure ?? 0,
      purity: touch?.purity ?? 1,
      temperature: refine?.temperature ?? 20,
      stability: refine?.stability ?? 100,
      faults: [...runtime.kernel.faults],
      eventCount: newEvents.length,
    });
    if (runtime.observations.length > 12) {
      runtime.observations.splice(0, runtime.observations.length - 12);
    }
    if (newEvents.length > 0) {
      log(state, "warn", `引灵脉冲记录到异常：${newEvents[0].text}`);
    } else {
      log(
        state,
        "good",
        `低功率引灵完成 ${runtime.manualPulses}/${INNER_RULES.manualPulsesRequired} 次，灵触响应已记录。`,
      );
    }
    if (
      runtime.manualPulses >= INNER_RULES.manualPulsesRequired &&
      state.stage === "awakening"
    ) {
      state.stage = "inner";
      log(state, "good", "三次低功率引灵完成。内景已经可以进行持续观测。");
    }
  }

  function objective(state) {
    if (state.shutdown) {
      return state.emergency.charge > 0
        ? "应急电容已经积蓄电荷，完成三次手动起搏。"
        : "机体处于低功耗停机，等待应急热差电容回充。";
    }
    if (!state.unlocks.environment) return "手动释放三次核心脉冲，让机体恢复响应。";
    if (woodGathered(state) === 0) return "沿森林地表移动，拾取掉落的树枝，收集第一批木材。";
    if (state.milestones.fuelBurns === 0 && !state.structures.bench) {
      return "燃烧一份木材补充能源，再决定多少木材留作建设。";
    }
    if (!state.structures.mineHead) return "继续搜集木材，用木材装配简易掘进头。";
    if (state.milestones.digs === 0) {
      return `抵达横向 ${TRACK.mineEntrance} 的矿井入口，选择左下或右下击穿第一层岩体。`;
    }
    if (!state.structures.bench) return "继续向下挖掘，取得足够结构料搭建基础维修台。";
    if (!state.structures.generator) return "搭建木气化炉，让木材可以自动转化为能源。";
    if (!state.structures.sensor) return "修复频谱传感器，检查环境中的未知输出。";
    if (!state.anomaly.confirmed) {
      if (
        state.world.minePath !== TRACK.anomalyPath
      ) {
        return `频谱信号来自矿路 ${TRACK.anomalyPath}。沿右、左、右、右分支抵达现场。`;
      }
      return "对地下残阵完成三次独立采样，排除传感器误差。";
    }
    if (!state.structures.processor) {
      return "搭建部件加工台，把矿石加工成标准部件。";
    }
    if (!state.research.completed) {
      return state.industry.batches < 1
        ? "让加工台完成第一批标准部件，再整理残阵的异常响应模型。"
        : "整理第一版异常响应模型，确认未知场是否具备可控响应。";
    }
    if (!state.structures.lingchu) {
      return "用标准部件装配灵触接口，让机体第一次尝试受控接触未知场。";
    }
    if ((state.inner?.manualPulses ?? 0) < INNER_RULES.manualPulsesRequired) {
      return `释放三次低功率引灵脉冲，记录灵触响应 ${state.inner?.manualPulses ?? 0}/${INNER_RULES.manualPulsesRequired}。`;
    }
    return "维持低功率引灵，观察灵压、杂质、温度与稳定度的变化。";
  }

  function innerMetrics(state) {
    const runtime = state.inner;
    const kernel = global.SilidoxInnerLandscape;
    if (!runtime?.kernel || !kernel?.getMetrics) return null;
    return {
      active: runtime.active,
      pulseMs: runtime.pulseMs,
      manualPulses: runtime.manualPulses,
      touch: kernel.getMetrics(runtime.kernel, "touch"),
      refine: kernel.getMetrics(runtime.kernel, "refine"),
      dantian: kernel.getMetrics(runtime.kernel, "dantian"),
      faults: [...runtime.kernel.faults],
      events: runtime.kernel.events.slice(-8),
      observations: runtime.observations.slice(-8),
    };
  }

  function stageProgress(state) {
    if (state.stage === "recovery") return state.milestones.manualHeartbeats / 3;
    if (state.stage === "survival") {
      return (
        Math.min(2, woodGathered(state)) + Math.min(1, state.milestones.fuelBurns)
      ) / 3;
    }
    if (state.stage === "stabilization") return state.structures.bench ? 1 : 0.4;
    if (state.stage === "mining") return Math.min(1, state.milestones.digs / 2);
    if (state.stage === "workshop") {
      return (Number(state.structures.generator) + Number(state.structures.sensor)) / 2;
    }
    if (state.stage === "observation") return state.anomaly.samples / 3;
    if (state.stage === "industry") return Math.min(1, state.industry.batches / 8);
    if (state.stage === "research") return state.research.completed ? 1 : 0;
    if (state.stage === "awakening") {
      return (state.inner?.manualPulses ?? 0) / INNER_RULES.manualPulsesRequired;
    }
    if (state.stage === "inner") return 1;
    return 1;
  }

  global.SilidoxSimulation = Object.freeze({
    createState,
    normalizeState,
    advance,
    performAction,
    controlSignals,
    calculateControlLoad,
    jobAvailable,
    jobProgress,
    objective,
    innerMetrics,
    stageProgress,
    atBoundary,
    treeAtPosition,
    branchAtPosition,
    pickupAvailable,
    nextBranchRespawnMs,
    nextTreeRespawnMs,
    validMinePath,
    hardnessAtDepth,
    materialAtDepth,
    oreAtPath,
    mineTargetPath,
    canDigBranch,
    mineBranchProgress,
    visibleMineNodes,
  });
})(globalThis);
