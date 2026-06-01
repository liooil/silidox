const PINS = [
  ["I0", "FRONT_BLOCKED"],
  ["I1", "FRONT_TREE"],
  ["I2", "CARGO_FULL"],
  ["I3", "AT_HOME"],
  ["I4", "HOME_VECTOR_AHEAD"],
  ["I5", "LAST_COLLISION"],
  ["I6", "HEAVEN_JITTER"],
  ["I7", "FRONT_EMPTY"],
];

const OUTPUTS = {
  Q0: "MOVE",
  Q1: "TURN_RIGHT",
  Q2: "CHOP",
  Q3: "DEPOSIT",
  Q4: "WAIT",
};

const ACTION_PRIORITY = ["Q3", "Q2", "Q1", "Q0", "Q4"];

const DEFAULT_PROGRAM = `; Silidox / startup_sequence.lad
; contacts: XIC=true, XIO=false, coil: OTE

XIC I2 XIC I3 OTE Q3      ; cargo at home -> deposit
XIC I1 XIO I2 OTE Q2      ; tree ahead and empty -> chop
XIC I2 XIO I3 XIC I4 OTE Q0
XIC I2 XIO I4 OTE Q1      ; rotate until home vector is ahead
XIO I0 XIO I1 XIO I2 OTE Q0
XIC I0 XIO I2 OTE Q1`;

const WORLD_TEMPLATE = [
  "###########",
  "#..T..#...#",
  "##........#",
  "#H....T.TT#",
  "##........#",
  "#..#..T...#",
  "###########",
];

const DIRS = [
  { name: "N", dx: 0, dy: -1 },
  { name: "E", dx: 1, dy: 0 },
  { name: "S", dx: 0, dy: 1 },
  { name: "W", dx: -1, dy: 0 },
];

const els = {
  editor: document.querySelector("#programEditor"),
  compileBtn: document.querySelector("#compileBtn"),
  stepBtn: document.querySelector("#stepBtn"),
  runBtn: document.querySelector("#runBtn"),
  resetBtn: document.querySelector("#resetBtn"),
  logWindow: document.querySelector("#logWindow"),
  sensorBank: document.querySelector("#sensorBank"),
  worldCanvas: document.querySelector("#worldCanvas"),
  blindOverlay: document.querySelector("#blindOverlay"),
  cameraChip: document.querySelector("#cameraChip"),
  tickReadout: document.querySelector("#tickReadout"),
  energyReadout: document.querySelector("#energyReadout"),
  driftReadout: document.querySelector("#driftReadout"),
  woodCount: document.querySelector("#woodCount"),
  epochState: document.querySelector("#epochState"),
  objectiveText: document.querySelector("#objectiveText"),
};

const ctx = els.worldCanvas.getContext("2d");

let state = createInitialState();
let compiled = { ok: false, rungs: [], diagnostics: [] };
let runTimer = null;
let logScrollFrame = null;

els.editor.value = localStorage.getItem("silidox.program") || DEFAULT_PROGRAM;

for (const [pin, name] of PINS) {
  const node = document.createElement("div");
  node.className = "sensor";
  node.dataset.pin = pin;
  node.innerHTML = `<span>${pin} ${name}</span><strong>0</strong>`;
  els.sensorBank.appendChild(node);
}

els.editor.addEventListener("input", () => {
  localStorage.setItem("silidox.program", els.editor.value);
});

els.compileBtn.addEventListener("click", () => {
  compileAndReport();
  render();
});

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
  const cameraAtRunStart = state.cameraUnlocked;
  els.runBtn.textContent = "■ 停止";
  runTimer = window.setInterval(() => {
    if (remaining <= 0 || state.halted) {
      stopRun();
      return;
    }
    tick();
    if (!cameraAtRunStart && state.cameraUnlocked) {
      stopRun();
      return;
    }
    remaining -= 1;
  }, 130);
});

els.resetBtn.addEventListener("click", () => {
  stopRun();
  state = createInitialState();
  log("good", "local code shard retained; epoch rebooted");
  compileAndReport();
  render();
});

compileAndReport();
render();

