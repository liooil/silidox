// Graphical Ladder Diagram editor and runtime compiler.
const LADDER_STORAGE_KEY = "silidox.ladder.v2";

const LAD_DIMENSIONS = {
  leftRail: 8,
  rightRailInset: 8,
  contactStartX: 58,
  contactPitch: 92,
  contactConnector: 10,
  coilRightInset: 66,
  coilConnector: 14,
};

let nextRungId = 1;
let ladder = [];
let selectedNode = null;
let compiled = { ok: false, rungs: [], diagnostics: [] };
let activeDraggedTool = "";
let activeDraggedContact = null;

function initLadderEditor() {
  ladder = loadLadder();
  syncNextRungId(ladder);
  selectedNode = firstSelectable(ladder);
  compiled = compileLadder(ladder);
  populateInspectorOptions();
  wireEditorEvents();
}

function createDefaultLadder() {
  return [];
}

function createRung(
  contacts = [{ op: "XIC", pin: "I0" }],
  coil = "Q4",
  id = allocateRungId(),
  enabled = true,
) {
  return {
    id,
    enabled: enabled !== false,
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

  return createDefaultLadder();
}

function normalizeLadder(value) {
  if (!Array.isArray(value)) return createDefaultLadder();
  return value
    .map((rung) =>
      createRung(rung.contacts, rung.coil, rung.id || allocateRungId(), rung.enabled),
    )
    .filter((rung) => rung.contacts.length > 0);
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
  for (const [pin, name] of currentInputEntries()) {
    const option = document.createElement("option");
    option.value = pin;
    option.textContent = `${pin} ${name}`;
    els.pinSelect.appendChild(option);
  }

  for (const pin of Object.keys(OUTPUTS)) {
    const option = document.createElement("option");
    option.value = pin;
    option.textContent = `${pin} ${outputSignalLabel(pin)}`;
    els.coilSelect.appendChild(option);
  }
}

function currentInputEntries() {
  return [
    ...PIN_IDS.map((pin) => [pin, inputSignalLabel(pin)]),
    ...Object.entries(LOGIC_CONSTANTS).map(([pin, constant]) => [pin, constant.zh]),
  ];
}

function refreshInputOptionLabels() {
  for (const option of els.pinSelect.options) {
    const constant = LOGIC_CONSTANTS[option.value];
    const label = constant ? constant.zh : inputSignalLabel(option.value);
    option.textContent = `${option.value} ${label}`;
  }
}


function wireEditorEvents() {
  const toolButtons = [
    [els.addRungBtn, "rung"],
    [els.addOpenContactBtn, "contact-open"],
    [els.addClosedContactBtn, "contact-closed"],
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
  if (compiled.ok) return true;

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
    if (rung.enabled === false) return;

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

  return { ok: diagnostics.length === 0, rungs, diagnostics };
}

function isKnownPin(pin) {
  return PIN_IDS.includes(pin) || Object.hasOwn(LOGIC_CONSTANTS, pin);
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


function renderEditor(sensors) {
  if (ladder.length > 0) ensureSelection();
  refreshInputOptionLabels();
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
  row.classList.toggle("disabled", rung.enabled === false);
  row.style.width = `${width + 20}px`;

  const header = row.appendChild(document.createElement("div"));
  header.className = "rung-row-header";
  header.addEventListener("click", () => {
    selectedNode = { rungId: rung.id, type: "rung" };
    renderEditor(readSensors());
  });

  const title = header.appendChild(document.createElement("strong"));
  title.textContent = `R${index + 1}`;

  const controls = header.appendChild(document.createElement("div"));
  controls.className = "rung-row-controls";

  const status = controls.appendChild(document.createElement("span"));
  status.className = "rung-state";
  status.textContent = rung.enabled === false ? "DISABLED" : energized ? "ON" : "OFF";

  const toggle = controls.appendChild(document.createElement("label"));
  toggle.className = "rung-enable";
  toggle.title = rung.enabled === false ? `启用 R${index + 1}` : `禁用 R${index + 1}`;
  toggle.addEventListener("click", (event) => event.stopPropagation());

  const checkbox = toggle.appendChild(document.createElement("input"));
  checkbox.type = "checkbox";
  checkbox.checked = rung.enabled !== false;
  checkbox.setAttribute("aria-label", toggle.title);
  checkbox.addEventListener("change", () => {
    rung.enabled = checkbox.checked;
    onLadderChanged();
  });

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
  const context = ladder.length > 0 ? ensureSelection() : null;
  const isContact = Boolean(context && selectedNode?.type === "contact");
  const isCoil = Boolean(context && selectedNode?.type === "coil");
  const isRung = Boolean(context && selectedNode?.type === "rung");

  els.contactOpSelect.disabled = !isContact;
  els.pinSelect.disabled = !isContact;
  els.coilSelect.disabled = !isCoil;
  els.deleteNodeBtn.disabled =
    !(isContact && context?.rung.contacts.length > 1) && !(isRung && ladder.length > 1);
  els.moveLeftBtn.disabled = !isContact || selectedNode.index <= 0;
  els.moveRightBtn.disabled =
    !isContact || selectedNode.index >= context.rung.contacts.length - 1;

  if (isContact) {
    const contact = context.rung.contacts[selectedNode.index];
    els.contactOpSelect.value = contact.op;
    els.pinSelect.value = contact.pin;
  }

  if (isCoil) {
    els.coilSelect.value = context.rung.coil;
  }
}
