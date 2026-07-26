// Main game loop, world simulation, and screen rendering.
const els = {
  stepBtn: document.querySelector("#stepBtn"),
  runBtn: document.querySelector("#runBtn"),
  resetBtn: document.querySelector("#resetBtn"),
  newGameBtn: document.querySelector("#newGameBtn"),
  addRungBtn: document.querySelector("#addRungBtn"),
  addOpenContactBtn: document.querySelector("#addOpenContactBtn"),
  addClosedContactBtn: document.querySelector("#addClosedContactBtn"),
  deleteNodeBtn: document.querySelector("#deleteNodeBtn"),
  moveLeftBtn: document.querySelector("#moveLeftBtn"),
  moveRightBtn: document.querySelector("#moveRightBtn"),
  contactOpSelect: document.querySelector("#contactOpSelect"),
  pinSelect: document.querySelector("#pinSelect"),
  coilSelect: document.querySelector("#coilSelect"),
  rungList: document.querySelector("#rungList"),
  logWindow: document.querySelector("#logWindow"),
  sensorBank: document.querySelector("#sensorBank"),
  outputBank: document.querySelector("#outputBank"),
  ioScanReadout: document.querySelector("#ioScanReadout"),
  worldCanvas: document.querySelector("#worldCanvas"),
  blindOverlay: document.querySelector("#blindOverlay"),
  cameraChip: document.querySelector("#cameraChip"),
  tickReadout: document.querySelector("#tickReadout"),
  energyReadout: document.querySelector("#energyReadout"),
  coreReadout: document.querySelector("#coreReadout"),
  fiberReadout: document.querySelector("#fiberReadout"),
  auraReadout: document.querySelector("#auraReadout"),
  foundationReadout: document.querySelector("#foundationReadout"),
  realmReadout: document.querySelector("#realmReadout"),
  epochState: document.querySelector("#epochState"),
  epochLabel: document.querySelector("#epochLabel"),
  objectiveText: document.querySelector("#objectiveText"),
  ledgerPanel: document.querySelector("#ledgerPanel"),
  ledgerSample: document.querySelector("#ledgerSample"),
  ledgerAck: document.querySelector("#ledgerAck"),
  ledgerPhase: document.querySelector("#ledgerPhase"),
  heavenAttention: document.querySelector("#heavenAttention"),
  epochOverlay: document.querySelector("#epochOverlay"),
  realmChip: document.querySelector("#realmChip"),
  cultQi: document.querySelector("#cultQi"),
  cultFoundation: document.querySelector("#cultFoundation"),
  cultYin: document.querySelector("#cultYin"),
  cultYang: document.querySelector("#cultYang"),
  cultAttention: document.querySelector("#cultAttention"),
  cultNext: document.querySelector("#cultNext"),
  cultivationHint: document.querySelector("#cultivationHint"),
  drawQiBtn: document.querySelector("#drawQiBtn"),
  breathUpgradeBtn: document.querySelector("#breathUpgradeBtn"),
  foundationBtn: document.querySelector("#foundationBtn"),
  spiritArrayBtn: document.querySelector("#spiritArrayBtn"),
  breakthroughBtn: document.querySelector("#breakthroughBtn"),
};

const ctx = els.worldCanvas.getContext("2d");
const meta = loadMeta();

let state = createInitialState(meta.epoch);
let runTimer = null;
let logScrollFrame = null;
let overlayTimer = null;

initLadderEditor();
renderSensorBank();
wireRunEvents();

compileAndReport();
render();

function loadMeta() {
  const fallback = {
    epoch: 0,
    patchLevel: 0,
    complete: false,
    discoveries: {},
    cultivation: createDefaultCultivation(),
  };
  const stored = localStorage.getItem(META_STORAGE_KEY);
  if (!stored) return fallback;

  try {
    const value = JSON.parse(stored);
    return {
      epoch: Number.isInteger(value.epoch) ? Math.max(0, value.epoch) : 0,
      patchLevel: Number.isInteger(value.patchLevel) ? Math.max(0, value.patchLevel) : 0,
      complete: Boolean(value.complete),
      discoveries: normalizeDiscoveries(value.discoveries),
      cultivation: normalizeCultivation(value.cultivation),
    };
  } catch {
    localStorage.removeItem(META_STORAGE_KEY);
    return fallback;
  }
}

function createDefaultCultivation() {
  return {
    qi: 0,
    lifetimeQi: 0,
    foundation: 0,
    realm: 0,
    yinLevel: 0,
    yangLevel: 0,
    attention: 0,
    manualDraws: 0,
    breakthroughs: 0,
  };
}

function normalizeCultivation(value) {
  const fallback = createDefaultCultivation();
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;

  return {
    qi: normalizeNumber(value.qi, 0, 999999),
    lifetimeQi: normalizeNumber(value.lifetimeQi, 0, 999999),
    foundation: Math.floor(normalizeNumber(value.foundation, 0, 9999)),
    realm: Math.min(
      REALMS.length - 1,
      Math.floor(normalizeNumber(value.realm, 0, REALMS.length - 1)),
    ),
    yinLevel: Math.floor(normalizeNumber(value.yinLevel, 0, 999)),
    yangLevel: Math.floor(normalizeNumber(value.yangLevel, 0, 999)),
    attention: normalizeNumber(value.attention, 0, 100),
    manualDraws: Math.floor(normalizeNumber(value.manualDraws, 0, 999999)),
    breakthroughs: Math.floor(normalizeNumber(value.breakthroughs, 0, 999999)),
  };
}

function normalizeNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function cloneCultivation(cultivation) {
  return { ...cultivation };
}

function normalizeDiscoveries(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const normalized = {};
  for (const [epoch, pins] of Object.entries(value)) {
    if (!/^\d+$/.test(epoch) || !pins || typeof pins !== "object" || Array.isArray(pins)) {
      continue;
    }

    const knownPins = {};
    for (const pin of PIN_IDS) {
      const level = Number(pins[pin]);
      if (level === DISCOVERY.SUSPECTED || level === DISCOVERY.CONFIRMED) {
        knownPins[pin] = level;
      }
    }
    if (Object.keys(knownPins).length > 0) normalized[epoch] = knownPins;
  }
  return normalized;
}

function saveMeta() {
  localStorage.setItem(META_STORAGE_KEY, JSON.stringify(meta));
}

function discoveryLevel(pin) {
  return meta.discoveries[String(state.epoch)]?.[pin] ?? DISCOVERY.UNKNOWN;
}

function inputSignalLabel(pin) {
  const signal = state.pinMap[pin];
  const info = SIGNAL_INFO[signal];
  const level = discoveryLevel(pin);
  if (level === DISCOVERY.CONFIRMED) return `${signal} · ${info.zh}`;
  if (level === DISCOVERY.SUSPECTED) return `${signal}? · ${info.hypothesis}?`;
  return "未识别信号";
}

function outputSignalLabel(pin) {
  return `${OUTPUTS[pin]} · ${OUTPUT_INFO[pin].zh}`;
}

function pinForSignal(signal) {
  return PIN_IDS.find((pin) => state.pinMap[pin] === signal) ?? null;
}

function discoverSignal(signal, level) {
  const pin = pinForSignal(signal);
  if (!pin || level <= discoveryLevel(pin)) return;

  const epoch = String(state.epoch);
  if (!meta.discoveries[epoch]) meta.discoveries[epoch] = {};
  meta.discoveries[epoch][pin] = level;
  saveMeta();

  const info = SIGNAL_INFO[signal];
  if (level === DISCOVERY.CONFIRMED) {
    log("good", `信号确认：${pin} ${signal} / ${info.zh}`);
  } else {
    log("warn", `信号假设：${pin} ${signal}? / ${info.hypothesis}?`);
  }
}

function recordSignalEvidence(signal) {
  state.signalEvidence[signal] = (state.signalEvidence[signal] ?? 0) + 1;
  const level =
    state.signalEvidence[signal] >= 2 ? DISCOVERY.CONFIRMED : DISCOVERY.SUSPECTED;
  discoverSignal(signal, level);
}

function observeSignals(sensors) {
  for (const pin of PIN_IDS) {
    if (!sensors[pin]) continue;
    const signal = state.pinMap[pin];
    if (state.signalEvidence[signal] && discoveryLevel(pin) < DISCOVERY.CONFIRMED) {
      recordSignalEvidence(signal);
    } else {
      discoverSignal(signal, DISCOVERY.SUSPECTED);
    }
  }
}

function createInitialState(epoch) {
  const isPatchedEpoch = epoch > 0;
  return {
    epoch,
    stage: isPatchedEpoch ? "remap" : "boot",
    eventSerial: 0,
    track: {
      length: TRACK_LENGTH,
      start: TRACK_START,
      fragments: [...TRACK_FRAGMENTS],
    },
    pinMap: PIN_MAPS[Math.min(epoch, PIN_MAPS.length - 1)],
    robot: { x: TRACK_START, y: 0, dir: 1 },
    contact: { stall: false, fiber: false },
    pickupPulse: false,
    tick: 0,
    lastScan: null,
    signalEvidence: {},
    energy: 100,
    core: 70,
    corePulses: 0,
    parts: 0,
    aura: 0,
    cultivation: cloneCultivation(meta.cultivation),
    cameraUnlocked: false,
    halted: false,
    heavenAttention: 0,
    calamityCountdown: null,
    ledger: {
      offering: false,
      ack: false,
      creditsForOffering: 0,
      consumeAt: null,
      respawnAt: null,
      windowOrigin: 0,
      duplicateDetected: false,
    },
    logs: isPatchedEpoch
      ? [
          { type: "bad", tick: 0, text: "heaven patch applied: I/O signature rewritten" },
          { type: "good", tick: 0, text: "module archive restored from previous epoch" },
          { type: "warn", tick: 0, text: "core loop incompatible; inspect remapped channels" },
        ]
      : [
          { type: "good", tick: 0, text: "boot: no spiritual root detected" },
          { type: "warn", tick: 0, text: "semantic drivers missing; raw I/O only" },
          { type: "info", tick: 0, text: "restore core pulse before actuator interlock expires" },
        ],
  };
}