function createInitialState() {
  const grid = WORLD_TEMPLATE.map((row) => row.split(""));
  let home = { x: 1, y: 3 };

  for (let y = 0; y < grid.length; y += 1) {
    for (let x = 0; x < grid[y].length; x += 1) {
      if (grid[y][x] === "H") home = { x, y };
    }
  }

  return {
    grid,
    home,
    robot: { x: home.x, y: home.y, dir: 1, cargo: 0 },
    tick: 0,
    energy: 100,
    wood: 0,
    lastCollision: false,
    cameraUnlocked: false,
    halted: false,
    logs: [
      { type: "good", tick: 0, text: "boot: no spiritual root detected" },
      { type: "warn", tick: 0, text: "manual pages missing; ladder runtime online" },
      { type: "info", tick: 0, text: "objective: recover 3 wood before float drift breaks epoch" },
    ],
  };
}

function compileAndReport() {
  compiled = compileProgram(els.editor.value);
  if (compiled.ok) {
    log("good", `compiled ${compiled.rungs.length} rung(s)`);
    return true;
  }

  for (const diagnostic of compiled.diagnostics) {
    log("bad", diagnostic);
  }
  render();
  return false;
}

function compileProgram(source) {
  const rungs = [];
  const diagnostics = [];
  const lines = source.split(/\r?\n/);

  lines.forEach((raw, index) => {
    const cleaned = raw.replace(/[;#].*$/, "").trim();
    if (!cleaned) return;

    const tokens = cleaned.toUpperCase().split(/\s+/);
    const lineNo = index + 1;

    if (tokens.length < 3 || tokens[tokens.length - 2] !== "OTE") {
      diagnostics.push(`line ${lineNo}: expected "... OTE Qn"`);
      return;
    }

    const coil = tokens[tokens.length - 1];
    if (!OUTPUTS[coil]) {
      diagnostics.push(`line ${lineNo}: unknown coil ${coil}`);
      return;
    }

    const contactTokens = tokens.slice(0, -2);
    if (contactTokens.length % 2 !== 0) {
      diagnostics.push(`line ${lineNo}: contact missing pin`);
      return;
    }

    const contacts = [];
    for (let i = 0; i < contactTokens.length; i += 2) {
      const op = contactTokens[i];
      const pin = contactTokens[i + 1];
      if (op !== "XIC" && op !== "XIO") {
        diagnostics.push(`line ${lineNo}: unknown contact ${op}`);
        continue;
      }
      if (!PINS.some(([knownPin]) => knownPin === pin)) {
        diagnostics.push(`line ${lineNo}: unknown input ${pin}`);
        continue;
      }
      contacts.push({ op, pin });
    }

    rungs.push({ lineNo, contacts, coil, raw: cleaned });
  });

  if (rungs.length === 0) diagnostics.push("no energized logic found");
  return { ok: diagnostics.length === 0, rungs, diagnostics };
}

function tick() {
  if (state.halted) return;

  state.tick += 1;
  state.energy = Math.max(0, state.energy - 1);

  const sensors = readSensors();
  const activeOutputs = evaluateRungs(sensors);
  const selected = ACTION_PRIORITY.find((pin) => activeOutputs.includes(pin));

  if (activeOutputs.length > 1) {
    log("warn", `coil contention: ${activeOutputs.map((pin) => OUTPUTS[pin]).join(", ")}`);
  }

  applyAction(selected || "Q4");

  if (state.energy <= 0) {
    state.halted = true;
    log("bad", "energy bus collapsed; epoch halted");
  }

  if (driftValue() > 3.4e-13) {
    state.halted = true;
    log("bad", "float calamity: heaven tolerance exceeded");
  }

  if (state.wood >= 3 && !state.cameraUnlocked) {
    state.cameraUnlocked = true;
    state.energy = Math.min(100, state.energy + 24);
    log("good", "workaround forged: low-res photo sensor mounted");
    log("info", "perception bus now leaks grayscale world data");
  }

  render();
}

function readSensors() {
  const front = frontCell();
  const cell = tileAt(front.x, front.y);
  const blocked = cell === "#";
  const tree = cell === "T";
  const cargoFull = state.robot.cargo >= 1;
  const atHome = state.robot.x === state.home.x && state.robot.y === state.home.y;
  const dir = DIRS[state.robot.dir];
  const currentDistance = manhattan(state.robot, state.home);
  const nextDistance = manhattan(
    { x: state.robot.x + dir.dx, y: state.robot.y + dir.dy },
    state.home,
  );
  const homeVectorAhead = atHome || nextDistance < currentDistance;

  return {
    I0: blocked,
    I1: tree,
    I2: cargoFull,
    I3: atHome,
    I4: homeVectorAhead,
    I5: state.lastCollision,
    I6: state.tick % 8 === 0,
    I7: cell === "." || cell === "H",
  };
}

function evaluateRungs(sensors) {
  const active = [];
  for (const rung of compiled.rungs) {
    const energized = rung.contacts.every((contact) => {
      const value = Boolean(sensors[contact.pin]);
      return contact.op === "XIC" ? value : !value;
    });
    if (energized && !active.includes(rung.coil)) active.push(rung.coil);
  }
  return active;
}

function applyAction(coil) {
  state.lastCollision = false;

  if (coil === "Q3") {
    if (state.robot.cargo > 0 && atHome()) {
      state.robot.cargo = 0;
      state.wood += 1;
      log("good", `deposited wood; stockpile=${state.wood}`);
    } else {
      log("warn", "deposit failed: cargo/home precondition false");
    }
    return;
  }

  if (coil === "Q2") {
    const front = frontCell();
    if (tileAt(front.x, front.y) === "T" && state.robot.cargo < 1) {
      state.grid[front.y][front.x] = ".";
      state.robot.cargo = 1;
      state.energy = Math.max(0, state.energy - 2);
      log("good", `chopped tree at ${front.x},${front.y}; cargo=1`);
    } else {
      log("warn", "chop returned 0; no tree or cargo full");
    }
    return;
  }

  if (coil === "Q1") {
    state.robot.dir = (state.robot.dir + 1) % DIRS.length;
    log("info", `turn right; facing=${DIRS[state.robot.dir].name}`);
    return;
  }

  if (coil === "Q0") {
    const front = frontCell();
    const cell = tileAt(front.x, front.y);
    if (cell === "." || cell === "H") {
      state.robot.x = front.x;
      state.robot.y = front.y;
      log("info", `move ok; pos=${state.robot.x},${state.robot.y}`);
    } else {
      state.lastCollision = true;
      state.energy = Math.max(0, state.energy - 2);
      log("bad", `collision=${cell || "void"}; pos unchanged`);
    }
    return;
  }

  log("info", "wait; no coil selected");
}

function render() {
  const sensors = readSensors();
  renderSensors(sensors);
  renderLog();
  renderCanvas();
  renderMetrics();
}

function renderSensors(sensors) {
  for (const [pin] of PINS) {
    const node = els.sensorBank.querySelector(`[data-pin="${pin}"]`);
    node.classList.toggle("hot", Boolean(sensors[pin]));
    node.querySelector("strong").textContent = sensors[pin] ? "1" : "0";
  }
}

function renderLog() {
  els.logWindow.innerHTML = "";
  const lines = state.logs.slice(-120);
  for (const entry of lines) {
    const row = document.createElement("div");
    row.className = `log-line ${entry.type}`;
    row.innerHTML = `<time>t+${String(entry.tick).padStart(4, "0")}</time><span>${entry.text}</span>`;
    els.logWindow.appendChild(row);
  }
  scrollLogToBottom();
}

function scrollLogToBottom() {
  if (logScrollFrame !== null) {
    window.cancelAnimationFrame(logScrollFrame);
  }

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

  const cols = state.grid[0].length;
  const rows = state.grid.length;
  const tile = Math.floor(Math.min(width / cols, height / rows));
  const ox = Math.floor((width - cols * tile) / 2);
  const oy = Math.floor((height - rows * tile) / 2);

  if (!state.cameraUnlocked) {
    drawNoise(width, height);
  }

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const tileType = state.grid[y][x];
      drawTile(tileType, ox + x * tile, oy + y * tile, tile, state.cameraUnlocked);
    }
  }

  drawRobot(ox + state.robot.x * tile, oy + state.robot.y * tile, tile);

  els.blindOverlay.classList.toggle("hidden", state.cameraUnlocked);
  els.cameraChip.textContent = state.cameraUnlocked ? "GRAY SENSOR" : "NO SENSOR";
}

