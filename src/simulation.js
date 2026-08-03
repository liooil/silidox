// Deterministic survival simulation. DOM and localStorage access stay outside this module.
(function defineSilidoxSimulation(global) {
  const {
    CONTROLLERS,
    FOREST_RULES,
    INDUSTRY_RULES,
    JOBS,
    MINING_RULES,
    RESOURCE_LIMITS,
    STARTING_RESOURCES,
    SURVIVAL_RULES,
    TRACK,
  } = global.SilidoxData;

  function createState(legacyArchive = null) {
    return {
      version: 2,
      stage: "recovery",
      clock: {
        elapsedMs: 0,
        paused: false,
        savedAt: Date.now(),
      },
      resources: { ...STARTING_RESOURCES },
      unlocks: {
        body: true,
        environment: false,
        workshop: false,
        mining: false,
        anomaly: false,
      },
      milestones: {
        manualHeartbeats: 0,
        manualMoves: 0,
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
        trees: [...TRACK.trees],
        treeRespawn: {},
        excavated: [],
        digProgress: {},
      },
      anomaly: {
        revealed: false,
        samples: 0,
        confirmed: false,
      },
      industry: {
        processorMs: 0,
        batches: 0,
      },
      job: null,
      shutdown: false,
      legacyArchive,
      logs: [
        createLog("warn", "核心循环尚未稳定。释放三次手动脉冲以恢复机体。", 0),
        createLog("info", "当前只能读取最低限度的机体状态。", 0),
      ],
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
    base.stage = typeof value.stage === "string" ? value.stage : base.stage;
    base.clock.elapsedMs = finite(value.clock?.elapsedMs, 0, Number.MAX_SAFE_INTEGER);
    base.clock.paused = Boolean(value.clock?.paused);
    base.clock.savedAt = Date.now();

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
    base.world.depth = Math.floor(finite(value.world?.depth, 0, MINING_RULES.maxDepth));
    base.world.direction = value.world?.direction === -1 ? -1 : 1;
    base.world.trees = Array.isArray(value.world?.trees)
      ? value.world.trees
          .filter((position) => Number.isInteger(position) && TRACK.trees.includes(position))
          .filter((position, index, list) => list.indexOf(position) === index)
      : [...TRACK.trees];
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
    base.world.excavated = Array.isArray(value.world?.excavated)
      ? value.world.excavated
          .filter((key) => validMineCellKey(key))
          .filter((key, index, list) => list.indexOf(key) === index)
      : [];
    base.world.digProgress = {};
    if (value.world?.digProgress && typeof value.world.digProgress === "object") {
      for (const [key, progress] of Object.entries(value.world.digProgress)) {
        if (!validMineCellKey(key) || base.world.excavated.includes(key)) continue;
        const { depth } = parseMineCellKey(key);
        base.world.digProgress[key] = Math.floor(
          finite(progress, 0, MINING_RULES.hardnessByDepth[depth] - 1),
        );
      }
    }
    if (base.world.depth > 0) {
      for (let depth = 1; depth <= base.world.depth; depth += 1) {
        const key = mineCellKey(base.world.position, depth);
        if (!base.world.excavated.includes(key)) base.world.excavated.push(key);
      }
    }
    const excavatedDepths = base.world.excavated.map(
      (key) => parseMineCellKey(key).depth,
    );
    base.milestones.digs = Math.max(base.milestones.digs, base.world.excavated.length);
    base.milestones.deepestDepth = Math.max(
      base.milestones.deepestDepth,
      base.world.depth,
      ...excavatedDepths,
    );

    base.anomaly.revealed = Boolean(value.anomaly?.revealed);
    base.anomaly.samples = Math.floor(finite(value.anomaly?.samples, 0, 3));
    base.anomaly.confirmed = Boolean(value.anomaly?.confirmed);
    base.industry.processorMs = finite(value.industry?.processorMs, 0, 600000);
    base.industry.batches = Math.floor(finite(value.industry?.batches, 0, 999999));
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

  function finite(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.min(max, Math.max(min, number));
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
    advanceTrees(state, boundedDelta);
    advanceProcessor(state, boundedDelta);
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
    if (controller.id === "pickup") harvest(state, "preset");
    if (controller.id === "excavator") digDown(state, "preset");
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
      harvest(state, "ladder");
    }
    if (controller.id === "excavator" && outputs.includes("Q0")) {
      digDown(state, "ladder");
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
      const target = digTarget(state);
      return {
        I0: canDigDown(state),
        I1: Boolean(target && oreAtCell(target.position, target.depth) > 0),
        0: false,
        1: true,
      };
    }
    return {
      I0: harvestAvailable(state),
      0: false,
      1: true,
    };
  }

  function performAction(state, action, payload = null) {
    if (action === "togglePause") {
      state.clock.paused = !state.clock.paused;
      return true;
    }
    if (action === "emergencyPulse") return emergencyPulse(state);
    if (state.shutdown) return false;

    if (action === "heartbeat") return manualHeartbeat(state);
    if (action === "move") return move(state, "manual");
    if (action === "reverse") return reverse(state, "manual");
    if (action === "harvest" || action === "pickup") return harvest(state, "manual");
    if (action === "digDown") return digDown(state, "manual");
    if (action === "ascend") return ascend(state, "manual");
    if (action === "burnWood") return burnWood(state);
    if (action === "installController") return installController(state, payload);
    if (action === "setControllerMode") {
      return setControllerMode(state, payload?.id, payload?.mode);
    }
    if (action === "startJob") return startJob(state, payload);
    return false;
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

  function harvest(state, source) {
    if (!state.unlocks.environment || state.world.depth > 0) return false;
    const hasTree = treeAtPosition(state);
    if (!hasTree) return false;
    if (!spendResource(state, "energy", SURVIVAL_RULES.harvestEnergy)) return false;

    state.world.trees = state.world.trees.filter(
      (position) => position !== state.world.position,
    );
    state.world.treeRespawn[state.world.position] = FOREST_RULES.treeRespawnMs;
    addResource(state, "wood", FOREST_RULES.woodPerTree);
    state.milestones.chops += 1;
    state.controllers.pickup.outputCount += 1;
    state.controllers.pickup.energySpent += SURVIVAL_RULES.harvestEnergy;
    state.controllers.pickup.available = true;
    state.unlocks.workshop = true;
    if (source === "manual") {
      log(state, "good", `伐木完成：木材 +${FOREST_RULES.woodPerTree}。可用于建设或投入燃烧。`);
    }
    return true;
  }

  function digDown(state, source) {
    if (!canDigDown(state)) return false;
    const target = digTarget(state);
    const key = mineCellKey(target.position, target.depth);
    const excavator = state.controllers.excavator;

    if (cellExcavated(state, target.position, target.depth)) {
      if (!spendResource(state, "energy", MINING_RULES.verticalMoveEnergy)) return false;
      state.world.depth = target.depth;
      excavator.outputCount += 1;
      excavator.energySpent += MINING_RULES.verticalMoveEnergy;
      if (source === "manual") log(state, "info", `沿竖井下降至深度 ${state.world.depth}。`);
      return true;
    }

    if (!spendResource(state, "energy", MINING_RULES.digEnergy)) return false;
    const progress = (state.world.digProgress[key] ?? 0) + 1;
    state.world.digProgress[key] = progress;
    excavator.outputCount += 1;
    excavator.energySpent += MINING_RULES.digEnergy;

    const required = MINING_RULES.hardnessByDepth[target.depth];
    if (progress < required) {
      if (source === "manual") {
        log(state, "info", `深度 ${target.depth} 岩层掘进 ${progress}/${required}。`);
      }
      return true;
    }

    delete state.world.digProgress[key];
    state.world.excavated.push(key);
    state.world.depth = target.depth;
    const material = MINING_RULES.materialByDepth[target.depth];
    const ore = oreAtCell(target.position, target.depth);
    addResource(state, "material", material);
    if (ore > 0) {
      addResource(state, "ore", ore);
      state.milestones.orePickups += 1;
    }
    state.milestones.digs += 1;
    state.milestones.deepestDepth = Math.max(
      state.milestones.deepestDepth,
      target.depth,
    );
    excavator.available = true;
    if (source === "manual") {
      const oreText = ore > 0 ? `，矿石 +${ore}` : "";
      log(state, "good", `击穿深度 ${target.depth}：结构料 +${material}${oreText}。`);
    }
    return true;
  }

  function ascend(state, source) {
    if (!state.unlocks.mining || state.world.depth <= 0) return false;
    if (!spendResource(state, "energy", MINING_RULES.verticalMoveEnergy)) return false;
    state.world.depth -= 1;
    state.controllers.drive.outputCount += 1;
    state.controllers.drive.energySpent += MINING_RULES.verticalMoveEnergy;
    if (source === "manual") {
      log(
        state,
        "info",
        state.world.depth === 0 ? "已经返回地表。" : `沿竖井上升至深度 ${state.world.depth}。`,
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
        state.world.position === TRACK.anomaly &&
        state.world.depth === TRACK.anomalyDepth
      );
    }
    if (id === "processor") {
      return (
        state.anomaly.confirmed &&
        state.milestones.orePickups >= 1 &&
        !state.structures.processor
      );
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
      log(state, "good", "简易掘进头完成。环境模型已经扩展为可向下开挖的二维剖面。");
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
  }

  function jobProgress(state) {
    if (!state.job) return 0;
    return 1 - state.job.remainingMs / state.job.durationMs;
  }

  function applyDerivedUnlocks(state) {
    if (state.milestones.manualHeartbeats >= 3) state.controllers.heart.available = true;
    if (state.milestones.manualMoves >= 3) state.controllers.drive.available = true;
    if (state.milestones.chops >= 1) {
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

  function treeAtPosition(state) {
    return state.world.depth === 0 && state.world.trees.includes(state.world.position);
  }

  function harvestAvailable(state) {
    return treeAtPosition(state);
  }

  function mineCellKey(position, depth) {
    return `${position}:${depth}`;
  }

  function parseMineCellKey(key) {
    const [position, depth] = String(key).split(":").map(Number);
    return { position, depth };
  }

  function validMineCellKey(key) {
    const { position, depth } = parseMineCellKey(key);
    return (
      Number.isInteger(position) &&
      Number.isInteger(depth) &&
      position >= 0 &&
      position < TRACK.length &&
      depth >= 1 &&
      depth <= MINING_RULES.maxDepth &&
      key === mineCellKey(position, depth)
    );
  }

  function cellExcavated(state, position, depth) {
    return depth === 0 || state.world.excavated.includes(mineCellKey(position, depth));
  }

  function oreAtCell(position, depth) {
    return MINING_RULES.oreByCell[mineCellKey(position, depth)] ?? 0;
  }

  function digTarget(state) {
    if (state.world.depth >= MINING_RULES.maxDepth) return null;
    return {
      position: state.world.position,
      depth: state.world.depth + 1,
    };
  }

  function canDigDown(state) {
    if (!state.unlocks.mining || !state.structures.mineHead || state.shutdown) return false;
    const target = digTarget(state);
    if (!target) return false;
    const energy = cellExcavated(state, target.position, target.depth)
      ? MINING_RULES.verticalMoveEnergy
      : MINING_RULES.digEnergy;
    return state.resources.energy + 0.0001 >= energy;
  }

  function digProgress(state) {
    const target = digTarget(state);
    if (!target || cellExcavated(state, target.position, target.depth)) {
      return { current: 0, required: 0, ratio: 0, open: Boolean(target) };
    }
    const current = state.world.digProgress[mineCellKey(target.position, target.depth)] ?? 0;
    const required = MINING_RULES.hardnessByDepth[target.depth];
    return { current, required, ratio: current / required, open: false };
  }

  function nextTreeRespawnMs(state) {
    const timers = Object.values(state.world.treeRespawn).filter((value) => value > 0);
    return timers.length > 0 ? Math.min(...timers) : 0;
  }

  function advanceTrees(state, deltaMs) {
    for (const position of TRACK.trees) {
      if (state.world.trees.includes(position)) continue;
      const remaining = (state.world.treeRespawn[position] ?? 0) - deltaMs;
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

  function objective(state) {
    if (state.shutdown) {
      return state.emergency.charge > 0
        ? "应急电容已经积蓄电荷，完成三次手动起搏。"
        : "机体处于低功耗停机，等待应急热差电容回充。";
    }
    if (!state.unlocks.environment) return "手动释放三次核心脉冲，让机体恢复响应。";
    if (state.milestones.chops === 0) return "沿森林地表移动，找到成熟树木并完成第一次伐木。";
    if (state.milestones.fuelBurns === 0 && !state.structures.bench) {
      return "燃烧一份木材补充能源，再决定多少木材留作建设。";
    }
    if (!state.structures.mineHead) return "继续伐木，用木材装配简易掘进头。";
    if (state.milestones.digs === 0) return "选择一个地表位置，向下击穿第一层岩体。";
    if (!state.structures.bench) return "继续向下挖掘，取得足够结构料搭建基础维修台。";
    if (!state.structures.generator) return "搭建木气化炉，让木材可以自动转化为能源。";
    if (!state.structures.sensor) return "修复频谱传感器，检查环境中的未知输出。";
    if (!state.anomaly.confirmed) {
      if (
        state.world.position !== TRACK.anomaly ||
        state.world.depth !== TRACK.anomalyDepth
      ) {
        return `频谱信号来自横向 ${TRACK.anomaly}、深度 ${TRACK.anomalyDepth}。开掘通道抵达现场。`;
      }
      return "对地下残阵完成三次独立采样，排除传感器误差。";
    }
    if (!state.structures.processor) {
      return "搭建部件加工台，把矿石加工成标准部件。";
    }
    return "部件是灵性接口与内景部件的基础材料。维持生产，并寻找解释异常的方法。";
  }

  function stageProgress(state) {
    if (state.stage === "recovery") return state.milestones.manualHeartbeats / 3;
    if (state.stage === "survival") {
      return (
        Math.min(2, state.milestones.chops) + Math.min(1, state.milestones.fuelBurns)
      ) / 3;
    }
    if (state.stage === "stabilization") return state.structures.bench ? 1 : 0.4;
    if (state.stage === "mining") return Math.min(1, state.milestones.digs / 2);
    if (state.stage === "workshop") {
      return (Number(state.structures.generator) + Number(state.structures.sensor)) / 2;
    }
    if (state.stage === "observation") return state.anomaly.samples / 3;
    if (state.stage === "industry") return Math.min(1, state.industry.batches / 8);
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
    stageProgress,
    atBoundary,
    treeAtPosition,
    harvestAvailable,
    nextTreeRespawnMs,
    cellExcavated,
    oreAtCell,
    digTarget,
    canDigDown,
    digProgress,
  });
})(globalThis);