function renderSensorBank() {
  els.sensorBank.innerHTML = "";
  for (const pin of PIN_IDS) {
    createBusNode(els.sensorBank, pin, inputSignalLabel(pin));
  }

  els.outputBank.innerHTML = "";
  for (const pin of Object.keys(OUTPUTS)) {
    createBusNode(els.outputBank, pin, outputSignalLabel(pin)).classList.add("identified");
  }
}

function createBusNode(container, pin, name) {
  const node = container.appendChild(document.createElement("div"));
  node.className = "sensor";
  node.dataset.pin = pin;

  const key = node.appendChild(document.createElement("span"));
  key.className = "bus-pin";
  key.textContent = pin;

  const label = node.appendChild(document.createElement("em"));
  label.textContent = name;
  label.title = name;

  const value = node.appendChild(document.createElement("strong"));
  value.textContent = "0";
  return node;
}

function wireRunEvents() {
  els.stepBtn.addEventListener("click", () => {
    stopRun();
    if (compileAndReport()) tick();
  });

  els.runBtn.addEventListener("click", () => {
    if (runTimer) {
      stopRun();
      return;
    }
    if (!compileAndReport()) return;

    let remaining = 30;
    const eventAtStart = state.eventSerial;
    const epochAtStart = state.epoch;
    els.runBtn.textContent = "停止";
    runTimer = window.setInterval(() => {
      if (remaining <= 0 || state.halted) {
        stopRun();
        return;
      }

      tick();
      remaining -= 1;
      if (state.eventSerial !== eventAtStart || state.epoch !== epochAtStart) {
        stopRun();
      }
    }, 150);
  });

  els.resetBtn.addEventListener("click", () => {
    stopRun();
    state = createInitialState(meta.epoch);
    log("good", "local ladder retained; current epoch rebooted");
    compileAndReport();
    render();
  });

  els.newGameBtn.addEventListener("click", () => {
    const confirmed = window.confirm("清除轮回记录和梯形图，从纪元 1 重新启动？");
    if (!confirmed) return;
    localStorage.removeItem(META_STORAGE_KEY);
    localStorage.removeItem(LADDER_STORAGE_KEY);
    window.location.reload();
  });

  els.drawQiBtn.addEventListener("click", () => {
    drawQi("manual");
    render();
  });

  els.breathUpgradeBtn.addEventListener("click", () => {
    upgradeBreathMethod();
    render();
  });

  els.foundationBtn.addEventListener("click", () => {
    consolidateFoundation();
    render();
  });

  els.spiritArrayBtn.addEventListener("click", () => {
    buildSpiritArray();
    render();
  });

  els.breakthroughBtn.addEventListener("click", () => {
    breakthroughRealm();
    render();
  });
}

function currentRealm() {
  return REALMS[state.cultivation.realm] ?? REALMS[0];
}

function cultivationUnlocked() {
  return Boolean(state.cameraUnlocked);
}

function worldVisible() {
  return cultivationUnlocked() || (state.stage !== "boot" && state.stage !== "remap");
}

function nextRealm() {
  return REALMS[state.cultivation.realm + 1] ?? null;
}

function realmMultiplier() {
  return 1 + state.cultivation.realm * 0.38;
}

function yinPerScan() {
  return state.cultivation.yinLevel * 0.035 * realmMultiplier();
}

function yangPerScan() {
  return (
    state.cultivation.yangLevel *
    0.028 *
    (1 + state.cultivation.foundation * 0.025) *
    realmMultiplier()
  );
}

function breathCost() {
  return Math.ceil(8 * 1.45 ** state.cultivation.yinLevel);
}

function foundationCost() {
  return Math.ceil(12 + state.cultivation.foundation * 6 + state.cultivation.realm * 18);
}

function spiritArrayCost() {
  return Math.ceil(26 * 1.62 ** state.cultivation.yangLevel + state.cultivation.realm * 24);
}

function spiritArrayFoundationRequirement() {
  return 2 + state.cultivation.yangLevel * 2;
}

function drawQi(source) {
  if (!cultivationUnlocked()) return;

  const baseGain = source === "ladder" ? 0.22 : 1;
  const amount = baseGain * (1 + state.cultivation.yinLevel * 0.18) * realmMultiplier();
  gainQi(amount);
  state.cultivation.manualDraws += source === "manual" ? 1 : 0;

  if (source === "manual") {
    log("good", `取灵 +${formatQi(amount)}；灵气=${formatQi(state.cultivation.qi)}`);
  } else if (state.tick % 10 === 0) {
    log("info", `阴阀自动取灵 +${formatQi(amount)}`);
  }

  persistCultivation();
}

function upgradeBreathMethod() {
  if (!cultivationUnlocked()) return;

  const cost = breathCost();
  if (!spendQi(cost)) return;

  state.cultivation.yinLevel += 1;
  log("good", `吐纳法校准至 ${state.cultivation.yinLevel} 阶；被动取灵增强`);
  persistCultivation();
}

