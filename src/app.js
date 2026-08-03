// Browser bootstrap, persistence, fixed-step scheduling, and module orchestration.
(function startSilidox(global) {
  const {
    CONTROLLERS,
    CONTROL_CONTEXTS,
    LADDER_STORAGE_KEY,
    LEGACY_META_STORAGE_KEY,
    SAVE_STORAGE_KEY,
    STEP_MS,
  } = global.SilidoxData;
  const Simulation = global.SilidoxSimulation;
  const Ladder = global.SilidoxLadder;
  const AutomationPlan = global.SilidoxAutomationPlan;

  let state = loadState();
  let saveAccumulator = 0;
  let ui;

  ui = global.SilidoxUI.create({
    onPrimaryAction() {
      act(state.shutdown ? "emergencyPulse" : "heartbeat");
    },
    onAction(action, payload) {
      act(action, payload);
    },
    onProgramSelect(programId) {
      Ladder.selectProgram(programId);
      render();
    },
    onDiagnosticsOpened() {
      Ladder.render();
    },
    onExportPlan: exportAutomationPlan,
    onRestart: restartState,
    onNewGame: clearNewSave,
    getState: () => state,
    getProgramStatus,
  });

  Ladder.init(ui.ladderElements, {
    programId: "body.heart",
    getSignals: (programId) => signalsForProgram(programId),
    onChange() {
      render();
    },
  });

  saveState();
  render();
  global.setInterval(runStep, STEP_MS);
  global.addEventListener("beforeunload", saveState);

  function runStep() {
    Simulation.advance(state, STEP_MS, (programId, signals) =>
      Ladder.evaluateProgram(programId, signals),
    );
    saveAccumulator += STEP_MS;
    if (saveAccumulator >= 1000) {
      saveAccumulator = 0;
      saveState();
    }
    render();
  }

  function act(action, payload = null) {
    const changed = Simulation.performAction(state, action, payload);
    if (!changed) return;
    saveState();
    render();
  }

  function render() {
    ui.render(state, getProgramStatus());
    Ladder.render();
  }

  function signalsForProgram(programId) {
    const controllerId = CONTROL_CONTEXTS[programId]?.controllerId;
    return controllerId
      ? Simulation.controlSignals(state, controllerId)
      : { 0: false, 1: true };
  }

  function getProgramStatus() {
    const readyPrograms = {};
    const scanCosts = {};
    const signals = {};
    const evaluations = {};

    for (const programId of Object.keys(CONTROL_CONTEXTS)) {
      const currentSignals = signalsForProgram(programId);
      const result = Ladder.evaluateProgram(programId, currentSignals);
      readyPrograms[programId] = Ladder.programReady(programId);
      scanCosts[programId] = result.scanCost;
      signals[programId] = currentSignals;
      evaluations[programId] = result;
    }
    return { readyPrograms, scanCosts, signals, evaluations };
  }

  function loadState() {
    const legacyArchive = readLegacyArchive();
    const raw = localStorage.getItem(SAVE_STORAGE_KEY);
    if (!raw) return Simulation.createState(legacyArchive);

    try {
      return Simulation.normalizeState(JSON.parse(raw), legacyArchive);
    } catch {
      return Simulation.createState(legacyArchive);
    }
  }

  function readLegacyArchive() {
    const raw = localStorage.getItem(LEGACY_META_STORAGE_KEY);
    if (!raw) return null;
    try {
      return {
        importedAt: new Date().toISOString(),
        metaV1: JSON.parse(raw),
      };
    } catch {
      return {
        importedAt: new Date().toISOString(),
        metaV1Raw: raw,
      };
    }
  }

  function saveState() {
    state.clock.savedAt = Date.now();
    localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(state));
  }

  function restartState() {
    if (!global.confirm("保留设备程序和旧纪元档案，重新开始当前机体进度？")) return;
    state = Simulation.createState(state.legacyArchive);
    saveState();
    ui.selectWorkspace("body");
    render();
  }

  function clearNewSave() {
    if (
      !global.confirm(
        "清除新版生存进度和设备程序？旧版 silidox.meta.v1 与 silidox.ladder.v2 不会删除。",
      )
    ) {
      return;
    }
    localStorage.removeItem(SAVE_STORAGE_KEY);
    localStorage.removeItem(LADDER_STORAGE_KEY);
    global.location.reload();
  }

  function exportAutomationPlan() {
    const plan = AutomationPlan.createPlan(state, Ladder.exportPrograms());
    const blob = new Blob([JSON.stringify(plan, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "silidox-automation-plan.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }
})(globalThis);