function drawNoise(width, height) {
  for (let i = 0; i < 220; i += 1) {
    const shade = Math.floor(20 + Math.random() * 38);
    ctx.fillStyle = `rgb(${shade},${shade + 7},${shade + 3})`;
    ctx.fillRect(Math.random() * width, Math.random() * height, 2, 2);
  }
}

function drawTile(tileType, x, y, tile, visible) {
  if (!visible) {
    ctx.strokeStyle = "rgba(120,242,156,0.045)";
    ctx.strokeRect(x + 0.5, y + 0.5, tile - 1, tile - 1);
    return;
  }

  const colors = {
    "#": "#333b38",
    ".": "#101614",
    H: "#7e642a",
    T: "#2d6a3d",
  };
  ctx.fillStyle = colors[tileType] || colors["."];
  ctx.fillRect(x, y, tile, tile);
  ctx.strokeStyle = "rgba(232,255,241,0.08)";
  ctx.strokeRect(x + 0.5, y + 0.5, tile - 1, tile - 1);

  if (tileType === "T") {
    ctx.fillStyle = "#90f7a8";
    ctx.fillRect(x + tile * 0.36, y + tile * 0.2, tile * 0.28, tile * 0.6);
  }
  if (tileType === "H") {
    ctx.fillStyle = "#ffc857";
    ctx.fillRect(x + tile * 0.24, y + tile * 0.24, tile * 0.52, tile * 0.52);
  }
}