function consolidateFoundation() {
  if (!cultivationUnlocked()) return;

  const cost = foundationCost();
  if (!spendQi(cost)) return;

  state.cultivation.foundation += 1;
  log("good", `固本完成；根基=${state.cultivation.foundation}`);
  persistCultivation();
}

function buildSpiritArray() {
  if (!cultivationUnlocked()) return;

  const cost = spiritArrayCost();
  const requiredFoundation = spiritArrayFoundationRequirement();
  if (state.cultivation.foundation < requiredFoundation || !spendQi(cost)) return;

  state.cultivation.yangLevel += 1;
  addCultivationAttention(5 + state.cultivation.yangLevel);
  log("warn", `生灵阵拓展至 ${state.cultivation.yangLevel} 阶；天道注视上升`);
  persistCultivation();
}

function breakthroughRealm() {
  if (!cultivationUnlocked()) return;

  const target = nextRealm();
  if (!target) return;
  if (state.cultivation.foundation < target.foundation || !spendQi(target.qi)) return;

  state.cultivation.realm += 1;
  state.cultivation.breakthroughs += 1;
  state.cultivation.attention = Math.max(0, state.cultivation.attention - 8);
  log("good", `突破：${target.name}`);
  persistCultivation();
}

function advanceCultivation() {
  if (!cultivationUnlocked()) return;

  const yin = yinPerScan();
  const yang = yangPerScan();
  const total = yin + yang;
  if (total > 0) gainQi(total);

  if (yang > 0) {
    addCultivationAttention(yang * 0.18);
  } else {
    state.cultivation.attention = Math.max(0, state.cultivation.attention - 0.012);
  }

  if (total > 0 || state.cultivation.attention > 0) persistCultivation();
}

function gainQi(amount) {
  if (amount <= 0) return;
  state.cultivation.qi += amount;
  state.cultivation.lifetimeQi += amount;
}

function spendQi(amount) {
  if (state.cultivation.qi + 0.0001 < amount) return false;
  state.cultivation.qi = Math.max(0, state.cultivation.qi - amount);
  return true;
}

function addCultivationAttention(amount) {
  state.cultivation.attention = Math.min(100, state.cultivation.attention + amount);
}

function persistCultivation() {
  meta.cultivation = cloneCultivation(state.cultivation);
  saveMeta();
}

function formatQi(value) {
  if (value >= 1000) return value.toFixed(0);
  if (value >= 100) return value.toFixed(1);
  if (value >= 10) return value.toFixed(1);
  return value.toFixed(2).replace(/\.?0+$/, "");
}

function tick() {
  if (state.halted) return;

  state.tick += 1;
  state.energy = Math.max(0, state.energy - 0.5);
  state.core = Math.max(0, state.core - 3);
  advanceLedgerHardware();

  const sensors = readSensors();
  observeSignals(sensors);
  state.pickupPulse = false;
  const activeOutputs = evaluateRungs(sensors);
  state.lastScan = {
    tick: state.tick,
    sensors: { ...sensors },
    outputs: [...activeOutputs],
  };
  advanceCultivation();
  const pulseActive = activeOutputs.includes("Q4");
  const motionOutputs = activeOutputs.filter((pin) => pin !== "Q4");
  const selected = MOTION_PRIORITY.find((pin) => motionOutputs.includes(pin));
  const actuatorInterlocked = state.stage === "boot" || state.stage === "remap";

  if (motionOutputs.length > 1) {
    log("warn", `bus contention: ${motionOutputs.map((pin) => OUTPUTS[pin]).join(", ")}`);
  }

  if (pulseActive) applyHeartPulse();

  if (selected && actuatorInterlocked) {
    if (state.stage !== "complete" && state.tick % 4 === 0) {
      log("warn", "actuator interlock: core pulse not stable");
    }
  } else if (selected) {
    applyAction(selected);
  } else if (!pulseActive && state.tick % 8 === 0) {
    log("info", "idle scan; no output energized");
  }

  if (state.core <= 0) {
    state.halted = true;
    log("bad", "core pulse lost; epoch halted");
  } else if (state.energy <= 0) {
    state.halted = true;
    log("bad", "energy bus collapsed; epoch halted");
  }

  advanceHeavenResponse();
  render();
}

function applyHeartPulse() {
  state.energy = Math.max(0, state.energy - 1);
  if (state.core > 45) {
    if (cultivationUnlocked()) {
      const amount =
        0.14 *
        (1 + state.cultivation.yangLevel * 0.42) *
        (1 + state.cultivation.foundation * 0.02) *
        realmMultiplier();
      gainQi(amount);
      addCultivationAttention(0.04 + amount * 0.08);
      persistCultivation();
      if (state.tick % 6 === 0) {
        log("warn", `阳性脉冲生灵 +${formatQi(amount)}；core=${Math.ceil(state.core)}`);
      }
    } else if (state.tick % 6 === 0) {
      log("warn", `heart pulse rejected; core=${Math.ceil(state.core)}`);
    }
    return;
  }

  state.core = Math.min(100, state.core + 34);
  state.corePulses += 1;
  discoverSignal(SIGNALS.CORE_LOW, DISCOVERY.CONFIRMED);
  log("good", `heart pulse accepted; core=${Math.ceil(state.core)}`);

  if (state.corePulses >= 2 && (state.stage === "boot" || state.stage === "remap")) {
    if (state.epoch > 0) {
      setStage("complete");
      meta.complete = true;
      saveMeta();
      log("good", "vertical slice complete: archived code survived a hostile ABI change");
    } else {
      setStage("salvage");
      log("good", "core stable; actuator interlock released");
      log("info", "one-dimensional rail unlocked; collect fragments before cultivation");
    }
  }
}

