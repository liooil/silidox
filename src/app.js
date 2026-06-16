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
const LADDER_STORAGE_KEY = "silidox.ladder.v1";
const LEGACY_PROGRAM_KEY = "silidox.program";

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

const LAD_DIMENSIONS = {
  leftRail: 8,
  rightRailInset: 8,
  contactStartX: 58,
  contactPitch: 92,
  contactConnector: 10,
  coilRightInset: 66,
  coilConnector: 14,
};

const els = {
  compileBtn: document.querySelector("#compileBtn"),
  stepBtn: document.querySelector("#stepBtn"),
  runBtn: document.querySelector("#runBtn"),
  resetBtn: document.querySelector("#resetBtn"),
  addRungBtn: document.querySelector("#addRungBtn"),
  addOpenContactBtn: document.querySelector("#addOpenContactBtn"),
  addClosedContactBtn: document.querySelector("#addClosedContactBtn"),
  addCoilBtn: document.querySelector("#addCoilBtn"),
  deleteNodeBtn: document.querySelector("#deleteNodeBtn"),
  moveLeftBtn: document.querySelector("#moveLeftBtn"),
  moveRightBtn: document.querySelector("#moveRightBtn"),
  contactOpSelect: document.querySelector("#contactOpSelect"),
  pinSelect: document.querySelector("#pinSelect"),
  coilSelect: document.querySelector("#coilSelect"),
  pinPicker: document.querySelector("#pinPicker"),
  rungList: document.querySelector("#rungList"),
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

let nextRungId = 1;
let state = createInitialState();
let ladder = loadLadder();
syncNextRungId(ladder);
let selectedNode = firstSelectable(ladder);
let compiled = compileLadder(ladder);
let runTimer = null;
let logScrollFrame = null;
let activeDraggedTool = "";
let activeDraggedContact = null;

populateInspectorOptions();
renderSensorBank();
wireEditorEvents();
wireRunEvents();

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

function createDefaultLadder() {
  return [
    createRung(
      [
        { op: "XIC", pin: "I2" },
        { op: "XIC", pin: "I3" },
      ],
      "Q3",
    ),
    createRung(
      [
        { op: "XIC", pin: "I1" },
        { op: "XIO", pin: "I2" },
      ],
      "Q2",
    ),
    createRung(
      [
        { op: "XIC", pin: "I2" },
        { op: "XIO", pin: "I3" },
        { op: "XIC", pin: "I4" },
      ],
      "Q0",
    ),
    createRung(
      [
        { op: "XIC", pin: "I2" },
        { op: "XIO", pin: "I4" },
      ],
      "Q1",
    ),
    createRung(
      [
        { op: "XIO", pin: "I0" },
        { op: "XIO", pin: "I1" },
        { op: "XIO", pin: "I2" },
      ],
      "Q0",
    ),
    createRung(
      [
        { op: "XIC", pin: "I0" },
        { op: "XIO", pin: "I2" },
      ],
      "Q1",
    ),
  ];
}

function createRung(contacts = [{ op: "XIC", pin: "I0" }], coil = "Q4", id = allocateRungId()) {
  return {
    id,
    contacts: contacts.map((contact) => ({
      op: contact.op === "XIO" ? "XIO" : "XIC",
      pin: isKnownPin(contact.pin) ? contact.pin : "I0",
    })),
    coil: OUTPUTS[coil] ? coil : "Q4",
  };
}

function allocateRungId() {
  const id = `rung-${nextRungId}`;
  nextRungId += 1;
  return id;
}

function syncNextRungId(program) {
  const highest = program.reduce((max, rung) => {
    const match = /^rung-(\d+)$/.exec(rung.id || "");
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  nextRungId = Math.max(nextRungId, highest + 1);
}

function loadLadder() {
  const stored = localStorage.getItem(LADDER_STORAGE_KEY);
  if (stored) {
    try {
      return normalizeLadder(JSON.parse(stored));
    } catch {
      localStorage.removeItem(LADDER_STORAGE_KEY);
    }
  }

  const legacy = localStorage.getItem(LEGACY_PROGRAM_KEY);
  if (legacy) {
    const parsed = parseLegacyProgram(legacy);
    if (parsed.length > 0) return normalizeLadder(parsed);
  }

  return createDefaultLadder();
}

function normalizeLadder(value) {
  if (!Array.isArray(value)) return createDefaultLadder();
  const normalized = value
    .map((rung) => createRung(rung.contacts, rung.coil, rung.id || allocateRungId()))
    .filter((rung) => rung.contacts.length > 0);
  return normalized.length > 0 ? normalized : createDefaultLadder();
}

function parseLegacyProgram(source) {
  const rungs = [];
  for (const raw of source.split(/\r?\n/)) {
    const cleaned = raw.replace(/[;#].*$/, "").trim();
    if (!cleaned) continue;

    const tokens = cleaned.toUpperCase().split(/\s+/);
    if (tokens.length < 3 || tokens[tokens.length - 2] !== "OTE") continue;

    const coil = tokens[tokens.length - 1];
    if (!OUTPUTS[coil]) continue;

    const contactTokens = tokens.slice(0, -2);
    if (contactTokens.length % 2 !== 0) continue;

    const contacts = [];
    for (let i = 0; i < contactTokens.length; i += 2) {
      const op = contactTokens[i];
      const pin = contactTokens[i + 1];
      if ((op === "XIC" || op === "XIO") && isKnownPin(pin)) {
        contacts.push({ op, pin });
      }
    }

    if (contacts.length > 0) rungs.push(createRung(contacts, coil));
  }
  return rungs;
}

function saveLadder() {
  localStorage.setItem(LADDER_STORAGE_KEY, JSON.stringify(ladder));
}

function firstSelectable(program) {
  const rung = program[0];
  if (!rung) return null;
  return { rungId: rung.id, type: "contact", index: 0 };
}

function populateInspectorOptions() {
  for (const [pin, name] of PINS) {
    const option = document.createElement("option");
    option.value = pin;
    option.textContent = `${pin} ${name}`;
    els.pinSelect.appendChild(option);
  }

  for (const [pin, name] of Object.entries(OUTPUTS)) {
    const option = document.createElement("option");
    option.value = pin;
    option.textContent = `${pin} ${name}`;
    els.coilSelect.appendChild(option);
  }
}

function renderSensorBank() {
  for (const [pin, name] of PINS) {
    const node = document.createElement("div");
    node.className = "sensor";
    node.dataset.pin = pin;

    const label = node.appendChild(document.createElement("span"));
    label.textContent = `${pin} ${name}`;

    const value = node.appendChild(document.createElement("strong"));
    value.textContent = "0";

    els.sensorBank.appendChild(node);
  }
}

function wireEditorEvents() {
  const toolButtons = [
    [els.addRungBtn, "rung"],
    [els.addOpenContactBtn, "contact-open"],
    [els.addClosedContactBtn, "contact-closed"],
    [els.addCoilBtn, "coil"],
    [els.deleteNodeBtn, "delete"],
    [els.moveLeftBtn, "move-left"],
    [els.moveRightBtn, "move-right"],
  ];

  for (const [button, tool] of toolButtons) {
    button.dataset.tool = button.dataset.tool || tool;
    button.addEventListener("click", () => applyTool(button.dataset.tool));

    if (button.draggable) {
      button.addEventListener("dragstart", (event) => {
        activeDraggedTool = button.dataset.tool;
        event.dataTransfer.setData("text/plain", button.dataset.tool);
        event.dataTransfer.effectAllowed = "copy";
      });

      button.addEventListener("dragend", () => {
        clearDragState();
      });
    }
  }

  els.rungList.addEventListener("dragover", (event) => {
    if (!event.target.closest(".rung-row") && isToolDrag(event)) {
      event.preventDefault();
      els.rungList.classList.add("drop-target");
    }
  });

  els.rungList.addEventListener("dragleave", (event) => {
    if (!els.rungList.contains(event.relatedTarget)) {
      els.rungList.classList.remove("drop-target");
    }
  });

  els.rungList.addEventListener("drop", (event) => {
    const tool = draggedTool(event);
    els.rungList.classList.remove("drop-target");
    clearDragState();
    if (!tool || event.target.closest(".rung-row")) return;
    event.preventDefault();
    applyTool(tool);
  });

  els.contactOpSelect.addEventListener("change", () => {
    const context = ensureSelection();
    if (!context || selectedNode.type !== "contact") return;
    context.rung.contacts[selectedNode.index].op = els.contactOpSelect.value;
    onLadderChanged();
  });

  els.pinSelect.addEventListener("change", () => {
    const context = ensureSelection();
    if (!context || selectedNode.type !== "contact") return;
    context.rung.contacts[selectedNode.index].pin = els.pinSelect.value;
    onLadderChanged();
  });

  els.coilSelect.addEventListener("change", () => {
    const context = ensureSelection();
    if (!context || selectedNode.type !== "coil") return;
    context.rung.coil = els.coilSelect.value;
    onLadderChanged();
  });
}

function applyTool(tool, drop = null) {
  if (tool === "rung") {
    addRungAfter(drop?.rungId);
    return;
  }

  if (tool === "contact-open") {
    insertContact("XIC", drop);
    return;
  }

  if (tool === "contact-closed") {
    insertContact("XIO", drop);
    return;
  }

  if (tool === "coil") {
    selectCoil(drop?.rungId);
    return;
  }

  if (tool === "delete") {
    deleteSelection();
    return;
  }

  if (tool === "move-left") {
    moveSelectedContact(-1);
    return;
  }

  if (tool === "move-right") {
    moveSelectedContact(1);
  }
}

function draggedTool(event) {
  return event.dataTransfer?.getData("text/plain") || activeDraggedTool || "";
}

function isToolDrag(event) {
  return Boolean(
    activeDraggedTool ||
      Array.from(event.dataTransfer?.types || []).some((type) => type === "text/plain"),
  );
}

function draggedContact(event) {
  const raw =
    event.dataTransfer?.getData("application/x-silidox-contact") ||
    (activeDraggedContact ? JSON.stringify(activeDraggedContact) : "");
  if (!raw) return null;

  try {
    const value = JSON.parse(raw);
    if (typeof value.rungId === "string" && Number.isInteger(value.index)) {
      return value;
    }
  } catch {
    return null;
  }

  return null;
}

function isContactDrag(event) {
  return Boolean(
    activeDraggedContact ||
      Array.from(event.dataTransfer?.types || []).some(
        (type) => type === "application/x-silidox-contact",
      ),
  );
}

function clearDragState() {
  activeDraggedTool = "";
  activeDraggedContact = null;
}

function addRungAfter(rungId = selectedNode?.rungId) {
  const rung = createRung();
  const index = ladder.findIndex((item) => item.id === rungId);
  ladder.splice(index === -1 ? ladder.length : index + 1, 0, rung);
  selectedNode = { rungId: rung.id, type: "contact", index: 0 };
  onLadderChanged();
}

function insertContact(op, drop = null) {
  const context = ensureSelectionForRung(drop?.rungId);
  if (!context) return;

  const insertAt =
    typeof drop?.insertAt === "number" ? drop.insertAt : selectedInsertIndex(context.rung);
  const index = Math.min(Math.max(0, insertAt), context.rung.contacts.length);
  context.rung.contacts.splice(index, 0, { op, pin: "I0" });
  selectedNode = { rungId: context.rung.id, type: "contact", index };
  onLadderChanged();
}

function moveContact(source, drop) {
  const from = ensureSelectionForRung(source.rungId);
  const to = ensureSelectionForRung(drop?.rungId);
  if (!from || !to) return;

  const sourceIndex = source.index;
  if (sourceIndex < 0 || sourceIndex >= from.rung.contacts.length) return;
  if (from.rung.id !== to.rung.id && from.rung.contacts.length <= 1) return;

  let insertAt = typeof drop?.insertAt === "number" ? drop.insertAt : to.rung.contacts.length;
  insertAt = Math.min(Math.max(0, insertAt), to.rung.contacts.length);

  const [contact] = from.rung.contacts.splice(sourceIndex, 1);
  if (from.rung.id === to.rung.id && sourceIndex < insertAt) {
    insertAt -= 1;
  }
  insertAt = Math.min(Math.max(0, insertAt), to.rung.contacts.length);
  to.rung.contacts.splice(insertAt, 0, contact);

  selectedNode = { rungId: to.rung.id, type: "contact", index: insertAt };
  onLadderChanged();
}

function selectedInsertIndex(rung) {
  if (selectedNode?.rungId !== rung.id) return rung.contacts.length;
  if (selectedNode.type === "contact") return selectedNode.index + 1;
  return rung.contacts.length;
}

function selectCoil(rungId = selectedNode?.rungId) {
  const context = ensureSelectionForRung(rungId);
  if (!context) return;

  selectedNode = { rungId: context.rung.id, type: "coil" };
  render();
}

function deleteSelection() {
  const context = ensureSelection();
  if (!context) return;

  if (selectedNode.type === "rung") {
    if (ladder.length <= 1) return;
    ladder.splice(context.rungIndex, 1);
    selectedNode = firstSelectable(ladder);
    onLadderChanged();
    return;
  }

  if (selectedNode.type !== "contact" || context.rung.contacts.length <= 1) return;

  context.rung.contacts.splice(selectedNode.index, 1);
  selectedNode.index = Math.max(0, selectedNode.index - 1);
  onLadderChanged();
}

function wireRunEvents() {
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
    els.runBtn.textContent = "停止";
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
    log("good", "local ladder retained; epoch rebooted");
    compileAndReport();
    render();
  });
}

function moveSelectedContact(direction) {
  const context = ensureSelection();
  if (!context || selectedNode.type !== "contact") return;

  const from = selectedNode.index;
  const to = from + direction;
  if (to < 0 || to >= context.rung.contacts.length) return;

  const [contact] = context.rung.contacts.splice(from, 1);
  context.rung.contacts.splice(to, 0, contact);
  selectedNode.index = to;
  onLadderChanged();
}

function ensureSelection() {
  if (ladder.length === 0) {
    const rung = createRung();
    ladder.push(rung);
    selectedNode = { rungId: rung.id, type: "contact", index: 0 };
  }

  let rungIndex = ladder.findIndex((rung) => rung.id === selectedNode?.rungId);
  if (rungIndex === -1) {
    selectedNode = firstSelectable(ladder);
    rungIndex = 0;
  }

  const rung = ladder[rungIndex];
  if (!selectedNode) return null;

  if (selectedNode.type === "contact") {
    selectedNode.index = Math.min(Math.max(0, selectedNode.index), rung.contacts.length - 1);
  }

  return { rung, rungIndex };
}

function ensureSelectionForRung(rungId) {
  if (!rungId) return ensureSelection();

  const rungIndex = ladder.findIndex((rung) => rung.id === rungId);
  if (rungIndex === -1) return ensureSelection();

  return { rung: ladder[rungIndex], rungIndex };
}

function onLadderChanged() {
  saveLadder();
  compiled = compileLadder(ladder);
  render();
}

function compileAndReport() {
  compiled = compileLadder(ladder);
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

function compileLadder(program) {
  const rungs = [];
  const diagnostics = [];

  program.forEach((rung, index) => {
    const lineNo = index + 1;
    const before = diagnostics.length;

    if (!rung.contacts || rung.contacts.length === 0) {
      diagnostics.push(`R${lineNo}: missing contact`);
    }

    const contacts = [];
    for (const contact of rung.contacts || []) {
      if (contact.op !== "XIC" && contact.op !== "XIO") {
        diagnostics.push(`R${lineNo}: unknown contact ${contact.op}`);
        continue;
      }
      if (!isKnownPin(contact.pin)) {
        diagnostics.push(`R${lineNo}: unknown input ${contact.pin}`);
        continue;
      }
      contacts.push({ op: contact.op, pin: contact.pin });
    }

    if (!OUTPUTS[rung.coil]) {
      diagnostics.push(`R${lineNo}: unknown coil ${rung.coil}`);
    }

    if (diagnostics.length === before && contacts.length > 0) {
      rungs.push({ id: rung.id, lineNo, contacts, coil: rung.coil });
    }
  });

  if (rungs.length === 0) diagnostics.push("no energized logic found");
  return { ok: diagnostics.length === 0, rungs, diagnostics };
}

function isKnownPin(pin) {
  return PINS.some(([knownPin]) => knownPin === pin);
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
  const atHomeNow = atHome();
  const dir = DIRS[state.robot.dir];
  const currentDistance = manhattan(state.robot, state.home);
  const nextDistance = manhattan(
    { x: state.robot.x + dir.dx, y: state.robot.y + dir.dy },
    state.home,
  );
  const homeVectorAhead = atHomeNow || nextDistance < currentDistance;

  return {
    I0: blocked,
    I1: tree,
    I2: cargoFull,
    I3: atHomeNow,
    I4: homeVectorAhead,
    I5: state.lastCollision,
    I6: state.tick % 8 === 0,
    I7: cell === "." || cell === "H",
  };
}

function evaluateRungs(sensors) {
  const active = [];
  for (const rung of compiled.rungs) {
    if (isRungEnergized(rung, sensors) && !active.includes(rung.coil)) {
      active.push(rung.coil);
    }
  }
  return active;
}

function isRungEnergized(rung, sensors) {
  return rung.contacts.every((contact) => {
    const value = Boolean(sensors[contact.pin]);
    return contact.op === "XIC" ? value : !value;
  });
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
  renderEditor(sensors);
  renderLog();
  renderCanvas();
  renderMetrics();
}

function renderEditor(sensors) {
  ensureSelection();
  updateInspector();
  els.rungList.innerHTML = "";

  const width = ladder.reduce((max, rung) => Math.max(max, diagramWidth(rung)), 360);
  const energized = new Set(
    compiled.rungs
      .filter((rung) => isRungEnergized(rung, sensors))
      .map((rung) => rung.id),
  );

  for (let index = 0; index < ladder.length; index += 1) {
    const rung = ladder[index];
    renderRungRow({ rung, index, width }, energized.has(rung.id));
  }
}

function diagramWidth(rung) {
  return 76 + rung.contacts.length * 92 + 108;
}

function renderRungRow({ rung, index, width }, energized) {
  const row = els.rungList.appendChild(document.createElement("article"));
  row.className = "rung-row";
  row.classList.toggle("energized", energized);
  row.classList.toggle("selected", selectedNode?.rungId === rung.id);
  row.style.width = `${width + 20}px`;

  const header = row.appendChild(document.createElement("div"));
  header.className = "rung-row-header";
  header.addEventListener("click", () => {
    selectedNode = { rungId: rung.id, type: "rung" };
    renderEditor(readSensors());
  });

  const title = header.appendChild(document.createElement("strong"));
  title.textContent = `R${index + 1}`;

  const status = header.appendChild(document.createElement("span"));
  status.className = "rung-state";
  status.textContent = energized ? "ON" : "OFF";

  const diagram = row.appendChild(document.createElement("div"));
  diagram.className = "rung-diagram";
  const svg = renderLadDiagram(diagram, rung, width);

  markSelectedShape(diagram, rung);
  svg.addEventListener("dragstart", (event) => {
    const shape = event.target.closest("g.shape");
    if (!shape || shape.dataset.kind !== "contact") return;

    const index = Number(shape.dataset.index);
    activeDraggedContact = { rungId: rung.id, index };
    event.dataTransfer.setData(
      "application/x-silidox-contact",
      JSON.stringify(activeDraggedContact),
    );
    event.dataTransfer.effectAllowed = "move";
    shape.classList.add("dragging");
    selectedNode = { rungId: rung.id, type: "contact", index };
  });

  svg.addEventListener("dragend", () => {
    clearDragState();
  });

  svg.addEventListener("click", (event) => {
    const shape = event.target.closest("g.shape");
    if (!shape) {
      selectedNode = { rungId: rung.id, type: "rung" };
      renderEditor(readSensors());
      return;
    }

    if (shape.dataset.kind === "contact") {
      const childIndex = Number(shape.dataset.index);
      selectedNode = { rungId: rung.id, type: "contact", index: childIndex };
    } else if (shape.dataset.kind === "coil") {
      selectedNode = { rungId: rung.id, type: "coil" };
    } else {
      selectedNode = { rungId: rung.id, type: "rung" };
    }
    renderEditor(readSensors());
  });

  row.addEventListener("dragover", (event) => {
    if (!isToolDrag(event) && !isContactDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = isContactDrag(event) ? "move" : "copy";
    row.classList.add("drop-target");
  });

  row.addEventListener("dragleave", (event) => {
    if (!row.contains(event.relatedTarget)) {
      row.classList.remove("drop-target");
    }
  });

  row.addEventListener("drop", (event) => {
    const tool = draggedTool(event);
    const contactMove = draggedContact(event);
    row.classList.remove("drop-target");
    clearDragState();
    if (!tool && !contactMove) return;

    event.preventDefault();
    event.stopPropagation();
    const drop = dropContextFromEvent(event, rung);
    if (contactMove) {
      moveContact(contactMove, drop);
    } else {
      applyTool(tool, drop);
    }
  });
}

function dropContextFromEvent(event, rung) {
  const shape = event.target.closest("g.shape");
  if (!shape) return { rungId: rung.id, insertAt: rung.contacts.length };

  if (shape.dataset.kind === "contact") {
    return { rungId: rung.id, insertAt: Number(shape.dataset.index) + 1 };
  }

  return { rungId: rung.id, insertAt: rung.contacts.length };
}

function renderLadDiagram(parent, rung, width) {
  const shell = parent.appendChild(document.createElement("div"));
  shell.className = "lad-svg-shell";
  shell.style.width = `${width}px`;

  const svg = shell.appendChild(createSvg("svg"));
  svg.classList.add("lad");
  svg.setAttribute("viewBox", `0 0 ${width} 78`);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", "78");
  svg.setAttribute("preserveAspectRatio", "xMinYMin meet");

  const y = 44;
  line(svg, LAD_DIMENSIONS.leftRail, 12, LAD_DIMENSIONS.leftRail, 68, "2");
  line(svg, rightRailX(width), 12, rightRailX(width), 68, "2");
  renderRungWires(svg, rung, width, y);

  for (let index = 0; index < rung.contacts.length; index += 1) {
    renderContact(svg, contactX(index), y, rung.contacts[index], index);
  }
  renderCoil(svg, coilX(width), y, rung.coil);

  return svg;
}

function renderRungWires(svg, rung, width, y) {
  let cursor = LAD_DIMENSIONS.leftRail;

  for (let index = 0; index < rung.contacts.length; index += 1) {
    const x = contactX(index);
    wire(svg, cursor, x - LAD_DIMENSIONS.contactConnector, y);
    cursor = x + LAD_DIMENSIONS.contactConnector;
  }

  const outputX = coilX(width);
  wire(svg, cursor, outputX - LAD_DIMENSIONS.coilConnector, y);
  wire(svg, outputX + LAD_DIMENSIONS.coilConnector, rightRailX(width), y);
}

function contactX(index) {
  return LAD_DIMENSIONS.contactStartX + index * LAD_DIMENSIONS.contactPitch;
}

function coilX(width) {
  return width - LAD_DIMENSIONS.coilRightInset;
}

function rightRailX(width) {
  return width - LAD_DIMENSIONS.rightRailInset;
}

function wire(svg, x1, x2, y) {
  if (x2 <= x1) return null;
  return line(svg, x1, y, x2, y, "1");
}

function renderContact(svg, x, y, contact, index) {
  const g = shapeGroup(svg, x, y, "contact", index);
  label(g, contact.pin, -20);
  path(g, "M-10,-10 L-10,10");
  path(g, "M10,-10 L10,10");
  if (contact.op === "XIO") {
    path(g, "M-6,10 L6,-10").classList.add("node-mark");
  }
}

function renderCoil(svg, x, y, coil) {
  const g = shapeGroup(svg, x, y, "coil");
  label(g, coil, -20);
  path(g, "M-7,-10 C-13,-8 -13,8 -7,10");
  path(g, "M7,-10 C13,-8 13,8 7,10");
}

function shapeGroup(svg, x, y, kind, index = "") {
  const g = svg.appendChild(createSvg("g"));
  g.classList.add("shape");
  g.dataset.kind = kind;
  if (index !== "") g.dataset.index = String(index);
  g.setAttribute("transform", `translate(${x},${y})`);
  if (kind === "contact") {
    g.setAttribute("draggable", "true");
  }

  const rect = g.appendChild(createSvg("rect"));
  rect.classList.add("node-rect");
  rect.setAttribute("x", "-38");
  rect.setAttribute("y", "-36");
  rect.setAttribute("width", "76");
  rect.setAttribute("height", "64");
  return g;
}

function label(parent, text, y) {
  const node = parent.appendChild(createSvg("text"));
  node.textContent = text;
  node.setAttribute("y", String(y));
  node.setAttribute("text-anchor", "middle");
}

function line(parent, x1, y1, x2, y2, strokeWidth) {
  const node = parent.appendChild(createSvg("line"));
  node.setAttribute("x1", String(x1));
  node.setAttribute("y1", String(y1));
  node.setAttribute("x2", String(x2));
  node.setAttribute("y2", String(y2));
  node.setAttribute("stroke-width", strokeWidth);
  return node;
}

function path(parent, d) {
  const node = parent.appendChild(createSvg("path"));
  node.setAttribute("d", d);
  node.setAttribute("fill", "none");
  return node;
}

function createSvg(tagName) {
  return document.createElementNS("http://www.w3.org/2000/svg", tagName);
}

function markSelectedShape(diagram, rung) {
  if (selectedNode?.rungId !== rung.id) return;

  for (const shape of diagram.querySelectorAll("g.shape")) {
    if (
      (selectedNode.type === "contact" &&
        shape.dataset.kind === "contact" &&
        Number(shape.dataset.index) === selectedNode.index) ||
      (selectedNode.type === "coil" && shape.dataset.kind === "coil")
    ) {
      shape.classList.add("selected");
    }
  }
}

function updateInspector() {
  const context = ensureSelection();
  const isContact = selectedNode?.type === "contact";
  const isCoil = selectedNode?.type === "coil";
  const isRung = selectedNode?.type === "rung";

  els.contactOpSelect.disabled = !isContact;
  els.pinSelect.disabled = !isContact;
  els.coilSelect.disabled = !isCoil;
  els.deleteNodeBtn.disabled =
    !(isContact && context.rung.contacts.length > 1) && !(isRung && ladder.length > 1);
  els.moveLeftBtn.disabled = !isContact || selectedNode.index <= 0;
  els.moveRightBtn.disabled = !isContact || selectedNode.index >= context.rung.contacts.length - 1;

  if (isContact) {
    const contact = context.rung.contacts[selectedNode.index];
    els.contactOpSelect.value = contact.op;
    els.pinSelect.value = contact.pin;
  }

  if (isCoil) {
    els.coilSelect.value = context.rung.coil;
  }

  renderPinPicker(context, { isContact, isCoil });
}

function renderPinPicker(context, mode) {
  els.pinPicker.innerHTML = "";

  if (mode.isContact) {
    const selectedPin = context.rung.contacts[selectedNode.index].pin;
    renderPinButtons(PINS, selectedPin, (pin) => {
      context.rung.contacts[selectedNode.index].pin = pin;
      onLadderChanged();
    });
    return;
  }

  if (mode.isCoil) {
    const entries = Object.entries(OUTPUTS);
    renderPinButtons(entries, context.rung.coil, (pin) => {
      context.rung.coil = pin;
      onLadderChanged();
    });
  }
}

function renderPinButtons(entries, selected, onPick) {
  for (const [pin, name] of entries) {
    const button = els.pinPicker.appendChild(document.createElement("button"));
    button.type = "button";
    button.className = "pin-button";
    button.classList.toggle("selected", pin === selected);
    button.title = name;
    button.textContent = pin;
    button.addEventListener("click", () => onPick(pin));
  }
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

    const time = row.appendChild(document.createElement("time"));
    time.textContent = `t+${String(entry.tick).padStart(4, "0")}`;

    const message = row.appendChild(document.createElement("span"));
    message.textContent = entry.text;

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
  return Math.abs(t + 0.2 - t - 0.2) * Math.max(1, state.tick ** 1.25);
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
  els.runBtn.textContent = "30 tick";
}