function drawRobot(x, y, tile) {
  const pad = tile * 0.18;
  ctx.fillStyle = state.cameraUnlocked ? "#74d8ff" : "rgba(116,216,255,0.18)";
  ctx.fillRect(x + pad, y + pad, tile - pad * 2, tile - pad * 2);

  const centerX = x + tile / 2;
  const centerY = y + tile / 2;
  const dir = DIRS[state.robot.dir];
  ctx.fillStyle = "#f3fff7";
  ctx.beginPath();
  ctx.moveTo(centerX + dir.dx * tile * 0.32, centerY + dir.dy * tile * 0.32);
  ctx.lineTo(centerX + dir.dy * tile * 0.18, centerY - dir.dx * tile * 0.18);
  ctx.lineTo(centerX - dir.dy * tile * 0.18, centerY + dir.dx * tile * 0.18);
  ctx.closePath();
  ctx.fill();
}

function renderMetrics() {
  els.tickReadout.textContent = String(state.tick);
  els.energyReadout.textContent = String(state.energy);
  els.driftReadout.textContent = driftValue().toExponential(1);
  els.woodCount.textContent = `木材 ${state.wood} / 3`;

  if (state.halted) {
    els.epochState.textContent = "纪元中断";
  } else if (state.cameraUnlocked) {
    els.epochState.textContent = "感知已越权";
  } else {
    els.epochState.textContent = "纪元稳定";
  }

  els.objectiveText.textContent = state.cameraUnlocked
    ? "低像素监控已接入。下一层 Workaround：解析灵气摄像头。"
    : "盲态伐木，回收 3 份木材，拼出第一只光电传感器。";
}

function frontCell() {
  const dir = DIRS[state.robot.dir];
  return {
    x: state.robot.x + dir.dx,
    y: state.robot.y + dir.dy,
  };
}

function tileAt(x, y) {
  if (!state.grid[y] || state.grid[y][x] === undefined) return "#";
  return state.grid[y][x];
}

function atHome() {
  return state.robot.x === state.home.x && state.robot.y === state.home.y;
}

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function driftValue() {
  const t = state.tick * 0.1;
  return Math.abs((t + 0.2) - t - 0.2) * Math.max(1, state.tick ** 1.25);
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
  els.runBtn.textContent = "▶ 30";
}