function readSensors() {
  const raw = readRawSignals();
  const pins = {};
  for (const pin of PIN_IDS) {
    pins[pin] = Boolean(raw[state.pinMap[pin]]);
  }
  for (const [pin, constant] of Object.entries(LOGIC_CONSTANTS)) {
    pins[pin] = constant.value;
  }
  return pins;
}

function readRawSignals() {
  return {
    [SIGNALS.DRIVE_STALL]: state.contact.stall || !canMoveForward(),
    [SIGNALS.FIBER_ECHO]: state.contact.fiber || fragmentAtRobot(),
    [SIGNALS.PICKUP_PULSE]: state.pickupPulse,
    [SIGNALS.ORIGIN_MARK]: atOrigin(),
    [SIGNALS.MAG_WEST]: state.robot.dir < 0,
    [SIGNALS.LEDGER_WINDOW]: ledgerWindowOpen(),
    [SIGNALS.SETTLEMENT_ACK]: state.ledger.ack,
    [SIGNALS.CORE_LOW]: state.core <= 45,
  };
}

function applyAction(coil) {
  if (coil === "Q3") {
    if (state.ledger.offering) {
      attemptLedgerWrite();
    } else if (cultivationUnlocked()) {
      drawQi("ladder");
    } else {
      log("warn", "bus write offline; no writable interface");
    }
    return;
  }

  if (coil === "Q2") {
    const fragmentIndex = state.track.fragments.indexOf(state.robot.x);
    if (fragmentIndex !== -1) {
      state.track.fragments.splice(fragmentIndex, 1);
      state.parts += 1;
      state.pickupPulse = true;
      discoverSignal(SIGNALS.FIBER_ECHO, DISCOVERY.CONFIRMED);
      discoverSignal(SIGNALS.PICKUP_PULSE, DISCOVERY.SUSPECTED);
      state.energy = Math.max(0, state.energy - 1.5);
      clearContactProbe();
      log("good", `pickup complete at rail ${state.robot.x}; fragments=${state.parts}/3`);
      if (state.parts >= 3 && !cultivationUnlocked()) unlockCultivationInterface();
    } else {
      log("warn", "pickup returned 0; no fragment here");
    }
    return;
  }

  if (coil === "Q1") {
    state.robot.dir *= -1;
    if (state.robot.dir < 0) {
      discoverSignal(SIGNALS.MAG_WEST, DISCOVERY.SUSPECTED);
    }
    clearContactProbe();
    log("info", `reverse rail direction; magnetometer=${state.robot.dir < 0 ? "W" : "E"}`);
    return;
  }

  if (coil === "Q0") {
    if (canMoveForward()) {
      state.robot.x += state.robot.dir;
      if (state.robot.dir < 0) {
        discoverSignal(SIGNALS.MAG_WEST, DISCOVERY.CONFIRMED);
      }
      if (atOrigin()) discoverSignal(SIGNALS.ORIGIN_MARK, DISCOVERY.CONFIRMED);
      if (fragmentAtRobot()) {
        state.contact.fiber = true;
        discoverSignal(SIGNALS.FIBER_ECHO, DISCOVERY.SUSPECTED);
      }
      clearContactProbe();
      log("info", `rail step; pos=${state.robot.x}`);
    } else {
      state.contact.stall = true;
      recordSignalEvidence(SIGNALS.DRIVE_STALL);
      state.energy = Math.max(0, state.energy - 1.5);
      log("warn", `rail boundary; pos=${state.robot.x}`);
    }
  }
}

function clearContactProbe() {
  state.contact.stall = false;
  state.contact.fiber = false;
}

function unlockCultivationInterface() {
  state.cameraUnlocked = true;
  state.energy = Math.min(100, state.energy + 28);
  setStage("cultivation");
  log("good", "aura interface restored: cultivation furnace online");
  log("info", "survival loop closed; begin low-level extraction and foundation work");
}

function ledgerPhaseIndex() {
  if (!state.cameraUnlocked) return -1;
  const relative = state.tick - state.ledger.windowOrigin;
  return ((relative % 6) + 6) % 6;
}

function ledgerWindowOpen() {
  if (!state.cameraUnlocked || !state.ledger.offering) return false;
  const phase = ledgerPhaseIndex();
  return phase === 0 || phase === 1;
}

