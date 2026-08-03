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
    wood: 120,
    material: 999,
    ore: 120,
    parts: 60,
  };

  const STARTING_RESOURCES = {
    core: 25,
    energy: 30,
    wood: 0,
    material: 0,
    ore: 0,
    parts: 0,
  };

  const TRACK = {
    length: 9,
    start: 0,
    trees: [2, 5, 7],
    anomaly: 8,
    anomalyDepth: 4,
  };

  const FOREST_RULES = {
    treeRespawnMs: 12000,
    woodPerTree: 4,
    manualBurnWood: 1,
    energyPerWood: 8,
    generatorEnergyPerSecond: 0.5,
    generatorReserveTarget: 75,
    generatorWoodReserve: 1,
  };

  const SURVIVAL_RULES = {
    coreDecayPerSecond: 1,
    manualHeartbeatEnergy: 1,
    heartbeatRestore: 25,
    moveEnergy: 0.5,
    reverseEnergy: 0.1,
    harvestEnergy: 0.5,
    emergencyRechargeMs: 2000,
    emergencyPulsesRequired: 3,
    controlEnergyPerWork: 0.002,
    controllerScanMs: 1000,
  };

  const MINING_RULES = {
    maxDepth: 4,
    digEnergy: 1,
    verticalMoveEnergy: 0.2,
    hardnessByDepth: [0, 2, 3, 4, 5],
    materialByDepth: [0, 2, 2, 3, 3],
    oreByCell: Object.freeze({
      "1:3": 2,
      "2:2": 2,
      "5:3": 3,
      "7:2": 2,
      "8:4": 4,
    }),
  };

  const INDUSTRY_RULES = {
    processorRecipeOre: 2,
    processorRecipeParts: 1,
    processorCycleMs: 5000,
  };

  const CONTROLLERS = {
    heart: {
      id: "heart",
      name: "核心控制器",
      programId: "body.heart",
      cost: { resource: "wood", amount: 3 },
      presetIntervalMs: 8000,
      presetLoad: 4,
      unlockHint: "完成三次手动核心脉冲后可安装",
    },
    drive: {
      id: "drive",
      name: "行走控制器",
      programId: "environment.drive",
      cost: { resource: "wood", amount: 3 },
      presetIntervalMs: 2000,
      presetLoad: 3,
      unlockHint: "完成三次手动移动后可安装",
    },
    pickup: {
      id: "pickup",
      name: "伐木控制器",
      programId: "environment.pickup",
      cost: { resource: "wood", amount: 2 },
      presetIntervalMs: 1000,
      presetLoad: 2,
      unlockHint: "第一次手动伐木后可安装",
    },
    excavator: {
      id: "excavator",
      name: "采掘控制器",
      programId: "environment.excavator",
      cost: { resource: "material", amount: 3 },
      presetIntervalMs: 1250,
      presetLoad: 3,
      unlockHint: "手动击穿第一层岩体后可安装",
    },
  };

  const JOBS = {
    mineHead: {
      id: "mineHead",
      name: "装配简易掘进头",
      durationMs: 20000,
      cost: { resource: "wood", amount: 4 },
    },
    bench: {
      id: "bench",
      name: "搭建基础维修台",
      durationMs: 45000,
      cost: { resource: "material", amount: 4 },
    },
    generator: {
      id: "generator",
      name: "搭建木气化炉",
      durationMs: 60000,
      cost: { resource: "wood", amount: 2 },
    },
    sensor: {
      id: "sensor",
      name: "修复频谱传感器",
      durationMs: 90000,
      cost: { resource: "material", amount: 3 },
    },
    processor: {
      id: "processor",
      name: "搭建部件加工台",
      durationMs: 120000,
      cost: { resource: "material", amount: 4 },
    },
    anomalySample: {
      id: "anomalySample",
      name: "采样残阵输出",
      durationMs: 20000,
      cost: null,
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
      name: "环境 / 林地行走",
      description: "根据边界信号控制前进与掉头。",
      inputs: [
        { id: "I0", name: "前方边界", signal: "AT_BOUNDARY" },
        { id: "I1", name: "位于起点", signal: "AT_ORIGIN" },
        { id: "I2", name: "位于地下", signal: "BELOW_SURFACE" },
      ],
      outputs: [
        { id: "Q0", name: "向前移动", action: "DRIVE" },
        { id: "Q1", name: "切换方向", action: "REVERSE" },
        { id: "Q2", name: "向上返回", action: "ASCEND" },
      ],
    },
    "environment.pickup": {
      id: "environment.pickup",
      controllerId: "pickup",
      name: "环境 / 地表伐木",
      description: "仅在地表当前位置存在成熟树木时执行伐木。",
      inputs: [{ id: "I0", name: "成熟树木", signal: "TREE_PRESENT" }],
      outputs: [{ id: "Q0", name: "执行伐木", action: "HARVEST" }],
    },
    "environment.excavator": {
      id: "environment.excavator",
      controllerId: "excavator",
      name: "环境 / 向下采掘",
      description: "在当前横向位置持续掘进，击穿岩层后进入下一深度。",
      inputs: [
        { id: "I0", name: "可以向下", signal: "CAN_DIG_DOWN" },
        { id: "I1", name: "下层含矿", signal: "ORE_BELOW" },
      ],
      outputs: [{ id: "Q0", name: "向下掘进", action: "DIG_DOWN" }],
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
    mining: "采掘",
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
    FOREST_RULES,
    MINING_RULES,
    SURVIVAL_RULES,
    INDUSTRY_RULES,
    CONTROLLERS,
    JOBS,
    CONTROL_CONTEXTS,
    LOGIC_CONSTANTS,
    STAGE_LABELS,
  });
})(globalThis);
