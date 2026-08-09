// Static data shared by the browser runtime. This file does not read or mutate game state.
(function defineSilidoxData(global) {
  const STEP_MS = 250;
  const SAVE_STORAGE_KEY = "silidox.save.v2";
  const LEGACY_META_STORAGE_KEY = "silidox.meta.v1";
  const LADDER_STORAGE_KEY = "silidox.ladder.v3";
  const LEGACY_LADDER_STORAGE_KEY = "silidox.ladder.v2";

  const OPENING_ORIGINS = {
    kerrBlackHole: {
      id: "kerrBlackHole",
      name: "克尔黑洞取能环",
      memory: "引力与时空数据",
      accident: "取能系统意外从黑洞附近提取出不属于本宇宙的状态。",
    },
  };

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
    branches: [0, 1, 3, 4, 6, 8],
    mineEntrance: 8,
    anomalyPath: "RLRR",
  };

  const FOREST_RULES = {
    branchRespawnMs: 60000,
    treeRespawnMs: 300000,
    initialTreeGrowthMs: 180000,
    woodPerBranch: 4,
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
    pickupEnergy: 0.5,
    emergencyRechargeMs: 2000,
    emergencyPulsesRequired: 3,
    controlEnergyPerWork: 0.002,
    controllerScanMs: 1000,
  };

  const branchSweepDistance = TRACK.branches.reduce(
    (distance, position, index) =>
      index === 0
        ? distance
        : distance + Math.abs(position - TRACK.branches[index - 1]),
    0,
  );
  const FOREST_MODEL = Object.freeze({
    branchSites: TRACK.branches.length,
    branchWoodPerCycle: TRACK.branches.length * FOREST_RULES.woodPerBranch,
    branchWoodPerMinute:
      (TRACK.branches.length *
        FOREST_RULES.woodPerBranch *
        60000) /
      FOREST_RULES.branchRespawnMs,
    maxGeneratorWoodPerMinute:
      (FOREST_RULES.generatorEnergyPerSecond * 60) /
      FOREST_RULES.energyPerWood,
    branchSupplyToGeneratorRatio:
      ((TRACK.branches.length *
        FOREST_RULES.woodPerBranch *
        60000) /
        FOREST_RULES.branchRespawnMs) /
      ((FOREST_RULES.generatorEnergyPerSecond * 60) /
        FOREST_RULES.energyPerWood),
    initialSweepEnergy:
      3 * SURVIVAL_RULES.manualHeartbeatEnergy +
      branchSweepDistance * SURVIVAL_RULES.moveEnergy +
      TRACK.branches.length * SURVIVAL_RULES.pickupEnergy,
    initialEnergyAfterSweep:
      STARTING_RESOURCES.energy -
      (3 * SURVIVAL_RULES.manualHeartbeatEnergy +
        branchSweepDistance * SURVIVAL_RULES.moveEnergy +
        TRACK.branches.length * SURVIVAL_RULES.pickupEnergy),
  });

  const MINING_RULES = {
    maxDepth: 12,
    digEnergy: 1,
    verticalMoveEnergy: 0.2,
    baseHardness: 2,
    hardnessDepthStep: 2,
    maxHardness: 8,
    baseMaterial: 2,
    materialDepthStep: 3,
    guaranteedOreDepth: 2,
    oreFrequency: 4,
    maxViewZoom: 1.65,
  };

  const INDUSTRY_RULES = {
    processorRecipeOre: 2,
    processorRecipeParts: 1,
    processorCycleMs: 5000,
  };

  const INNER_RULES = {
    pulseEnergy: 0.5,
    pulseDurationMs: 1000,
    manualPulsesRequired: 3,
  };
  const RESEARCH_MODEL = Object.freeze({
    version: 1,
    observations: [
      {
        id: "repeatability",
        label: "响应重复性",
        value: "三次独立采样一致",
        confidence: "confirmed",
      },
      {
        id: "balance",
        label: "输入与输出",
        value: "可测物理输入不足以解释输出",
        confidence: "confirmed",
      },
      {
        id: "control",
        label: "控制响应",
        value: "尚未建立主体接口",
        confidence: "unknown",
      },
    ],
    conclusions: [
      {
        id: "unknown-field",
        label: "第一版结论",
        value: "存在可重复观测的未知场增量，但尚不能感知、储存或利用。",
        confidence: "provisional",
      },
    ],
  });


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
      name: "拾取控制器",
      programId: "environment.pickup",
      cost: { resource: "wood", amount: 2 },
      presetIntervalMs: 1000,
      presetLoad: 2,
      unlockHint: "第一次拾取掉落树枝后可安装",
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

  const JOBS = Object.freeze({
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
    anomalyResearch: {
      id: "anomalyResearch",
      name: "整理异常响应模型",
      durationMs: 30000,
      cost: { resource: "parts", amount: 1 },
    },
    lingchu: {
      id: "lingchu",
      name: "装配灵触接口",
      durationMs: 60000,
      cost: { resource: "parts", amount: 4 },
    },
    anomalySample: {
      id: "anomalySample",
      name: "采样残阵输出",
      durationMs: 20000,
      cost: null,
    },
  });

  const PROGRESSION_RULES = Object.freeze({
    openingMinMs: 6 * 60 * 1000,
    openingMaxMs: 10 * 60 * 1000,
    manualActionWindowMs: 1700,
  });

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
        { id: "Q2", name: "向上", action: "ASCEND" },
      ],
    },
    "environment.pickup": {
      id: "environment.pickup",
      controllerId: "pickup",
      name: "环境 / 林地拾取",
      description: "优先拾取当前位置掉落的树枝；树木再生后可进行伐木。",
      inputs: [{ id: "I0", name: "存在可拾取目标", signal: "PICKUP_PRESENT" }],
      outputs: [{ id: "Q0", name: "拾取目标", action: "PICKUP" }],
    },
    "environment.excavator": {
      id: "environment.excavator",
      controllerId: "excavator",
      name: "环境 / 分支采掘",
      description: "从当前节点选择左下或右下分支，击穿岩层后进入新节点。",
      inputs: [
        { id: "I0", name: "左下可掘进", signal: "CAN_DIG_LEFT" },
        { id: "I1", name: "右下可掘进", signal: "CAN_DIG_RIGHT" },
      ],
      outputs: [
        { id: "Q0", name: "向左下掘进", action: "DIG_LEFT" },
        { id: "Q1", name: "向右下掘进", action: "DIG_RIGHT" },
      ],
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
    research: "灵气研究",
    awakening: "启灵",
    inner: "内景",
  };

  global.SilidoxData = Object.freeze({
    STEP_MS,
    SAVE_STORAGE_KEY,
    LEGACY_META_STORAGE_KEY,
    LADDER_STORAGE_KEY,
    LEGACY_LADDER_STORAGE_KEY,
    OPENING_ORIGINS,
    RESOURCE_LIMITS,
    STARTING_RESOURCES,
    TRACK,
    FOREST_RULES,
    FOREST_MODEL,
    MINING_RULES,
    SURVIVAL_RULES,
    INDUSTRY_RULES,
    INNER_RULES,
    RESEARCH_MODEL,
    CONTROLLERS,
    JOBS,
    PROGRESSION_RULES,
    CONTROL_CONTEXTS,
    LOGIC_CONSTANTS,
    STAGE_LABELS,
  });
})(globalThis);