function attemptLedgerWrite() {
  if (!state.ledger.offering) {
    log("warn", "ledger write rejected; physical sample absent");
    return;
  }
  if (!ledgerWindowOpen()) {
    log("warn", `ledger write missed; phase=${ledgerPhaseName()}`);
    return;
  }

  discoverSignal(SIGNALS.LEDGER_WINDOW, DISCOVERY.CONFIRMED);
  if (state.ledger.ack) {
    discoverSignal(SIGNALS.SETTLEMENT_ACK, DISCOVERY.CONFIRMED);
  }

  state.aura += 1;
  gainQi(3 * realmMultiplier());
  persistCultivation();
  state.ledger.creditsForOffering += 1;
  if (!state.ledger.ack) {
    state.ledger.ack = true;
    state.ledger.consumeAt = state.tick + 2;
    log("good", "ledger credit +1; physical latch pending for 2 scans");
    return;
  }

  if (!state.ledger.duplicateDetected) {
    state.ledger.duplicateDetected = true;
    state.heavenAttention = 100;
    state.calamityCountdown = 8;
    setStage("alert");
    log("bad", "invariant breach: one physical sample credited twice");
    log("warn", "heaven observer attached; patch signature compiling");
  }
}

function advanceLedgerHardware() {
  const ledger = state.ledger;
  if (ledger.consumeAt !== null && state.tick >= ledger.consumeAt) {
    ledger.offering = false;
    ledger.ack = false;
    ledger.consumeAt = null;
    ledger.creditsForOffering = 0;
    if (!ledger.duplicateDetected) ledger.respawnAt = state.tick + 4;
    log("info", "physical latch closed; sample consumed");
  }

  if (
    state.stage === "ledger" &&
    !ledger.offering &&
    ledger.respawnAt !== null &&
    state.tick >= ledger.respawnAt
  ) {
    ledger.offering = true;
    ledger.respawnAt = null;
    log("info", "condenser produced one replacement sample");
  }
}

function advanceHeavenResponse() {
  if (state.stage !== "alert" || state.calamityCountdown === null) return;

  state.calamityCountdown -= 1;
  state.heavenAttention = Math.max(0, state.calamityCountdown * 12.5);
  if (state.calamityCountdown > 0) {
    if (state.calamityCountdown <= 3) {
      log("bad", `heaven patch commit in ${state.calamityCountdown} scan(s)`);
    }
    return;
  }

  reincarnate();
}

function reincarnate() {
  meta.epoch += 1;
  meta.patchLevel = Math.max(meta.patchLevel, 1);
  saveMeta();

  const nextSerial = state.eventSerial + 1;
  state = createInitialState(meta.epoch);
  state.eventSerial = nextSerial;
  showEpochOverlay();
}

function setStage(stage) {
  if (state.stage === stage) return;
  state.stage = stage;
  state.eventSerial += 1;
}

function render() {
  const sensors = state.lastScan?.sensors ?? readSensors();
  const activeOutputs = state.lastScan?.outputs ?? evaluateRungs(sensors);
  renderSensors(sensors, activeOutputs);
  renderEditor(sensors);
  renderLog();
  renderCanvas();
  renderMetrics();
  renderLedger();
  renderCultivation();
}

function renderSensors(sensors, outputs) {
  for (const pin of PIN_IDS) {
    const node = els.sensorBank.querySelector(`[data-pin="${pin}"]`);
    const level = discoveryLevel(pin);
    node.classList.toggle("hot", Boolean(sensors[pin]));
    node.classList.toggle("suspected", level === DISCOVERY.SUSPECTED);
    node.classList.toggle("identified", level === DISCOVERY.CONFIRMED);
    const label = node.querySelector("em");
    label.textContent = inputSignalLabel(pin);
    label.title = label.textContent;
    node.querySelector("strong").textContent = sensors[pin] ? "1" : "0";
  }

  const activeOutputs = new Set(outputs);
  for (const pin of Object.keys(OUTPUTS)) {
    const node = els.outputBank.querySelector(`[data-pin="${pin}"]`);
    const active = activeOutputs.has(pin);
    node.classList.toggle("hot", active);
    node.querySelector("strong").textContent = active ? "1" : "0";
  }

  els.ioScanReadout.textContent = state.lastScan
    ? `SCAN t+${String(state.lastScan.tick).padStart(4, "0")}`
    : "PRE-SCAN";
}

function renderLog() {
  els.logWindow.innerHTML = "";
  const lines = state.logs.slice(-120);
  for (const entry of lines) {
    const row = document.createElement("div");
    row.className = `log-line ${entry.type}`;

    const time = row.appendChild(document.createElement("time"));
    time.textContent = `t+${String(entry.tick).padStart(4, "0")}`;

    const message = row.appendChild(document.createElement("span"));
    message.textContent = entry.text;

    els.logWindow.appendChild(row);
  }
  scrollLogToBottom();
}

function scrollLogToBottom() {
  if (logScrollFrame !== null) window.cancelAnimationFrame(logScrollFrame);
  logScrollFrame = window.requestAnimationFrame(() => {
    els.logWindow.scrollTop = els.logWindow.scrollHeight;
    logScrollFrame = null;
  });
}

