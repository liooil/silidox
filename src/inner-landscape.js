// Deterministic inner-landscape (内景) simulation kernel.
// 形骸: fixed node definitions and circuit edges; 灵流: pressure, impurity,
// temperature and stability; 神意: declarative control commands only.
// No DOM, no localStorage, no random: fixed 250ms stepping, fully reproducible.
(function defineSilidoxInnerLandscape(global) {
  const STEP_MS = 250;

  // Node type catalog (第一版十类节点). The reference circuit below uses a subset.
  const NODE_TYPES = {
    external: "外界灵场",
    lingchu: "灵触",
    channel: "灵导通道",
    filter: "滤障",
    buffer: "缓冲节点",
    refine: "炼化节点",
    dantian: "人工丹田",
    valve: "阀门／分流",
    relief: "泄压旁路",
    purge: "排异节点",
  };

  const CONDUCTANCE = 0.15; // flow per pressure difference per 250ms step
  const AMBIENT_TEMPERATURE = 20;
  const TEMPERATURE_LIMIT = 80;
  const IMPURITY_LIMIT = 60;
  const STABILITY_LIMIT = 30;
  const PURGE_RATE = 3;
  const REFINE_QUIET = 0.06; // conversion fraction per step
  const REFINE_BATTLE = 0.1;
  const REFINE_BURST = 0.2;
  const DANTIAN_CAPACITY = 120;
  const FILTER_TRAP = 0.35; // impurity fraction trapped per step
  const REFINE_HEAT = { quiet: 0.9, battle: 1.4, burst: 4 };

  // Reference first circuit: linear intake chain ending at the refining node,
  // with relief and purge attached to the processing bottleneck.
  const CIRCUIT = {
    nodes: [
      { id: "field", type: "external", capacity: 999 },
      { id: "touch", type: "lingchu", capacity: 90 },
      { id: "duct", type: "channel", capacity: 85 },
      { id: "filter", type: "filter", capacity: 85 },
      { id: "buffer", type: "buffer", capacity: 95 },
      { id: "refine", type: "refine", capacity: 80 },
      { id: "dantian", type: "dantian", capacity: DANTIAN_CAPACITY },
    ],
    edges: [
      ["touch", "duct"],
      ["duct", "filter"],
      ["filter", "buffer"],
      ["buffer", "refine"],
    ],
    reliefNode: "refine",
    purgeNode: "refine",
  };

  function createInnerState() {
    const nodes = {};
    for (const definition of CIRCUIT.nodes) {
      nodes[definition.id] = {
        id: definition.id,
        type: definition.type,
        capacity: definition.capacity,
        pressure: 0,
        temperature: AMBIENT_TEMPERATURE,
        impurity: 0,
        stability: 100,
        history: [],
      };
    }
    nodes.filter.trapped = 0;
    nodes.refine.converted = 0;
    nodes.dantian.stored = 0;

    const flows = {};
    for (const node of CIRCUIT.nodes) flows[node.id] = 0;

    return {
      version: 1,
      external: { pressure: 60, impurity: 0.05 },
      nodes,
      flows,
      control: { mode: "quiet", reliefOpen: 0, purgeOpen: 0 },
      faults: [],
      events: [],
      clock: { elapsedMs: 0, stepCount: 0, paused: false },
    };
  }

  function advance(inner, deltaMs) {
    if (!inner || inner.clock.paused || deltaMs <= 0) return inner;
    let remaining = Math.min(deltaMs, 1000);
    while (remaining >= STEP_MS) {
      stepOnce(inner);
      remaining -= STEP_MS;
    }
    return inner;
  }

  function stepOnce(inner) {
    inner.clock.elapsedMs += STEP_MS;
    inner.clock.stepCount += 1;
    const step = inner.clock.stepCount;
    const external = inner.external;

    // 神意：解析声明式命令，不携带任意脚本。
    const refineRate =
      inner.control.mode === "burst"
        ? REFINE_BURST
        : inner.control.mode === "battle"
          ? REFINE_BATTLE
          : REFINE_QUIET;

    // 灵流：灵触是双向接口（振荡表现为来回涌动），通道保持单向淤塞特性。
    const flows = {};
    for (const node of CIRCUIT.nodes) flows[node.id] = 0;

    const intake = CONDUCTANCE * (external.pressure - inner.nodes.touch.pressure);
    flows.touch = Math.max(0, intake);
    inner.nodes.touch.pressure += intake;
    inner.nodes.touch.impurity = Math.max(
      0,
      inner.nodes.touch.impurity + intake * external.impurity,
    );

    for (const [from, to] of CIRCUIT.edges) {
      const amount = Math.max(
        0,
        CONDUCTANCE * (inner.nodes[from].pressure - inner.nodes[to].pressure),
      );
      flows[to] = amount;
      if (amount <= 0) continue;
      const upstream = inner.nodes[from];
      const downstream = inner.nodes[to];
      upstream.pressure -= amount;
      downstream.pressure += amount;
      const carried = amount * (upstream.impurity / 100);
      upstream.impurity -= carried;
      downstream.impurity += carried;
    }
    inner.flows = flows;

    // 滤障：截留杂质。
    const filter = inner.nodes.filter;
    const trapped = filter.impurity * FILTER_TRAP;
    filter.impurity -= trapped;
    filter.trapped += trapped;

    // 炼化：把原灵转换为可控灵力并送入丹田；丹田满时停止转换形成回压。
    const refined = inner.nodes.refine;
    const dantian = inner.nodes.dantian;
    let conversion = 0;
    if (dantian.pressure < DANTIAN_CAPACITY) {
      const room = DANTIAN_CAPACITY - dantian.pressure;
      conversion = Math.min(
        refineRate * refined.pressure,
        refined.pressure * 0.5,
        room,
      );
      refined.pressure -= conversion;
      dantian.pressure += conversion;
      refined.converted += conversion;
      const convertedImpurity = conversion * (refined.impurity / 100);
      refined.impurity -= convertedImpurity;
      dantian.impurity += convertedImpurity;
    }
    dantian.stored = Math.min(DANTIAN_CAPACITY, dantian.pressure);

    // 泄压旁路：过载时向环境安全释放灵流；排异节点：排出杂质。
    const reliefFlow = inner.control.reliefOpen * 0.3 * refined.pressure;
    refined.pressure -= reliefFlow;
    refined.impurity = Math.max(
      0,
      refined.impurity - inner.control.purgeOpen * PURGE_RATE,
    );

    // 温度：流动摩擦 + 炼化热，向环境冷却。
    for (const node of Object.values(inner.nodes)) {
      if (node.type === "external") continue;
      const heat =
        (flows[node.id] ?? 0) * 0.12 +
        (node.id === "refine"
          ? conversion * (REFINE_HEAT[inner.control.mode] ?? REFINE_HEAT.quiet)
          : 0) +
        (node.id === "dantian" ? dantian.pressure * 0.002 : 0);
      node.temperature += heat - 0.06 * (node.temperature - AMBIENT_TEMPERATURE);
      node.temperature = Math.max(0, node.temperature);
    }

    // 稳定度：以近期灵压振荡幅度衡量。
    for (const node of Object.values(inner.nodes)) {
      if (node.type === "external") continue;
      node.history.push(node.pressure);
      if (node.history.length > 8) node.history.shift();
      node.stability = measureStability(node.history);
    }

    updateFaults(inner, step);
  }

  function measureStability(history) {
    if (history.length < 3) return 100;
    const deltas = [];
    for (let i = 1; i < history.length; i += 1) {
      deltas.push(history[i] - history[i - 1]);
    }
    let oscillation = 0;
    for (let i = 1; i < deltas.length; i += 1) {
      if (deltas[i] * deltas[i - 1] < 0) {
        oscillation += Math.min(Math.abs(deltas[i]), 20);
      }
    }
    return Math.max(0, 100 - oscillation * 12);
  }

  function updateFaults(inner, step) {
    const next = [];
    for (const node of Object.values(inner.nodes)) {
      if (node.type === "external") continue;
      const candidates = [
        ["overpressure", node.pressure > node.capacity, "灵压超过承载上限，需泄压或降低输入。"],
        ["overheat", node.temperature > TEMPERATURE_LIMIT, "温度超过散热能力，需降低炼化功率。"],
        ["pollution", node.impurity > IMPURITY_LIMIT, "杂质超过排异能力，需开启排异或更换滤障。"],
        ["oscillation", node.stability < STABILITY_LIMIT, "反馈振荡使灵流失稳，需调整控制时序。"],
      ];
      for (const [kind, active, suggestion] of candidates) {
        if (!active) continue;
        const key = `${node.id}:${kind}`;
        next.push(key);
        if (!inner.faults.includes(key)) {
          inner.events.push({
            atStep: step,
            kind,
            node: node.id,
            text: `${NODE_TYPES[node.type]} ${node.id}：${suggestion}`,
          });
        }
      }
    }
    inner.faults = next;
  }

  // 神意层只接受声明式命令：模式切换、泄压/排异开度。
  function applyControl(inner, command) {
    if (!inner || !command || typeof command !== "object") return false;
    if (["quiet", "battle", "burst"].includes(command.mode)) {
      inner.control.mode = command.mode;
    }
    if (Number.isFinite(Number(command.reliefOpen))) {
      inner.control.reliefOpen = clamp01(Number(command.reliefOpen));
    }
    if (Number.isFinite(Number(command.purgeOpen))) {
      inner.control.purgeOpen = clamp01(Number(command.purgeOpen));
    }
    return true;
  }

  function setExternal(inner, input) {
    if (!inner || !input || typeof input !== "object") return false;
    if (Number.isFinite(Number(input.pressure))) {
      inner.external.pressure = Math.max(0, Math.min(Number(input.pressure), 300));
    }
    if (Number.isFinite(Number(input.impurity))) {
      inner.external.impurity = Math.max(0, Math.min(Number(input.impurity), 1));
    }
    return true;
  }

  function getMetrics(inner, nodeId) {
    const node = inner.nodes?.[nodeId];
    if (!node) return null;
    return {
      flow: inner.flows[nodeId] ?? 0,
      pressure: node.pressure,
      purity: Math.max(0, Math.min(1, 1 - node.impurity / 100)),
      impurity: node.impurity,
      temperature: node.temperature,
      stability: node.stability,
    };
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

  global.SilidoxInnerLandscape = Object.freeze({
    STEP_MS,
    NODE_TYPES,
    createInnerState,
    advance,
    applyControl,
    setExternal,
    getMetrics,
  });
})(globalThis);
