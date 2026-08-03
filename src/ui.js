// DOM rendering and interaction wiring for the progressive workspace interface.
(function defineSilidoxUI(global) {
  const {
    CONTROLLERS,
    CONTROL_CONTEXTS,
    JOBS,
    STAGE_LABELS,
    SURVIVAL_RULES,
    TRACK,
  } = global.SilidoxData;
  const Simulation = global.SilidoxSimulation;

  function createUI(handlers) {
    const els = cacheElements();
    let selectedWorkspace = "body";
    let selectedProgramId = "body.heart";
    let previousLogCount = 0;

    wireStaticEvents();

    function wireStaticEvents() {
      for (const tab of els.workspaceTabs) {
        tab.addEventListener("click", () => selectWorkspace(tab.dataset.workspace));
      }

      els.pauseBtn.addEventListener("click", () => handlers.onAction("togglePause"));
      els.heartbeatBtn.addEventListener("click", () => handlers.onPrimaryAction());
      els.moveBtn.addEventListener("click", () => handlers.onAction("move"));
      els.reverseBtn.addEventListener("click", () => handlers.onAction("reverse"));
      els.pickupBtn.addEventListener("click", () => handlers.onAction("pickup"));
      els.exportPlanBtn.addEventListener("click", handlers.onExportPlan);
      els.restartBtn.addEventListener("click", handlers.onRestart);
      els.newGameBtn.addEventListener("click", handlers.onNewGame);

      const controllerHandler = (event) => {
        const install = event.target.closest("[data-install-controller]");
        if (install) {
          handlers.onAction("installController", install.dataset.installController);
          return;
        }

        const mode = event.target.closest("[data-controller-mode]");
        if (mode) {
          handlers.onAction("setControllerMode", {
            id: mode.dataset.controllerId,
            mode: mode.dataset.controllerMode,
          });
          return;
        }

        const open = event.target.closest("[data-open-program]");
        if (open) openProgram(open.dataset.openProgram);
      };
      els.bodyControllerList.addEventListener("click", controllerHandler);
      els.environmentControllerList.addEventListener("click", controllerHandler);

      els.buildList.addEventListener("click", (event) => {
        const button = event.target.closest("[data-start-job]");
        if (button) handlers.onAction("startJob", button.dataset.startJob);
      });

      els.programTabs.addEventListener("click", (event) => {
        const button = event.target.closest("[data-program-id]");
        if (button) openProgram(button.dataset.programId);
      });

      els.diagnostics.addEventListener("toggle", () => {
        if (els.diagnostics.open) handlers.onDiagnosticsOpened?.();
      });
    }

    function selectWorkspace(workspace) {
      const tab = els.workspaceTabs.find(
        (candidate) => candidate.dataset.workspace === workspace && !candidate.hidden,
      );
      if (!tab) return;
      selectedWorkspace = workspace;
      for (const candidate of els.workspaceTabs) {
        const active = candidate === tab;
        candidate.classList.toggle("active", active);
        if (active) candidate.setAttribute("aria-current", "page");
        else candidate.removeAttribute("aria-current");
      }
      for (const view of els.workspaceViews) {
        const active = view.dataset.workspaceView === workspace;
        view.classList.toggle("active", active);
        view.hidden = !active;
      }
    }

    function openProgram(programId) {
      if (!CONTROL_CONTEXTS[programId]) return;
      selectedProgramId = programId;
      els.diagnostics.open = true;
      handlers.onProgramSelect(programId);
      renderProgramTabs(handlers.getState(), handlers.getProgramStatus());
      renderDiagnostics(handlers.getState(), handlers.getProgramStatus());
      window.requestAnimationFrame(() => {
        els.diagnostics.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }

    function render(state, status) {
      renderHeader(state);
      renderWorkspaceAvailability(state);
      renderBody(state, status);
      renderEnvironment(state, status);
      renderWorkshop(state);
      renderProgramTabs(state, status);
      renderDiagnostics(state, status);
      renderLogs(state);
      renderArchive(state);
    }

    function renderHeader(state) {
      els.stageReadout.textContent = STAGE_LABELS[state.stage] ?? state.stage;
      els.elapsedReadout.textContent = formatTime(state.clock.elapsedMs);
      els.coreReadout.textContent = String(Math.ceil(state.resources.core));
      els.energyReadout.textContent = state.resources.energy.toFixed(1);
      els.materialReadout.textContent = String(Math.floor(state.resources.material));
      els.controlLoadReadout.textContent = state.control.currentLoad.toFixed(1);
      els.objectiveText.textContent = Simulation.objective(state);

      const progress = Math.max(0, Math.min(1, Simulation.stageProgress(state)));
      els.stageProgress.style.width = `${progress * 100}%`;
      els.stageProgress.parentElement.setAttribute(
        "aria-valuenow",
        String(Math.round(progress * 100)),
      );

      els.pauseBtn.querySelector("span").textContent = state.clock.paused ? "▶" : "Ⅱ";
      els.pauseBtn.title = state.clock.paused ? "继续时间" : "暂停时间";
      els.pauseBtn.setAttribute("aria-label", els.pauseBtn.title);
      document.body.classList.toggle("shutdown", state.shutdown);
    }

    function renderWorkspaceAvailability(state) {
      els.environmentTab.hidden = !state.unlocks.environment;
      els.workshopTab.hidden = !state.unlocks.workshop;
      els.anomalyTab.hidden = !state.unlocks.anomaly;

      const unlocked =
        selectedWorkspace === "body" ||
        (selectedWorkspace === "environment" && state.unlocks.environment) ||
        (selectedWorkspace === "workshop" && state.unlocks.workshop) ||
        (selectedWorkspace === "anomaly" && state.unlocks.anomaly);
      if (!unlocked) selectWorkspace("body");
    }

    function renderBody(state, status) {
      const core = state.resources.core;
      els.coreGauge.style.width = `${core}%`;
      els.coreGauge.style.background =
        core <= 25 ? "var(--red)" : core <= 50 ? "var(--amber)" : "var(--green)";
      els.coreState.textContent = state.shutdown
        ? "停机"
        : core <= 25
          ? "临界"
          : core <= 50
            ? "偏低"
            : "稳定";

      els.emergencyStatus.hidden = !state.shutdown;
      els.emergencyCharge.textContent =
        `${state.emergency.charge}/${SURVIVAL_RULES.emergencyPulsesRequired}`;

      if (state.shutdown) {
        els.heartbeatBtn.querySelector("strong").textContent = "手动应急起搏";
        els.heartbeatBtn.querySelector("span").textContent =
          `已完成 ${state.emergency.restartPulses}/${SURVIVAL_RULES.emergencyPulsesRequired} 次`;
        els.heartbeatBtn.disabled = state.emergency.charge < 1 || state.clock.paused;
        els.heartbeatHint.textContent =
          state.emergency.charge > 0
            ? "应急电容已有电荷。起搏不会清除任何资源或建设进度。"
            : "热差电容正在低功耗回充，每 2 秒恢复一格。";
      } else {
        els.heartbeatBtn.querySelector("strong").textContent = "释放核心脉冲";
        els.heartbeatBtn.querySelector("span").textContent = "消耗 1 能源，恢复 25% 核心";
        els.heartbeatBtn.disabled =
          state.resources.energy < SURVIVAL_RULES.manualHeartbeatEnergy ||
          state.clock.paused;
        els.heartbeatHint.textContent =
          `手动完成 ${Math.min(3, state.milestones.manualHeartbeats)}/3 次。` +
          (state.controllers.heart.available
            ? " 核心控制器现在可以安装。"
            : " 重复之后，可以让控制器接管。");
      }

      els.bodyControllerList.replaceChildren(
        createControllerCard(state, "heart", status),
      );
    }

    function renderEnvironment(state, status) {
      els.track.replaceChildren();
      for (let position = 0; position < TRACK.length; position += 1) {
        const cell = document.createElement("div");
        cell.className = "track-cell";
        cell.classList.toggle("start", position === TRACK.start);
        cell.classList.toggle("anomaly-site", position === TRACK.anomaly);

        if (state.world.salvage.includes(position)) {
          const salvage = document.createElement("span");
          salvage.className = "salvage-marker";
          salvage.title = "可回收残骸";
          cell.appendChild(salvage);
        }
        if (state.world.position === position) {
          const robot = document.createElement("span");
          robot.className = "robot-marker";
          robot.textContent = state.world.direction > 0 ? "›" : "‹";
          robot.title = "机体当前位置";
          cell.appendChild(robot);
        }

        const index = document.createElement("small");
        index.className = "track-index";
        index.textContent = String(position);
        cell.appendChild(index);
        els.track.appendChild(cell);
      }

      els.trackPosition.textContent =
        `位置 ${state.world.position} · ${state.world.direction > 0 ? "向东" : "向西"}`;
      els.moveBtn.disabled =
        state.shutdown ||
        state.clock.paused ||
        Simulation.atBoundary(state) ||
        state.resources.energy < SURVIVAL_RULES.moveEnergy;
      els.reverseBtn.disabled =
        state.shutdown ||
        state.clock.paused ||
        state.resources.energy < SURVIVAL_RULES.reverseEnergy;
      els.pickupBtn.disabled =
        state.shutdown ||
        state.clock.paused ||
        !Simulation.salvageAtPosition(state) ||
        state.resources.energy < SURVIVAL_RULES.pickupEnergy;

      if (Simulation.salvageAtPosition(state)) {
        els.environmentHint.textContent = "当前位置检测到残骸：可回收 8 能源与 5 材料。";
      } else if (Simulation.atBoundary(state)) {
        els.environmentHint.textContent = "前方是轨道边界，需要先掉头。";
      } else if (state.anomaly.revealed && state.world.position === TRACK.anomaly) {
        els.environmentHint.textContent = "频谱传感器正在此处持续报告未知增量。";
      } else {
        els.environmentHint.textContent = "当前位置没有可拾取目标。";
      }

      els.environmentControllerList.replaceChildren(
        createControllerCard(state, "drive", status),
        createControllerCard(state, "pickup", status),
      );
    }

    function createControllerCard(state, id, status) {
      const definition = CONTROLLERS[id];
      const controller = state.controllers[id];
      const card = document.createElement("article");
      card.className = "controller-card";
      card.classList.toggle("locked", !controller.available);

      const head = document.createElement("div");
      head.className = "controller-head";
      const title = document.createElement("h4");
      title.textContent = definition.name;
      const stateLabel = document.createElement("span");
      stateLabel.textContent = !controller.available
        ? "未解锁"
        : !controller.installed
          ? "可安装"
          : controller.mode === "preset"
            ? "预设"
            : "梯形图";
      head.append(title, stateLabel);
      card.appendChild(head);

      const description = document.createElement("p");
      description.textContent = !controller.available
        ? definition.unlockHint
        : !controller.installed
          ? `消耗 ${definition.materialCost} 材料安装。预设程序可靠，但会浪费能源和扫描预算。`
          : controller.mode === "preset"
            ? "固定频率扫描，设备可自行运行。切换梯形图可以按状态执行。"
            : "当前由设备专用梯形图接管。无有效输出时设备保持空闲。";
      card.appendChild(description);

      if (controller.available) {
        const actions = document.createElement("div");
        actions.className = "controller-actions";
        if (!controller.installed) {
          const install = document.createElement("button");
          install.dataset.installController = id;
          install.textContent = `安装 · ${definition.materialCost} 材料`;
          install.disabled = state.resources.material < definition.materialCost;
          actions.appendChild(install);
        } else {
          const segmented = document.createElement("div");
          segmented.className = "segmented";
          const preset = modeButton(id, "preset", "预设", controller.mode === "preset");
          const ladder = modeButton(id, "ladder", "梯形图", controller.mode === "ladder");
          ladder.disabled = !status.readyPrograms[definition.programId];
          segmented.append(preset, ladder);

          const edit = document.createElement("button");
          edit.dataset.openProgram = definition.programId;
          edit.textContent = status.readyPrograms[definition.programId]
            ? "编辑程序"
            : "编写程序";
          actions.append(segmented, edit);
        }
        card.appendChild(actions);
      }

      if (controller.installed) {
        const metrics = document.createElement("div");
        metrics.className = "controller-metrics";
        const load =
          controller.mode === "preset" ? definition.presetLoad : controller.lastScanCost;
        metrics.innerHTML =
          `<span>负载 ${formatNumber(load)}</span>` +
          `<span>动作 ${controller.outputCount}</span>` +
          `<span>耗能 ${formatNumber(controller.energySpent)}</span>`;
        card.appendChild(metrics);
      }
      return card;
    }

    function modeButton(id, mode, label, active) {
      const button = document.createElement("button");
      button.dataset.controllerId = id;
      button.dataset.controllerMode = mode;
      button.classList.toggle("active", active);
      button.textContent = label;
      return button;
    }

    function renderWorkshop(state) {
      els.activeJob.hidden = !state.job;
      if (state.job) {
        els.activeJobName.textContent = JOBS[state.job.id].name;
        els.activeJobTime.textContent = formatTime(state.job.remainingMs);
        const progress = Simulation.jobProgress(state);
        els.jobProgress.style.width = `${progress * 100}%`;
      }

      const ids = ["bench", "generator", "sensor"];
      if (state.anomaly.revealed && !state.anomaly.confirmed) ids.push("anomalySample");
      els.buildList.replaceChildren(...ids.map((id) => createBuildItem(state, id)));
    }

    function createBuildItem(state, id) {
      const definition = JOBS[id];
      const completed =
        (id === "bench" && state.structures.bench) ||
        (id === "generator" && state.structures.generator) ||
        (id === "sensor" && state.structures.sensor) ||
        (id === "anomalySample" && state.anomaly.confirmed);
      const available = Simulation.jobAvailable(state, id);
      const item = document.createElement("article");
      item.className = "build-item";
      item.classList.toggle("completed", completed);
      item.classList.toggle("unavailable", !completed && !available);

      const head = document.createElement("div");
      head.className = "build-head";
      const title = document.createElement("h3");
      title.textContent =
        id === "anomalySample"
          ? `${definition.name} · ${state.anomaly.samples}/3`
          : definition.name;
      const duration = document.createElement("span");
      duration.textContent = completed ? "已完成" : formatTime(definition.durationMs);
      head.append(title, duration);
      item.appendChild(head);

      const copy = document.createElement("p");
      copy.textContent = buildDescription(state, id);
      item.appendChild(copy);

      if (!completed) {
        const actions = document.createElement("div");
        actions.className = "build-actions";
        const button = document.createElement("button");
        button.dataset.startJob = id;
        button.textContent =
          definition.materialCost > 0
            ? `开始 · ${definition.materialCost} 材料`
            : "开始采样";
        button.disabled =
          !available ||
          Boolean(state.job) ||
          state.resources.material < definition.materialCost ||
          state.clock.paused ||
          state.shutdown;
        actions.appendChild(button);
        item.appendChild(actions);
      }
      return item;
    }

    function buildDescription(state, id) {
      if (id === "bench") return "提供设备拆装与维修能力，是后续工坊设施的基础。";
      if (id === "generator") return "从环境温差持续取得少量能源，维持基础物理生产。";
      if (id === "sensor") return "扩展观测频段，用于检查无法解释的环境输出。";
      if (state.world.position !== TRACK.anomaly) {
        return `残阵位于轨道 ${TRACK.anomaly}。需要先把机体移动到现场。`;
      }
      return "记录完整输入与输出。三次一致结果才能排除传感器误差。";
    }

    function renderProgramTabs(state, status) {
      const installed = Object.values(state.controllers).filter(
        (controller) => controller.installed,
      );
      els.diagnostics.hidden = installed.length === 0;
      if (installed.length === 0) return;

      if (!installed.some((controller) => CONTROLLERS[controller.id].programId === selectedProgramId)) {
        selectedProgramId = CONTROLLERS[installed[0].id].programId;
        handlers.onProgramSelect(selectedProgramId);
      }

      els.programTabs.replaceChildren();
      for (const controller of installed) {
        const definition = CONTROLLERS[controller.id];
        const button = document.createElement("button");
        button.className = "program-tab";
        button.classList.toggle("active", definition.programId === selectedProgramId);
        button.dataset.programId = definition.programId;
        button.textContent = definition.name;
        if (!status.readyPrograms[definition.programId]) button.textContent += " · 空";
        els.programTabs.appendChild(button);
      }
    }

    function renderDiagnostics(state, status) {
      const context = CONTROL_CONTEXTS[selectedProgramId];
      if (!context) return;
      els.ladderTitle.textContent = context.name;
      els.ladderDescription.textContent = context.description;
      els.ladderCost.textContent = formatNumber(status.scanCosts[selectedProgramId] ?? 0);

      const signals = status.signals[selectedProgramId] ?? {};
      const evaluation = status.evaluations[selectedProgramId] ?? { outputs: [] };
      els.ioState.textContent = state.clock.paused ? "已暂停" : "实时扫描";
      els.inputBank.replaceChildren(
        ...context.inputs.map((input) =>
          createIoNode(input.id, input.name, Boolean(signals[input.id])),
        ),
      );
      els.outputBank.replaceChildren(
        ...context.outputs.map((output) =>
          createIoNode(
            output.id,
            output.name,
            evaluation.outputs.includes(output.id),
          ),
        ),
      );
    }

    function createIoNode(pin, name, value) {
      const node = document.createElement("div");
      node.className = "io-node";
      node.classList.toggle("hot", value);
      const id = document.createElement("span");
      id.textContent = pin;
      const label = document.createElement("em");
      label.textContent = name;
      const level = document.createElement("strong");
      level.textContent = value ? "1" : "0";
      node.append(id, label, level);
      return node;
    }

    function renderLogs(state) {
      els.logWindow.replaceChildren(
        ...state.logs.map((entry) => {
          const row = document.createElement("div");
          row.className = `log-line ${entry.type}`;
          const time = document.createElement("time");
          time.textContent = formatTime(entry.atMs);
          const text = document.createElement("span");
          text.textContent = entry.text;
          row.append(time, text);
          return row;
        }),
      );
      if (state.logs.length !== previousLogCount) {
        els.logWindow.scrollTop = els.logWindow.scrollHeight;
        previousLogCount = state.logs.length;
      }
    }

    function renderArchive(state) {
      els.archiveStatus.textContent = state.legacyArchive
        ? "旧版进度已复制到只读纪元档案；原 localStorage 键保持不变。"
        : "未发现旧纪元档案。";
    }

    return {
      els,
      ladderElements: {
        addRungBtn: els.addRungBtn,
        addOpenContactBtn: els.addOpenContactBtn,
        addClosedContactBtn: els.addClosedContactBtn,
        deleteNodeBtn: els.deleteNodeBtn,
        moveLeftBtn: els.moveLeftBtn,
        moveRightBtn: els.moveRightBtn,
        contactOpSelect: els.contactOpSelect,
        pinSelect: els.pinSelect,
        coilSelect: els.coilSelect,
        rungList: els.rungList,
      },
      render,
      selectWorkspace,
      openProgram,
      getSelectedProgramId: () => selectedProgramId,
    };
  }

  function cacheElements() {
    const byId = (id) => document.getElementById(id);
    return {
      stageReadout: byId("stageReadout"),
      elapsedReadout: byId("elapsedReadout"),
      coreReadout: byId("coreReadout"),
      energyReadout: byId("energyReadout"),
      materialReadout: byId("materialReadout"),
      controlLoadReadout: byId("controlLoadReadout"),
      objectiveText: byId("objectiveText"),
      stageProgress: byId("stageProgress"),
      pauseBtn: byId("pauseBtn"),
      workspaceTabs: Array.from(document.querySelectorAll(".workspace-tab")),
      workspaceViews: Array.from(document.querySelectorAll(".workspace-view")),
      environmentTab: byId("environmentTab"),
      workshopTab: byId("workshopTab"),
      anomalyTab: byId("anomalyTab"),
      coreGauge: byId("coreGauge"),
      coreState: byId("coreState"),
      heartbeatBtn: byId("heartbeatBtn"),
      heartbeatHint: byId("heartbeatHint"),
      emergencyStatus: byId("emergencyStatus"),
      emergencyCharge: byId("emergencyCharge"),
      bodyControllerList: byId("bodyControllerList"),
      track: byId("track"),
      trackPosition: byId("trackPosition"),
      moveBtn: byId("moveBtn"),
      reverseBtn: byId("reverseBtn"),
      pickupBtn: byId("pickupBtn"),
      environmentHint: byId("environmentHint"),
      environmentControllerList: byId("environmentControllerList"),
      activeJob: byId("activeJob"),
      activeJobName: byId("activeJobName"),
      activeJobTime: byId("activeJobTime"),
      jobProgress: byId("jobProgress"),
      buildList: byId("buildList"),
      diagnostics: byId("diagnostics"),
      programTabs: byId("programTabs"),
      ladderTitle: byId("ladderTitle"),
      ladderDescription: byId("ladderDescription"),
      ladderCost: byId("ladderCost"),
      addRungBtn: byId("addRungBtn"),
      addOpenContactBtn: byId("addOpenContactBtn"),
      addClosedContactBtn: byId("addClosedContactBtn"),
      deleteNodeBtn: byId("deleteNodeBtn"),
      moveLeftBtn: byId("moveLeftBtn"),
      moveRightBtn: byId("moveRightBtn"),
      contactOpSelect: byId("contactOpSelect"),
      pinSelect: byId("pinSelect"),
      coilSelect: byId("coilSelect"),
      rungList: byId("rungList"),
      ioState: byId("ioState"),
      inputBank: byId("inputBank"),
      outputBank: byId("outputBank"),
      logWindow: byId("logWindow"),
      exportPlanBtn: byId("exportPlanBtn"),
      restartBtn: byId("restartBtn"),
      newGameBtn: byId("newGameBtn"),
      archiveStatus: byId("archiveStatus"),
    };
  }

  function formatTime(milliseconds) {
    const totalSeconds = Math.ceil(Math.max(0, milliseconds) / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function formatNumber(value) {
    if (Math.abs(value) >= 100) return String(Math.round(value));
    return Number(value).toFixed(1).replace(/\.0$/, "");
  }

  global.SilidoxUI = Object.freeze({ create: createUI });
})(globalThis);