function renderCanvas() {
  const width = els.worldCanvas.width;
  const height = els.worldCanvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#020303";
  ctx.fillRect(0, 0, width, height);

  const cols = state.track.length;
  const tile = Math.floor(Math.min(width / (cols + 1.6), height / 3.2));
  const ox = Math.floor((width - cols * tile) / 2);
  const y = Math.floor(height / 2 - tile / 2);

  if (!worldVisible()) drawNoise(width, height);

  for (let index = 0; index < cols; index += 1) {
    drawTrackCell(index, ox + index * tile, y, tile);
  }

  if (state.ledger.offering) drawLedgerField(ox, y, tile);
  drawRobot(ox + state.robot.x * tile, y, tile);

  els.blindOverlay.classList.toggle("hidden", worldVisible());
  els.cameraChip.textContent = cultivationUnlocked() ? "AURA BUS" : worldVisible() ? "RAIL BUS" : "NO SENSOR";
}

function drawNoise(width, height) {
  for (let i = 0; i < 180; i += 1) {
    const shade = Math.floor(20 + Math.random() * 38);
    ctx.fillStyle = `rgb(${shade},${shade + 7},${shade + 3})`;
    ctx.fillRect(Math.random() * width, Math.random() * height, 2, 2);
  }
}

function drawTrackCell(index, x, y, tile) {
  const isStart = index === state.track.start;
  const hasFragment = state.track.fragments.includes(index);
  ctx.fillStyle = isStart ? "#243d47" : "#101614";
  ctx.fillRect(x, y, tile, tile);
  ctx.strokeStyle = "rgba(232,255,241,0.08)";
  ctx.strokeRect(x + 0.5, y + 0.5, tile - 1, tile - 1);

  ctx.strokeStyle = "rgba(114,228,154,0.18)";
  ctx.beginPath();
  ctx.moveTo(x + tile * 0.08, y + tile * 0.5);
  ctx.lineTo(x + tile * 0.92, y + tile * 0.5);
  ctx.stroke();

  if (hasFragment) {
    ctx.fillStyle = "#90f7a8";
    ctx.fillRect(x + tile * 0.36, y + tile * 0.35, tile * 0.28, tile * 0.3);
  }

  if (isStart) {
    ctx.fillStyle = "#ffc857";
    ctx.fillRect(x + tile * 0.38, y + tile * 0.24, tile * 0.24, tile * 0.52);
  }
}

