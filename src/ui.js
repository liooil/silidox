// DOM rendering and interaction wiring for the progressive workspace interface.
(function defineSilidoxUI(global) {
  const {
    CONTROLLERS,
    CONTROL_CONTEXTS,
    FOREST_RULES,
    JOBS,
    MINING_RULES,
    RESOURCE_LIMITS,
    STAGE_LABELS,
    SURVIVAL_RULES,
    TRACK,
  } = global.SilidoxData;
  const Simulation = global.SilidoxSimulation;

  function createUI(handlers) {
    const els = cacheElements();
    let selectedWorkspace = "body";
    let selectedProgramId = "body.heart";
    const renderSignatures = new WeakMap();

    wireStaticEvents();

    function wireStaticEvents() {
      for (const tab of els.workspaceTabs) {
        tab.addEventListener("click", () => selectWorkspace(tab.dataset.workspace));
      }

      // pointerdown: action fires at press, so a 250ms re-render cannot swallow the
      // click between mousedown and mouseup by replacing the button element.
      els.pauseBtn.addEventListener("pointerdown", () => handlers.onAction("togglePause"));
      els.heartbeatBtn.addEventListener("pointerdown", () => handlers.onPrimaryAction());
      els.moveBtn.addEventListener("pointerdown", () => handlers.onAction("move"));
      els.reverseBtn.addEventListener("pointerdown", () => handlers.onAction("reverse"));
      els.pickupBtn.addEventListener("pointerdown", () => handlers.onAction("harvest"));
      els.burnWoodBtn.addEventListener("pointerdown", () => handlers.onAction("burnWood"));
      els.digBtn.addEventListener("pointerdown", () => handlers.onAction("digDown"));
      els.ascendBtn.addEventListener("pointerdown", () => handlers.onAction("ascend"));
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
      els.bodyControllerList.addEventListener("pointerdown", controllerHandler);
      els.environmentControllerList.addEventListener("pointerdown", controllerHandler);

      els.buildList.addEventListener("pointerdown", (event) => {
        const button = event.target.closest("[data-start-job]");
        if (button) handlers.onAction("startJob", button.dataset.startJob);
      });

      els.programTabs.addEventListener("pointerdown", (event) => {
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
      els.woodReadout.textContent = formatNumber(state.resources.wood);
      els.materialReadout.textContent = String(Math.floor(state.resources.material));
      els.oreReadout.textContent = String(Math.floor(state.resources.ore));
      els.partsReadout.textContent = String(Math.floor(state.resources.parts));
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

      renderControllerCards(els.bodyControllerList, state, status, ["heart"]);
    }

    function renderEnvironment(state, status) {
      const miningUnlocked = state.unlocks.mining;
      const visibleDepth = miningUnlocked ? MINING_RULES.maxDepth : 0;
      els.environmentTitle.textContent = miningUnlocked ? "森林与地下剖面" : "森林地表";
      els.environmentDescription.textContent = miningUnlocked
        ? "地表负责移动与伐木；选择横向位置向下开掘，沿永久竖井进入更深岩层。"
        : "地表没有障碍物。移动、掉头并反复伐木，在建设材料与燃料能源之间分配木材。";
      els.trackEyebrow.textContent = miningUnlocked ? "二维环境观测" : "地表观测";
      els.trackTitle.textContent = miningUnlocked ? "森林地层剖面" : "林间横断带";
      els.track.classList.toggle("mining-unlocked", miningUnlocked);
      els.track.setAttribute(
        "aria-label",
        miningUnlocked ? "森林和地下二维剖面" : "森林地表",
      );
      const target = Simulation.digTarget(state);
      const progress = Simulation.digProgress(state);
      const gridKey = environmentGridKey(state);
      if (renderSignatures.get(els.track) !== gridKey) {
        renderSignatures.set(els.track, gridKey);
        rebuildEnvironmentGrid(state, target, progress, visibleDepth);
      }

      els.trackPosition.textContent =
        `横向 ${state.world.position} · ${state.world.depth === 0 ? "地表" : `深度 ${state.world.depth}`}`;
      els.moveBtn.disabled =
        state.shutdown ||
        state.clock.paused ||
        state.world.depth > 0 ||
        Simulation.atBoundary(state) ||
        state.resources.energy < SURVIVAL_RULES.moveEnergy;
      els.reverseBtn.disabled =
        state.shutdown ||
        state.clock.paused ||
        state.world.depth > 0 ||
        state.resources.energy < SURVIVAL_RULES.reverseEnergy;
      const treeHere = Simulation.treeAtPosition(state);
      els.pickupBtn.disabled =
        state.shutdown ||
        state.clock.paused ||
        !Simulation.harvestAvailable(state) ||
        state.resources.energy < SURVIVAL_RULES.harvestEnergy;
      els.pickupBtn.textContent = "伐木";
      els.burnWoodBtn.disabled =
        state.shutdown ||
        state.clock.paused ||
        state.resources.wood < FOREST_RULES.manualBurnWood ||
        state.resources.energy > RESOURCE_LIMITS.energy - FOREST_RULES.energyPerWood + 0.0001;
      els.burnWoodBtn.textContent =
        `燃烧 ${FOREST_RULES.manualBurnWood} 木材 · +${FOREST_RULES.energyPerWood} 能源`;
      els.digBtn.hidden = !miningUnlocked;
      els.ascendBtn.hidden = !miningUnlocked;
      els.digBtn.disabled =
        state.shutdown || state.clock.paused || !Simulation.canDigDown(state);
      els.digBtn.textContent = progress.open ? "沿竖井下行" : "向下掘进";
      els.ascendBtn.disabled =
        state.shutdown ||
        state.clock.paused ||
        state.world.depth <= 0 ||
        state.resources.energy < MINING_RULES.verticalMoveEnergy;

      els.miningReadout.hidden = !miningUnlocked;
      if (miningUnlocked) {
        if (!target) {
          els.miningTarget.textContent = "已达当前极限深度";
          els.miningProgressText.textContent = `${MINING_RULES.maxDepth} / ${MINING_RULES.maxDepth}`;
          els.miningProgressBar.style.width = "100%";
        } else if (progress.open) {
          els.miningTarget.textContent = `下方通道 · 横向 ${target.position} / 深度 ${target.depth}`;
          els.miningProgressText.textContent = "已开通";
          els.miningProgressBar.style.width = "100%";
        } else {
          els.miningTarget.textContent = `目标岩层 · 横向 ${target.position} / 深度 ${target.depth}`;
          els.miningProgressText.textContent = `${progress.current} / ${progress.required}`;
          els.miningProgressBar.style.width = `${progress.ratio * 100}%`;
        }
      }

      const atAnomaly =
        state.anomaly.revealed &&
        state.world.position === TRACK.anomaly &&
        state.world.depth === TRACK.anomalyDepth;
      if (atAnomaly) {
        els.environmentHint.textContent = "频谱传感器确认异常源就在当前地下空腔。可在工坊开始采样。";
      } else if (state.world.depth > 0 && !target) {
        els.environmentHint.textContent = "已经到达当前掘进头的极限深度。沿竖井上升后可以选择其他横向位置。";
      } else if (state.world.depth > 0 && progress.open) {
        els.environmentHint.textContent = "下方竖井已经开通，可以继续下降或返回地表。";
      } else if (state.world.depth > 0 && target) {
        els.environmentHint.textContent =
          `下方是深度 ${target.depth} 岩层，需要完成 ${progress.required} 次掘进。`;
      } else if (treeHere) {
        els.environmentHint.textContent =
          `当前位置有成熟树木：伐木可得 ${FOREST_RULES.woodPerTree} 木材。木材既是建设材料，也是当前燃料。`;
      } else if (Simulation.atBoundary(state)) {
        els.environmentHint.textContent = "前方是森林边界，需要先掉头。";
      } else if (miningUnlocked) {
        els.environmentHint.textContent = "在地表选择横向位置，然后向下掘进；矿物与坑道状态会永久保留。";
      } else {
        const respawnMs = Simulation.nextTreeRespawnMs(state);
        els.environmentHint.textContent =
          respawnMs > 0
            ? `当前位置没有可采集目标。下一株树木约 ${Math.ceil(respawnMs / 1000)} 秒后恢复。`
            : "当前位置没有成熟树木。继续沿森林地表移动。";
      }

      const controllerIds = ["drive", "pickup"];
      if (miningUnlocked) controllerIds.push("excavator");
      renderControllerCards(els.environmentControllerList, state, status, controllerIds);
    }

    function rebuildEnvironmentGrid(state, target, progress, visibleDepth) {
      els.track.replaceChildren();
      for (let depth = 0; depth <= visibleDepth; depth += 1) {
        for (let position = 0; position < TRACK.length; position += 1) {
          const cell = document.createElement("div");
          const excavated = Simulation.cellExcavated(state, position, depth);
          const isTarget = target?.position === position && target.depth === depth;
          cell.className = "track-cell";
          cell.classList.toggle("surface-cell", depth === 0);
          cell.classList.toggle("subsurface-cell", depth > 0);
          cell.classList.toggle("solid", depth > 0 && !excavated);
          cell.classList.toggle("excavated", depth > 0 && excavated);
          cell.classList.toggle("start", depth === 0 && position === TRACK.start);
          cell.classList.toggle("dig-target", isTarget);
          cell.classList.toggle(
            "anomaly-site",
            state.anomaly.revealed &&
              position === TRACK.anomaly &&
              depth === TRACK.anomalyDepth,
          );
          cell.dataset.depth = String(depth);

          if (depth === 0 && state.world.trees.includes(position)) {
            const tree = document.createElement("span");
            tree.className = "tree-marker";
            tree.title = "成熟树木";
            cell.appendChild(tree);
          }
          if (
            state.anomaly.revealed &&
            position === TRACK.anomaly &&
            depth === TRACK.anomalyDepth
          ) {
            const anomaly = document.createElement("span");
            anomaly.className = "buried-anomaly-marker";
            anomaly.textContent = "Δ";
            anomaly.title = "地下异常源";
            cell.appendChild(anomaly);
          }
          if (state.world.position === position && state.world.depth === depth) {
            const robot = document.createElement("span");
            robot.className = "robot-marker";
            robot.textContent = depth > 0 ? "↓" : state.world.direction > 0 ? "›" : "‹";
            robot.title = "机体当前位置";
            cell.appendChild(robot);
          }
          if (isTarget && !excavated && progress.current > 0) {
            const fill = document.createElement("i");
            fill.className = "dig-fill";
            fill.style.height = `${progress.ratio * 100}%`;
            cell.appendChild(fill);
          }

          if (depth === 0) {
            const index = document.createElement("small");
            index.className = "track-index";
            index.textContent = String(position);
            cell.appendChild(index);
          }
          if (position === 0) {
            const depthLabel = document.createElement("small");
            depthLabel.className = "depth-label";
            depthLabel.textContent = depth === 0 ? "地表" : `-${depth}`;
            cell.appendChild(depthLabel);
          }
          els.track.appendChild(cell);
        }
      }
    }

    function environmentGridKey(state) {
      const world = state.world;
      const target = Simulation.digTarget(state);
      return [
        state.unlocks.mining,
        world.position,
        world.depth,
        world.direction,
        world.trees.join(","),
        world.excavated.join(","),
        JSON.stringify(world.digProgress),
        state.anomaly.revealed,
        target ? `${target.position}:${target.depth}` : "none",
      ].join("|");
    }

    function renderControllerCards(container, state, status, ids) {
      const signature = JSON.stringify(
        ids.map((id) => {
          const controller = state.controllers[id];
          return {
            id,
            available: controller.available,
            installed: controller.installed,
            mode: controller.mode,
            lastScanCost: controller.lastScanCost,
            outputCount: controller.outputCount,
            energySpent: controller.energySpent,
            affordable: canAfford(state, CONTROLLERS[id]),
            ready: status.readyPrograms[CONTROLLERS[id].programId],
            scanCost: status.scanCosts[CONTROLLERS[id].programId],
          };
        }),
      );
      if (renderSignatures.get(container) === signature) return;
      renderSignatures.set(container, signature);
      container.replaceChildren(...ids.map((id) => createControllerCard(state, id, status)));
    }

    function createControllerCard(state, id, status) {
      const definition = CONTROLLERS[id];
      const controller = state.controllers[id];
      const card = document.createElement("article");
      card.className = "controller-card";
      card.dataset.controllerId = id;
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
            : controller.mode === "manual"
              ? "手动"
              : "梯形图";
      head.append(title, stateLabel);
      card.appendChild(head);

      const description = document.createElement("p");
      description.textContent = !controller.available
        ? definition.unlockHint
        : !controller.installed
          ? `安装消耗 ${costLabel(definition)}。预设程序可靠，但会浪费能源和扫描预算。`
          : controller.mode === "manual"
            ? "自动化已暂停，设备由手动操作控制。再次切换即可恢复程序。"
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
          install.textContent = `安装 · ${costLabel(definition)}`;
          install.disabled = !canAfford(state, definition);
          actions.appendChild(install);
        } else {
          const segmented = document.createElement("div");
          segmented.className = "segmented";
          const manual = modeButton(id, "manual", "手动", controller.mode === "manual");
          const preset = modeButton(id, "preset", "预设", controller.mode === "preset");
          const ladder = modeButton(id, "ladder", "梯形图", controller.mode === "ladder");
          ladder.disabled = !status.readyPrograms[definition.programId];
          segmented.append(manual, preset, ladder);

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
          controller.mode === "preset"
            ? definition.presetLoad
            : controller.mode === "manual"
              ? 0
              : controller.lastScanCost;
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

      const ids = ["mineHead", "bench", "generator", "sensor"];
      if (state.anomaly.revealed && !state.anomaly.confirmed) ids.push("anomalySample");
      if (state.anomaly.confirmed) ids.push("processor");
      const signature = JSON.stringify({
        ids,
        structures: state.structures,
        jobId: state.job?.id ?? null,
        anomaly: state.anomaly,
        atAnomaly:
          state.world.position === TRACK.anomaly && state.world.depth === TRACK.anomalyDepth,
      });
      if (renderSignatures.get(els.buildList) !== signature) {
        renderSignatures.set(els.buildList, signature);
        els.buildList.replaceChildren(...ids.map((id) => createBuildItem(state, id)));
      }
      updateBuildItemsLive(state);
    }

    function updateBuildItemsLive(state) {
      for (const button of els.buildList.querySelectorAll("[data-start-job]")) {
        const id = button.dataset.startJob;
        const definition = JOBS[id];
        const available = Simulation.jobAvailable(state, id);
        button.disabled =
          !available ||
          Boolean(state.job) ||
          !canAfford(state, definition) ||
          state.clock.paused ||
          state.shutdown;
      }
    }

    function createBuildItem(state, id) {
      const definition = JOBS[id];
      const completed =
        (id === "mineHead" && state.structures.mineHead) ||
        (id === "bench" && state.structures.bench) ||
        (id === "generator" && state.structures.generator) ||
        (id === "sensor" && state.structures.sensor) ||
        (id === "anomalySample" && state.anomaly.confirmed) ||
        (id === "processor" && state.structures.processor);
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
        button.textContent = definition.cost ? `开始 · ${costLabel(definition)}` : "开始采样";
        button.disabled =
          !available ||
          Boolean(state.job) ||
          !canAfford(state, definition) ||
          state.clock.paused ||
          state.shutdown;
        actions.appendChild(button);
        item.appendChild(actions);
      }
      return item;
    }

    function buildDescription(state, id) {
      if (id === "mineHead") return "把环境模型从地表横线扩展为可向下开掘的二维剖面。";
      if (id === "bench") return "使用地下结构料建立稳定设备基座，是后续工坊设施的基础。";
      if (id === "generator") {
        return `能源低于 ${FOREST_RULES.generatorReserveTarget} 时自动消耗木材供能，并保留 ${FOREST_RULES.generatorWoodReserve} 木材作为应急燃料。`;
      }
      if (id === "sensor") return "扩展观测频段，用于检查无法解释的环境输出。";
      if (id === "processor") {
        return "把矿石加工成标准部件。部件是灵性接口与内景部件的基础材料。";
      }
      if (
        state.world.position !== TRACK.anomaly ||
        state.world.depth !== TRACK.anomalyDepth
      ) {
        return `残阵位于横向 ${TRACK.anomaly}、深度 ${TRACK.anomalyDepth}。需要开掘到现场。`;
      }
      return "记录完整输入与输出。三次一致结果才能排除传感器误差。";
    }

    function renderProgramTabs(state, status) {
      const installed = Object.values(state.controllers).filter(
        (controller) => controller.installed,
      );
      const ready = Object.keys(status.readyPrograms)
        .filter((programId) => status.readyPrograms[programId])
        .sort()
        .join(",");
      const key = `${installed
        .map((controller) => controller.id)
        .sort()
        .join(",")}|${ready}|${selectedProgramId}`;
      if (renderSignatures.get(els.programTabs) === key) return;
      renderSignatures.set(els.programTabs, key);

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
      const signals = status.signals[selectedProgramId] ?? {};
      const evaluation = status.evaluations[selectedProgramId] ?? { outputs: [] };
      const controllerId = context.controllerId;
      const controllerMode = controllerId
        ? state.controllers[controllerId]?.mode
        : null;
      els.ladderTitle.textContent = context.name;
      els.ladderDescription.textContent = context.description;
      els.ladderCost.textContent = formatNumber(status.scanCosts[selectedProgramId] ?? 0);
      els.ioState.textContent = state.clock.paused
        ? "已暂停"
        : controllerMode === "manual"
          ? "手动暂停"
          : "实时扫描";

      const key = `${selectedProgramId}|${state.clock.paused}|${controllerMode}|${JSON.stringify(signals)}|${evaluation.outputs.join(",")}`;
      if (renderSignatures.get(els.inputBank) === key) return;
      renderSignatures.set(els.inputBank, key);
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
      const key = String(state.logs.length);
      if (renderSignatures.get(els.logWindow) === key) return;
      renderSignatures.set(els.logWindow, key);
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
      els.logWindow.scrollTop = els.logWindow.scrollHeight;
    }

    function renderArchive(state) {
      const key = String(Boolean(state.legacyArchive));
      if (renderSignatures.get(els.archiveStatus) === key) return;
      renderSignatures.set(els.archiveStatus, key);
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
      woodReadout: byId("woodReadout"),
      materialReadout: byId("materialReadout"),
      oreReadout: byId("oreReadout"),
      partsReadout: byId("partsReadout"),
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
      environmentTitle: byId("environmentTitle"),
      environmentDescription: byId("environmentDescription"),
      trackEyebrow: byId("trackEyebrow"),
      trackTitle: byId("trackTitle"),
      trackPosition: byId("trackPosition"),
      moveBtn: byId("moveBtn"),
      reverseBtn: byId("reverseBtn"),
      pickupBtn: byId("pickupBtn"),
      burnWoodBtn: byId("burnWoodBtn"),
      digBtn: byId("digBtn"),
      ascendBtn: byId("ascendBtn"),
      miningReadout: byId("miningReadout"),
      miningTarget: byId("miningTarget"),
      miningProgressText: byId("miningProgressText"),
      miningProgressBar: byId("miningProgressBar"),
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

  function costLabel(definition) {
    const cost = definition.cost;
    if (!cost) return "无资源";
    const names = {
      wood: "木材",
      material: "结构料",
      ore: "矿石",
      parts: "部件",
    };
    return `${cost.amount} ${names[cost.resource] ?? cost.resource}`;
  }

  function canAfford(state, definition) {
    const cost = definition.cost;
    return !cost || (state.resources[cost.resource] ?? 0) >= cost.amount;
  }

  global.SilidoxUI = Object.freeze({ create: createUI });
})(globalThis);
