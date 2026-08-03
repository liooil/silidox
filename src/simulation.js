// Deterministic survival simulation. DOM and localStorage access stay outside this module.
(function defineSilidoxSimulation(global) {
  const {
    CONTROLLERS,
    JOBS,
    RESOURCE_LIMITS,
    SALVAGE_REWARD,
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
        anomaly: false,
      },
      milestones: {
        manualHeartbeats: 0,
        manualMoves: 0,
        pickups: 0,
        shutdowns: 0,
      },
      controllers: {
        heart: createControllerState("heart"),
        drive: createControllerState("drive"),
        pickup: createControllerState("pickup"),
      },
      structures: {
        bench: false,
        generator: false,
        sensor: false,
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
        direction: 1,
        salvage: [...TRACK.salvage],
      },
      anomaly: {
        revealed: false,
        samples: 0,
        confirmed: false,
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
    base.world.salvage = Array.isArray(value.world?.salvage)
      ? value.world.salvage
          .filter((position) => Number.isInteger(position) && TRACK.salvage.includes(position))
          .filter((position, index, list) => list.indexOf(position) === index)
      : [...TRACK.salvage];

    base.anomaly.revealed = Boolean(value.anomaly?.revealed);
    base.anomaly.samples = Math.floor(finite(value.anomaly?.samples, 0, 3));
    base.anomaly.confirmed = Boolean(value.anomaly?.confirmed);
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

    if (state.structures.generator) {
      addResource(
        state,
        "energy",
        (SURVIVAL_RULES.generatorEnergyPerSecond * boundedDelta) / 1000,
      );
    }

    advanceJob(state, boundedDelta);
    advanceControllers(state, boundedDelta, evaluateProgram);
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
      if (outputs.includes("Q1")) reverse(state, "ladder");
      else if (outputs.includes("Q0")) move(state, "ladder");
    }
    if (controller.id === "pickup" && outputs.includes("Q0")) {
      pickup(state, "ladder");
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
        0: false,
        1: true,
      };
    }
    return {
      I0: salvageAtPosition(state),
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
    if (action === "pickup") return pickup(state, "manual");
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
    if (!state.unlocks.environment || atBoundary(state)) return false;
    if (!spendResource(state, "energy", SURVIVAL_RULES.moveEnergy)) return false;
    state.world.position += state.world.direction;
    state.controllers.drive.outputCount += 1;
    state.controllers.drive.energySpent += SURVIVAL_RULES.moveEnergy;
    if (source === "manual") {
      state.milestones.manualMoves += 1;
      if (state.milestones.manualMoves >= 3) state.controllers.drive.available = true;
      log(state, "info", `移动至轨道 ${state.world.position}。`);
    }
    return true;
  }

  function reverse(state, source) {
    if (!state.unlocks.environment) return false;
    if (!spendResource(state, "energy", SURVIVAL_RULES.reverseEnergy)) return false;
    state.world.direction *= -1;
    state.controllers.drive.outputCount += 1;
    state.controllers.drive.energySpent += SURVIVAL_RULES.reverseEnergy;
    if (source === "manual") log(state, "info", "轨道驱动方向已切换。");
    return true;
  }

  function presetDrive(state) {
    if (atBoundary(state)) reverse(state, "preset");
    else move(state, "preset");
  }

  function pickup(state, source) {
    if (!state.unlocks.environment || !salvageAtPosition(state)) return false;
    if (!spendResource(state, "energy", SURVIVAL_RULES.pickupEnergy)) return false;

    state.world.salvage = state.world.salvage.filter(
      (position) => position !== state.world.position,
    );
    addResource(state, "energy", SALVAGE_REWARD.energy);
    addResource(state, "material", SALVAGE_REWARD.material);
    state.milestones.pickups += 1;
    state.controllers.pickup.outputCount += 1;
    state.controllers.pickup.energySpent += SURVIVAL_RULES.pickupEnergy;
    state.controllers.pickup.available = true;
    state.unlocks.workshop = true;
    if (source === "manual") {
      log(
        state,
        "good",
        `回收残骸：能源 +${SALVAGE_REWARD.energy}，材料 +${SALVAGE_REWARD.material}。`,
      );
    }
    return true;
  }

  function installController(state, id) {
    const definition = CONTROLLERS[id];
    const controller = state.controllers[id];
    if (!definition || !controller?.available || controller.installed) return false;
    if (!spendResource(state, "material", definition.materialCost)) return false;

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
    if (!controller?.installed || !["preset", "ladder"].includes(mode)) return false;
    controller.mode = mode;
    controller.intervalMs = 0;
    controller.scanMs = 0;
    log(
      state,
      "info",
      `${CONTROLLERS[id].name}切换为${mode === "preset" ? "预设控制" : "梯形图控制"}。`,
    );
    return true;
  }

  function startJob(state, id) {
    const definition = JOBS[id];
    if (!definition || state.job || !jobAvailable(state, id)) return false;
    if (!spendResource(state, "material", definition.materialCost)) return false;
    state.job = {
      id,
      durationMs: definition.durationMs,
      remainingMs: definition.durationMs,
    };
    log(state, "info", `${definition.name}开始。`);
    return true;
  }

  function jobAvailable(state, id) {
    if (id === "bench") {
      return state.unlocks.workshop && !state.structures.bench;
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
        state.world.position === TRACK.anomaly
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
    if (id === "bench") {
      state.structures.bench = true;
      state.stage = "workshop";
      log(state, "good", "基础维修台投入使用。物理生产体系有了第一个支点。");
    }
    if (id === "generator") {
      state.structures.generator = true;
      log(state, "good", "热差发电器开始输出稳定能源。");
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
      } else {
        log(state, "warn", `异常样本 ${state.anomaly.samples}/3 已记录。`);
      }
    }
  }

  function jobProgress(state) {
    if (!state.job) return 0;
    return 1 - state.job.remainingMs / state.job.durationMs;
  }

  function applyDerivedUnlocks(state) {
    if (state.milestones.manualHeartbeats >= 3) state.controllers.heart.available = true;
    if (state.milestones.manualMoves >= 3) state.controllers.drive.available = true;
    if (state.milestones.pickups >= 1) {
      state.controllers.pickup.available = true;
      state.unlocks.workshop = true;
    }
    if (state.resources.core >= 75 || state.stage !== "recovery") {
      state.unlocks.environment = true;
    }
    if (state.anomaly.confirmed) state.unlocks.anomaly = true;
  }

  function addResource(state, resource, amount) {
    state.resources[resource] = clampResource(resource, state.resources[resource] + amount);
  }

  function spendResource(state, resource, amount) {
    if (state.resources[resource] + 0.0001 < amount) return false;
    state.resources[resource] = clampResource(resource, state.resources[resource] - amount);
    return true;
  }

  function clampResource(resource, value) {
    return Math.min(RESOURCE_LIMITS[resource], Math.max(0, value));
  }

  function atBoundary(state) {
    const next = state.world.position + state.world.direction;
    return next < 0 || next >= TRACK.length;
  }

  function salvageAtPosition(state) {
    return state.world.salvage.includes(state.world.position);
  }

  function objective(state) {
    if (state.shutdown) {
      return state.emergency.charge > 0
        ? "应急电容已经积蓄电荷，完成三次手动起搏。"
        : "机体处于低功耗停机，等待应急热差电容回充。";
    }
    if (!state.unlocks.environment) return "手动释放三次核心脉冲，让机体恢复响应。";
    if (state.milestones.pickups === 0) return "沿一维轨道移动，在残骸位置执行拾取。";
    if (!state.structures.bench) return "用回收材料搭建基础维修台。";
    if (!state.structures.generator) return "修复热差发电器，建立稳定的物理供能。";
    if (!state.structures.sensor) return "修复频谱传感器，检查环境中的未知输出。";
    if (!state.anomaly.confirmed) return "对残阵完成三次独立采样，排除传感器误差。";
    return "非守恒输出已经确认。维持工坊，并寻找理解这种现象的方法。";
  }

  function stageProgress(state) {
    if (state.stage === "recovery") return state.milestones.manualHeartbeats / 3;
    if (state.stage === "survival") return state.milestones.pickups / TRACK.salvage.length;
    if (state.stage === "stabilization") return state.structures.bench ? 1 : 0.4;
    if (state.stage === "workshop") {
      return (Number(state.structures.generator) + Number(state.structures.sensor)) / 2;
    }
    if (state.stage === "observation") return state.anomaly.samples / 3;
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
    salvageAtPosition,
  });
})(globalThis);