function drawLedgerField(ox, oy, tile) {
  const x = ox + state.track.start * tile + tile / 2;
  const y = oy + tile / 2;
  const open = ledgerWindowOpen();
  ctx.strokeStyle = open ? "#b59cff" : "rgba(181,156,255,0.38)";
  ctx.lineWidth = open ? 3 : 1;
  ctx.beginPath();
  ctx.arc(x, y, tile * (open ? 0.44 : 0.36), 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1;
}

function drawRobot(x, y, tile) {
  const pad = tile * 0.18;
  ctx.fillStyle = worldVisible() ? "#74d8ff" : "rgba(116,216,255,0.18)";
  ctx.fillRect(x + pad, y + pad, tile - pad * 2, tile - pad * 2);

  const centerX = x + tile / 2;
  const centerY = y + tile / 2;
  ctx.fillStyle = "#f3fff7";
  ctx.beginPath();
  ctx.moveTo(centerX + state.robot.dir * tile * 0.32, centerY);
  ctx.lineTo(centerX - state.robot.dir * tile * 0.18, centerY - tile * 0.18);
  ctx.lineTo(centerX - state.robot.dir * tile * 0.18, centerY + tile * 0.18);
  ctx.closePath();
  ctx.fill();
}

function renderMetrics() {
  els.tickReadout.textContent = String(state.tick);
  els.energyReadout.textContent = String(Math.ceil(state.energy));
  els.coreReadout.textContent = String(Math.ceil(state.core));
  els.fiberReadout.textContent = `${state.parts}/3`;
  els.auraReadout.textContent = formatQi(state.cultivation.qi);
  els.foundationReadout.textContent = String(state.cultivation.foundation);
  els.realmReadout.textContent = currentRealm().name;
  els.epochLabel.textContent = `EPOCH 0x${String(state.epoch + 1).padStart(4, "0")}`;
  els.epochState.textContent = stageLabel();
  els.objectiveText.textContent = objectiveText();
  document.body.classList.toggle("heaven-alert", state.stage === "alert");
  document.body.classList.toggle("cultivation-unlocked", cultivationUnlocked());
}

function renderLedger() {
  const ledgerVisible =
    state.stage === "ledger" || state.stage === "alert" || state.ledger.duplicateDetected;
  els.ledgerPanel.hidden = !ledgerVisible;
  if (!ledgerVisible) return;

  els.ledgerSample.textContent = state.ledger.offering ? "PRESENT" : "EMPTY";
  els.ledgerAck.textContent = state.ledger.ack ? "1" : "0";
  els.ledgerPhase.textContent = ledgerPhaseName();
  els.heavenAttention.textContent =
    state.stage === "alert" ? `${Math.ceil(state.heavenAttention)}%` : "0%";
}

function renderCultivation() {
  if (!cultivationUnlocked()) return;

  const cultivation = state.cultivation;
  const target = nextRealm();
  const breath = breathCost();
  const foundation = foundationCost();
  const arrayCost = spiritArrayCost();
  const arrayRoot = spiritArrayFoundationRequirement();
  const canBreakthrough =
    Boolean(target) && cultivation.qi >= target.qi && cultivation.foundation >= target.foundation;

  els.realmChip.textContent = currentRealm().name;
  els.cultQi.textContent = formatQi(cultivation.qi);
  els.cultFoundation.textContent = String(cultivation.foundation);
  els.cultYin.textContent = `${formatQi(yinPerScan())}/扫`;
  els.cultYang.textContent = `${formatQi(yangPerScan())}/扫`;
  els.cultAttention.textContent = `${Math.ceil(cultivation.attention)}%`;
  els.cultNext.textContent = target
    ? `${target.name} ${formatQi(target.qi)}灵气/${target.foundation}根基`
    : "未知上境";

  els.drawQiBtn.textContent = `取灵 +${formatQi(
    1 * (1 + cultivation.yinLevel * 0.18) * realmMultiplier(),
  )}`;
  els.breathUpgradeBtn.textContent = `吐纳 ${breath}灵气`;
  els.foundationBtn.textContent = `固本 ${foundation}灵气`;
  els.spiritArrayBtn.textContent = `生灵阵 ${arrayCost}灵气/${arrayRoot}根基`;
  els.breakthroughBtn.textContent = target ? `突破 ${target.name}` : "等待上境";

  els.breathUpgradeBtn.disabled = cultivation.qi < breath;
  els.foundationBtn.disabled = cultivation.qi < foundation;
  els.spiritArrayBtn.disabled = cultivation.qi < arrayCost || cultivation.foundation < arrayRoot;
  els.breakthroughBtn.disabled = !canBreakthrough;

  if (!target) {
    els.cultivationHint.textContent = "已抵达当前版本可见的最高境界。";
  } else if (canBreakthrough) {
    els.cultivationHint.textContent = "灵气与根基已经压到临界，可以尝试突破。";
  } else if (cultivation.yangLevel > 0) {
    els.cultivationHint.textContent = "生灵阵正在输出新增灵气，天道注视也在缓慢聚集。";
  } else if (cultivation.yinLevel > 0) {
    els.cultivationHint.textContent = "吐纳法形成了第一条稳定的阴性取灵循环。";
  } else {
    els.cultivationHint.textContent = "残缺机体正在以原始信号校准第一缕灵气。";
  }
}

function stageLabel() {
  const labels = {
    boot: "S00 核心自检",
    salvage: "S01 一维轨道",
    cultivation: "S02 修行炉在线",
    ledger: "S03 天道结算",
    alert: "天道正在修补",
    remap: "S03 I/O 已重映射",
    complete: "垂直切片完成",
  };
  if (state.halted) return "纪元中断";
  return labels[state.stage] || state.stage;
}

function objectiveText() {
  if (state.halted) return "核心或能源已经归零。保留梯形图并重启当前纪元。";
  const objectives = {
    boot: "先活下来：观察核心低压输入，并用梯形图维持 Q4 核心脉冲。",
    salvage: "沿一维轨道移动，拾取 3 枚结构碎片。没有障碍物，只有边界。",
    cultivation: "修行炉已上线。现在可以开始取灵、固本，并让梯形图辅助自动化。",
    ledger: "一份样本只应结算一次。观察账本窗口与物理闩锁之间的两个扫描周期。",
    alert: `漏洞签名已暴露。天道将在 ${state.calamityCountdown ?? 0} 个扫描周期后重写 I/O。`,
    remap: "旧梯形图仍在，但通道映射已经改变。重新辨认核心低压输入。",
    complete: "代码、测试思路和故障知识穿过了轮回。第一条系统路径已经闭合。",
  };
  return objectives[state.stage] || "等待新的系统目标。";
}

function ledgerPhaseName() {
  const names = ["CREDIT-A", "CREDIT-B", "LATCH", "COOLDOWN", "COOLDOWN", "ARM"];
  const phase = ledgerPhaseIndex();
  return phase < 0 ? "OFFLINE" : names[phase];
}

function showEpochOverlay() {
  if (!els.epochOverlay) return;
  els.epochOverlay.classList.add("visible");
  if (overlayTimer) window.clearTimeout(overlayTimer);
  overlayTimer = window.setTimeout(() => {
    els.epochOverlay.classList.remove("visible");
  }, 2200);
}

function canMoveForward() {
  const next = state.robot.x + state.robot.dir;
  return next >= 0 && next < state.track.length;
}

function fragmentAtRobot() {
  return state.track.fragments.includes(state.robot.x);
}

function atOrigin() {
  return state.robot.x === state.track.start;
}

function log(type, text) {
  const last = state.logs[state.logs.length - 1];
  if (last && last.tick === state.tick && last.text === text) return;
  state.logs.push({ type, tick: state.tick, text });
}

function stopRun() {
  if (runTimer) {
    window.clearInterval(runTimer);
    runTimer = null;
  }
  els.runBtn.textContent = "运行 ×30";
}
