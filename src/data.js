// Static data shared by the browser runtime. This file does not read or mutate game state.
(function defineSilidoxData(global) {
  const STEP_MS = 250;
  const SAVE_STORAGE_KEY = "silidox.save.v2";
  const LEGACY_META_STORAGE_KEY = "silidox.meta.v1";
  const LADDER_STORAGE_KEY = "silidox.ladder.v3";
  const LEGACY_LADDER_STORAGE_KEY = "silidox.ladder.v2";

  const RESOURCE_LIMITS = {
    core: 100,
    energy: 100,
    material: 999,
    ore: 120,
    parts: 60,
  };

  const STARTING_RESOURCES = {
    core: 25,
    energy: 30,
    material: 0,
    ore: 0,
    parts: 0,
  };

  const TRACK = {
    length: 9,
    start: 0,
    salvage: [2, 5, 7],
    anomaly: 8,
  };

  const SALVAGE_REWARD = {
    energy: 8,
    material: 5,
  };

  const SURVIVAL_RULES = {
    coreDecayPerSecond: 1,
    manualHeartbeatEnergy: 1,
    heartbeatRestore: 25,
    moveEnergy: 0.5,
    reverseEnergy: 0.1,
    pickupEnergy: 0.5,
    emergencyRechargeMs: 2000,
    emergencyPulsesRequired: 3,
    generatorEnergyPerSecond: 0.15,
    controlEnergyPerWork: 0.002,
    controllerScanMs: 1000,
  };

  const INDUSTRY_RULES = {
    veinPositions: [1, 3, 6],
    veinRespawnMs: 10000,
    veinRewardOre: 2,
    veinRewardMaterial: 1,
    processorRecipeOre: 2,
    processorRecipeParts: 1,
    processorCycleMs: 5000,
  };

  const CONTROLLERS = {
    heart: {
      id: "heart",
      name: "核心控制器",
      programId: "body.heart",
      materialCost: 3,
      presetIntervalMs: 8000,
      presetLoad: 4,
      unlockHint: "完成三次手动核心脉冲后可安装",
    },
    drive: {
      id: "drive",
      name: "轨道驱动器",
      programId: "environment.drive",
      materialCost: 3,
      presetIntervalMs: 2000,
      presetLoad: 3,
      unlockHint: "完成三次手动移动后可安装",
    },
    pickup: {
      id: "pickup",
      name: "拾取控制器",
      programId: "environment.pickup",
      materialCost: 2,
      presetIntervalMs: 1000,
      presetLoad: 2,
      unlockHint: "手动拾取第一份残骸后可安装",
    },
  };

  const JOBS = {
    bench: {
      id: "bench",
      name: "搭建基础维修台",
      durationMs: 45000,
      materialCost: 4,
    },
    generator: {
      id: "generator",
      name: "修复热差发电器",
      durationMs: 60000,
      materialCost: 2,
    },
    sensor: {
      id: "sensor",
      name: "修复频谱传感器",
      durationMs: 90000,
      materialCost: 1,
    },
    processor: {
      id: "processor",
      name: "搭建部件加工台",
      durationMs: 120000,
      materialCost: 4,
    },
    anomalySample: {
      id: "anomalySample",
      name: "采样残阵输出",
      durationMs: 20000,
      materialCost: 0,
    },
  };

  const CONTROL_CONTEXTS = {
    "body.heart": {
      id: "body.heart",
      controllerId: "heart",
      name: "机体 / 核心控制",
      description: "用核心偏低信号决定何时释放心跳脉冲。",
      inputs: [
        { id: "I0", name: "核心偏低", signal: "CORE_LOW" },
        { id: "I1", name: "机体停机", signal: "SHUTDOWN" },
      ],
      outputs: [{ id: "Q0", name: "核心脉冲", action: "HEARTBEAT" }],
    },
    "environment.drive": {
      id: "environment.drive",
      controllerId: "drive",
      name: "环境 / 轨道驱动",
      description: "根据边界信号控制前进与掉头。",
      inputs: [
        { id: "I0", name: "前方边界", signal: "AT_BOUNDARY" },
        { id: "I1", name: "位于起点", signal: "AT_ORIGIN" },
      ],
      outputs: [
        { id: "Q0", name: "向前移动", action: "DRIVE" },
        { id: "Q1", name: "切换方向", action: "REVERSE" },
      ],
    },
    "environment.pickup": {
      id: "environment.pickup",
      controllerId: "pickup",
      name: "环境 / 残骸拾取",
      description: "仅在当前位置存在残骸时执行拾取。",
      inputs: [{ id: "I0", name: "残骸存在", signal: "SALVAGE_PRESENT" }],
      outputs: [{ id: "Q0", name: "拾取残骸", action: "PICKUP" }],
    },
  };

  const LOGIC_CONSTANTS = {
    0: { value: false, name: "常量低电平" },
    1: { value: true, name: "常量高电平" },
  };

  const STAGE_LABELS = {
    recovery: "复苏",
    survival: "求生",
    stabilization: "稳态",
    workshop: "工坊",
    observation: "异常观测",
    anomaly: "非守恒证据",
    industry: "工业",
  };

  global.SilidoxData = Object.freeze({
    STEP_MS,
    SAVE_STORAGE_KEY,
    LEGACY_META_STORAGE_KEY,
    LADDER_STORAGE_KEY,
    LEGACY_LADDER_STORAGE_KEY,
    RESOURCE_LIMITS,
    STARTING_RESOURCES,
    TRACK,
    SALVAGE_REWARD,
    SURVIVAL_RULES,
    INDUSTRY_RULES,
    CONTROLLERS,
    JOBS,
    CONTROL_CONTEXTS,
    LOGIC_CONSTANTS,
    STAGE_LABELS,
  });
})(globalThis);
