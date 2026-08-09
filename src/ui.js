// DOM rendering and interaction wiring for the progressive workspace interface.
(function defineSilidoxUI(global) {
  const {
    CONTROLLERS,
    CONTROL_CONTEXTS,
    FOREST_RULES,
    INNER_RULES,
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
      els.pickupBtn.addEventListener("pointerdown", () => handlers.onAction("pickup"));
      els.burnWoodBtn.addEventListener("pointerdown", () => handlers.onAction("burnWood"));
      els.digLeftBtn.addEventListener("pointerdown", () => handlers.onAction("digLeft"));
      els.digRightBtn.addEventListener("pointerdown", () => handlers.onAction("digRight"));
      els.ascendBtn.addEventListener("pointerdown", () => handlers.onAction("ascend"));
      els.innerPulseBtn.addEventListener("pointerdown", () => handlers.onAction("innerPulse"));
      els.mineTree.addEventListener("pointerdown", (event) => {
        const branch = event.target.closest("[data-enter-branch]")?.dataset.enterBranch;
        if (branch === "L") handlers.onAction("digLeft");
        if (branch === "R") handlers.onAction("digRight");
      });
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
      renderResearch(state);
      renderInner(state);
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
      els.innerTab.hidden = !state.unlocks.inner;

      const unlocked =
        selectedWorkspace === "body" ||
        (selectedWorkspace === "environment" && state.unlocks.environment) ||
        (selectedWorkspace === "workshop" && state.unlocks.workshop) ||
        (selectedWorkspace === "anomaly" && state.unlocks.anomaly) ||
        (selectedWorkspace === "inner" && state.unlocks.inner);
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
      const atMineEntrance =
        state.world.depth > 0 || state.world.position === TRACK.mineEntrance;
      els.environmentTitle.textContent = miningUnlocked ? "森林与分支矿井" : "森林地表";
      els.environmentDescription.textContent = miningUnlocked
        ? "抵达固定矿井入口后，从每个节点选择左下或右下支路。矿路、产出与掘进进度永久保留。"
        : "初期沿森林地表拾取掉落树枝。成熟树木再生很慢，后续伐木只能作为长期补给。";
      els.trackEyebrow.textContent = "地表观测";
      els.trackTitle.textContent = miningUnlocked ? "林间横断带与矿井入口" : "林间横断带";
      els.track.setAttribute("aria-label", "森林地表");
      const gridKey = environmentGridKey(state);
      if (renderSignatures.get(els.track) !== gridKey) {
        renderSignatures.set(els.track, gridKey);
        rebuildSurfaceTrack(state);
      }
      const treeKey = mineTreeKey(state);
      if (renderSignatures.get(els.mineTree) !== treeKey) {
        renderSignatures.set(els.mineTree, treeKey);
        rebuildMineTree(state);
      }

      els.trackPosition.textContent =
        state.world.depth === 0
          ? `横向 ${state.world.position} · 地表`
          : `矿路 ${formatMinePath(state.world.minePath)} · 深度 ${state.world.depth}`;
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
      const branchHere = Simulation.branchAtPosition(state);
      const treeHere = Simulation.treeAtPosition(state);
      els.pickupBtn.disabled =
        state.shutdown ||
        state.clock.paused ||
        !Simulation.pickupAvailable(state) ||
        state.resources.energy < SURVIVAL_RULES.pickupEnergy;
      els.pickupBtn.textContent = branchHere ? "拾取树枝" : treeHere ? "伐木" : "搜集";
      els.burnWoodBtn.disabled =
        state.shutdown ||
        state.clock.paused ||
        state.resources.wood < FOREST_RULES.manualBurnWood ||
        state.resources.energy > RESOURCE_LIMITS.energy - FOREST_RULES.energyPerWood + 0.0001;
      els.burnWoodBtn.textContent =
        `燃烧 ${FOREST_RULES.manualBurnWood} 木材 · +${FOREST_RULES.energyPerWood} 能源`;
      els.digLeftBtn.hidden = !miningUnlocked;
      els.digRightBtn.hidden = !miningUnlocked;
      els.ascendBtn.hidden = !miningUnlocked;
      const leftProgress = Simulation.mineBranchProgress(state, "L");
      const rightProgress = Simulation.mineBranchProgress(state, "R");
      els.digLeftBtn.disabled =
        state.shutdown || state.clock.paused || !Simulation.canDigBranch(state, "L");
      els.digRightBtn.disabled =
        state.shutdown || state.clock.paused || !Simulation.canDigBranch(state, "R");
      els.digLeftBtn.textContent = leftProgress.open ? "进入左下支路" : "向左下掘进";
      els.digRightBtn.textContent = rightProgress.open ? "进入右下支路" : "向右下掘进";
      els.ascendBtn.disabled =
        state.shutdown ||
        state.clock.paused ||
        state.world.depth <= 0 ||
        state.resources.energy < MINING_RULES.verticalMoveEnergy;

      els.mineViewport.hidden = !miningUnlocked;
      if (miningUnlocked) {
        els.minePathReadout.textContent = formatMinePath(state.world.minePath);
        els.mineDepthReadout.textContent = `深度 ${state.world.depth} / ${MINING_RULES.maxDepth}`;
        const unavailableReason = !atMineEntrance
          ? "未抵达入口"
          : state.world.depth >= MINING_RULES.maxDepth
            ? "深度限制"
            : null;
        renderBranchProgress("左下", leftProgress, els.leftMiningTarget, els.leftMiningProgressText, els.leftMiningProgressBar, unavailableReason);
        renderBranchProgress("右下", rightProgress, els.rightMiningTarget, els.rightMiningProgressText, els.rightMiningProgressBar, unavailableReason);
      }

      const atAnomaly =
        state.anomaly.revealed &&
        state.world.minePath === TRACK.anomalyPath;
      const nextBranchRespawnMs = Simulation.nextBranchRespawnMs(state);
      if (atAnomaly) {
        els.environmentHint.textContent = "频谱传感器确认异常源就在当前地下空腔。可在工坊开始采样。";
      } else if (state.world.depth >= MINING_RULES.maxDepth) {
        els.environmentHint.textContent = "已经到达掘进头的极限深度。向上后开辟另一条支路。";
      } else if (state.world.depth > 0) {
        els.environmentHint.textContent = "当前节点可向左下或右下继续开掘；向上可以改走已有支路。";
      } else if (branchHere) {
        els.environmentHint.textContent =
          `地面有掉落树枝：拾取可得 ${FOREST_RULES.woodPerBranch} 木材，约 ${Math.ceil(FOREST_RULES.branchRespawnMs / 1000)} 秒后再生。`;
      } else if (treeHere) {
        els.environmentHint.textContent =
          `当前位置有成熟树木：伐木可得 ${FOREST_RULES.woodPerTree} 木材，但下一轮再生很慢。`;
      } else if (Simulation.atBoundary(state)) {
        els.environmentHint.textContent = "前方是森林边界，需要先掉头。";
      } else if (miningUnlocked && !atMineEntrance) {
        els.environmentHint.textContent = `矿井入口位于横向 ${TRACK.mineEntrance}。先沿地表抵达入口。`;
      } else if (miningUnlocked) {
        els.environmentHint.textContent = "矿井入口已就位。选择左下或右下，开辟第一条矿路。";
      } else if (state.world.branches.length > 0) {
        els.environmentHint.textContent = "继续沿森林地表移动，寻找掉落的树枝；已拾取的树枝会较快再生。";
      } else {
        const treeRespawnMs = Simulation.nextTreeRespawnMs(state);
        els.environmentHint.textContent =
          nextBranchRespawnMs > 0
            ? `树枝会在约 ${Math.ceil(nextBranchRespawnMs / 1000)} 秒后重新掉落；成熟树木仍需更久再生。`
            : treeRespawnMs > 0
              ? `掉落树枝已经收集完。下一株树木约 ${Math.ceil(treeRespawnMs / 1000)} 秒后再生。`
              : "当前没有可拾取木材。";
      }

      const controllerIds = ["drive", "pickup"];
      if (miningUnlocked) controllerIds.push("excavator");
      renderControllerCards(els.environmentControllerList, state, status, controllerIds);
    }
    function renderResearch(state) {
      const research = state.research ?? {
        modelVersion: 0,
        completed: false,
        observations: [],
        conclusions: [],
      };
      els.researchModelStatus.textContent = research.completed
        ? `模型 v${research.modelVersion}`
        : "尚未整理";
      els.researchDescription.textContent = research.completed
        ? "模型只描述可重复观测与未知边界，不把未知场伪装成已经掌握的资源。"
        : "先用标准部件整理观测数据，再决定是否能制造主体接口。模型不会把未知场直接显示成可用资源。";

      const records = research.completed
        ? [...research.observations, ...research.conclusions]
        : [];
      const signature = JSON.stringify({
        completed: research.completed,
        modelVersion: research.modelVersion,
        records,
      });
      if (renderSignatures.get(els.researchObservationList) === signature) return;
      renderSignatures.set(els.researchObservationList, signature);
      if (records.length === 0) {
        const empty = document.createElement("p");
        empty.className = "observation-empty";
        empty.textContent = "尚无第一版模型。加工台完成标准部件后，可以整理残阵响应。";
        els.researchObservationList.replaceChildren(empty);
        return;
      }
      els.researchObservationList.replaceChildren(
        ...records.map((record) => {
          const item = document.createElement("div");
          item.className = "observation-item";
          const label = document.createElement("span");
          label.textContent = record.label;
          const value = document.createElement("strong");
          value.textContent = record.value;
          const confidence = document.createElement("small");
          confidence.textContent =
            record.confidence === "confirmed"
              ? "已确认"
              : record.confidence === "provisional"
                ? "暂定"
                : "未知";
          item.append(label, value, confidence);
          return item;
        }),
      );
    }

    function renderInner(state) {
      const metrics = Simulation.innerMetrics(state);
      const available = Boolean(metrics);
      const pulseCount = metrics?.manualPulses ?? 0;
      els.innerPulseCount.textContent = `${pulseCount} / ${INNER_RULES.manualPulsesRequired}`;
      els.innerPulseBtn.disabled =
        !available ||
        state.clock.paused ||
        state.shutdown ||
        metrics.active ||
        pulseCount >= INNER_RULES.manualPulsesRequired ||
        state.resources.energy < INNER_RULES.pulseEnergy;
      els.innerPulseBtn.querySelector("strong").textContent = metrics?.active
        ? "引灵脉冲运行中"
        : "低功率引灵脉冲";
      els.innerPulseBtn.querySelector("span").textContent = metrics?.active
        ? `剩余 ${formatTime(metrics.pulseMs)}，请等待本次观测完成`
        : `消耗 ${formatNumber(INNER_RULES.pulseEnergy)} 能源，运行 ${formatTime(INNER_RULES.pulseDurationMs)}`;
      els.innerHint.textContent = !available
        ? "灵触接口尚未接入内景内核。"
        : metrics.active
          ? "脉冲运行中：只读取响应，不追加新的控制命令。"
          : pulseCount < INNER_RULES.manualPulsesRequired
            ? "完成三次脉冲，记录灵触响应。"
            : "三次低功率引灵已经完成，可以继续观察稳定度和故障证据。";

      const touch = metrics?.touch;
      const refine = metrics?.refine;
      const dantian = metrics?.dantian;
      els.innerTouchPressure.textContent = touch ? formatNumber(touch.pressure) : "—";
      els.innerRefinePressure.textContent = refine ? formatNumber(refine.pressure) : "—";
      els.innerDantianPressure.textContent = dantian ? formatNumber(dantian.pressure) : "—";
      els.innerPurity.textContent = touch ? `${formatNumber(touch.purity * 100)}%` : "—";
      els.innerTemperature.textContent = refine ? formatNumber(refine.temperature) : "—";
      els.innerStability.textContent = refine ? `${formatNumber(refine.stability)}%` : "—";
      els.innerFaultText.textContent = !metrics
        ? "尚未运行引灵脉冲。"
        : metrics.faults.length > 0
          ? `当前故障：${metrics.faults.join("、")}`
          : "当前没有可解释故障。继续记录脉冲后的变化。";
      els.innerEventList.replaceChildren(
        ...(metrics?.events ?? []).slice(-5).map((event) => {
          const item = document.createElement("div");
          item.className = "inner-event-item";
          item.textContent = event.text || `${event.kind} @ ${event.node}`;
          return item;
        }),
      );

      const observations = metrics?.observations ?? [];
      els.innerObservationStatus.textContent = `${observations.length} / ${INNER_RULES.manualPulsesRequired}`;
      if (observations.length === 0) {
        const empty = document.createElement("p");
        empty.className = "observation-empty";
        empty.textContent = "完成一次低功率脉冲后，这里会保存可复查的读数。";
        els.innerObservationList.replaceChildren(empty);
      } else {
        els.innerObservationList.replaceChildren(
          ...observations.map((observation) => {
            const item = document.createElement("article");
            item.className = "inner-observation-item";

            const heading = document.createElement("div");
            heading.className = "inner-observation-heading";
            const title = document.createElement("strong");
            title.textContent = `第 ${observation.pulse} 次脉冲`;
            const status = document.createElement("span");
            status.textContent =
              observation.faults.length > 0
                ? `故障 ${observation.faults.length}`
                : "未见故障";
            heading.append(title, status);

            const pressure = document.createElement("p");
            pressure.textContent =
              `灵触 ${formatNumber(observation.touchPressure)} · ` +
              `炼化 ${formatNumber(observation.refinePressure)} · ` +
              `丹田 ${formatNumber(observation.dantianPressure)}`;

            const condition = document.createElement("small");
            condition.textContent =
              `纯度 ${formatNumber(observation.purity * 100)}% · ` +
              `温度 ${formatNumber(observation.temperature)} · ` +
              `稳定 ${formatNumber(observation.stability)}%`;

            item.append(heading, pressure, condition);
            return item;
          }),
        );
      }
    }


    function renderBranchProgress(label, progress, target, text, bar, unavailableReason) {
      if (unavailableReason || stateAtDepthLimit(progress)) {
        target.textContent = `${label} · ${unavailableReason ?? "不可用"}`;
        text.textContent = "已封锁";
        bar.style.width = "100%";
      } else if (progress.open) {
        target.textContent = `${label} · 已开通`;
        text.textContent = "可进入";
        bar.style.width = "100%";
      } else {
        target.textContent = `${label} · 目标岩层`;
        text.textContent = `${progress.current} / ${progress.required}`;
        bar.style.width = `${progress.ratio * 100}%`;
      }
    }

    function stateAtDepthLimit(progress) {
      return !progress.open && progress.required === 0;
    }

    function rebuildSurfaceTrack(state) {
      els.track.replaceChildren();
      for (let position = 0; position < TRACK.length; position += 1) {
          const cell = document.createElement("div");
          cell.className = "track-cell surface-cell";
          cell.classList.toggle("start", position === TRACK.start);
          cell.classList.toggle("mine-entrance", position === TRACK.mineEntrance);

          if (state.world.trees.includes(position)) {
            const tree = document.createElement("span");
            tree.className = "tree-marker";
            tree.title = "成熟树木";
            cell.appendChild(tree);
          }
          if (state.world.branches.includes(position)) {
            const branch = document.createElement("span");
            branch.className = "branch-marker";
            branch.textContent = "枝";
            branch.title = "掉落树枝";
            cell.appendChild(branch);
          }
          if (position === TRACK.mineEntrance && state.unlocks.mining) {
            const entrance = document.createElement("span");
            entrance.className = "mine-entrance-marker";
            entrance.textContent = "矿";
            entrance.title = "分支矿井入口";
            cell.appendChild(entrance);
          }
          if (state.world.position === position && state.world.depth === 0) {
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
    }

    function rebuildMineTree(state) {
      els.mineTree.replaceChildren();
      const atEntrance = state.world.depth > 0 || state.world.position === TRACK.mineEntrance;
      if (!atEntrance) {
        const empty = document.createElement("p");
        empty.className = "mine-tree-empty";
        empty.textContent = `前往横向 ${TRACK.mineEntrance} 以查看矿路。`;
        els.mineTree.appendChild(empty);
        return;
      }
      const rootPath = state.world.minePath ?? "";
      const visible = new Set(Simulation.visibleMineNodes(state));
      els.mineTree.style.setProperty(
        "--mine-zoom",
        String(Math.min(MINING_RULES.maxViewZoom, 1 + state.world.depth * 0.06)),
      );
      els.mineTree.appendChild(buildMineBranch(state, rootPath, visible, true));
    }

    function buildMineBranch(state, path, visible, isRoot) {
      const item = document.createElement("div");
      item.className = "mine-branch";
      const node = document.createElement(isRoot ? "div" : "button");
      node.className = "mine-node";
      node.classList.toggle("current", isRoot);
      node.classList.toggle("anomaly", state.anomaly.revealed && path === TRACK.anomalyPath);
      node.textContent = isRoot ? (path ? path.slice(-1) : "入口") : path.slice(-1);
      node.title = `${formatMinePath(path)} · 深度 ${path.length}`;
      if (!isRoot && path.length === (state.world.minePath?.length ?? 0) + 1) {
        node.dataset.enterBranch = path.slice(-1);
      } else if (!isRoot) {
        node.disabled = true;
      }
      if (Simulation.oreAtPath(path) > 0) node.classList.add("ore-bearing");
      item.appendChild(node);

      const children = ["L", "R"]
        .map((branch) => `${path}${branch}`)
        .filter((child) => visible.has(child));
      if (children.length > 0) {
        const childRow = document.createElement("div");
        childRow.className = "mine-children";
        for (const child of children) {
          childRow.appendChild(buildMineBranch(state, child, visible, false));
        }
        item.appendChild(childRow);
      }
      return item;
    }

    function formatMinePath(path) {
      if (!path) return "入口";
      return `入口 / ${path.split("").map((branch) => (branch === "L" ? "左" : "右")).join(" / ")}`;
    }

    function environmentGridKey(state) {
      const world = state.world;
      return [
        state.unlocks.mining,
        world.position,
        world.depth,
        world.direction,
        world.trees.join(","),
        world.branches.join(","),
      ].join("|");
    }

    function mineTreeKey(state) {
      return [
        state.world.position,
        state.world.minePath ?? "surface",
        state.world.mineNodes.join(","),
        JSON.stringify(state.world.mineProgress),
        state.anomaly.revealed,
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
      if (state.anomaly.confirmed && state.structures.processor) ids.push("anomalyResearch");
      if (state.research.completed) ids.push("lingchu");
      const signature = JSON.stringify({
        ids,
        structures: state.structures,
        research: state.research,
        jobId: state.job?.id ?? null,
        anomaly: state.anomaly,
        industry: state.industry,
        atAnomaly: state.world.minePath === TRACK.anomalyPath,
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
        (id === "processor" && state.structures.processor) ||
        (id === "anomalyResearch" && state.research.completed) ||
        (id === "lingchu" && state.structures.lingchu);
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
      if (id === "mineHead") return "在地表末端建立矿井入口，并把环境模型扩展为可分支开掘的二叉矿路。";
      if (id === "bench") return "使用地下结构料建立稳定设备基座，是后续工坊设施的基础。";
      if (id === "generator") {
        return `能源低于 ${FOREST_RULES.generatorReserveTarget} 时自动消耗木材供能，并保留 ${FOREST_RULES.generatorWoodReserve} 木材作为应急燃料。`;
      }
      if (id === "sensor") return "扩展观测频段，用于检查无法解释的环境输出。";
      if (id === "processor") {
        return "把矿石加工成标准部件。部件是灵性接口与内景部件的基础材料。";
      }
      if (id === "anomalyResearch") {
        return "整理三次采样、频谱变化与输入边界，建立只读的第一版异常响应模型。";
      }
      if (id === "lingchu") {
        return "用标准部件装配灵触接口。接口只允许低功率观测，不能把未知场直接当作能源。";
      }
      if (state.world.minePath !== TRACK.anomalyPath) {
        return `残阵位于矿路 ${TRACK.anomalyPath}。需要沿右、左、右、右开掘到现场。`;
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
      innerTab: byId("innerTab"),
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
      digLeftBtn: byId("digLeftBtn"),
      digRightBtn: byId("digRightBtn"),
      ascendBtn: byId("ascendBtn"),
      mineViewport: byId("mineViewport"),
      mineTree: byId("mineTree"),
      minePathReadout: byId("minePathReadout"),
      mineDepthReadout: byId("mineDepthReadout"),
      leftMiningTarget: byId("leftMiningTarget"),
      leftMiningProgressText: byId("leftMiningProgressText"),
      leftMiningProgressBar: byId("leftMiningProgressBar"),
      rightMiningTarget: byId("rightMiningTarget"),
      rightMiningProgressText: byId("rightMiningProgressText"),
      rightMiningProgressBar: byId("rightMiningProgressBar"),
      environmentHint: byId("environmentHint"),
      environmentControllerList: byId("environmentControllerList"),
      activeJob: byId("activeJob"),
      activeJobName: byId("activeJobName"),
      activeJobTime: byId("activeJobTime"),
      jobProgress: byId("jobProgress"),
      buildList: byId("buildList"),
      researchModelStatus: byId("researchModelStatus"),
      researchDescription: byId("researchDescription"),
      researchObservationList: byId("researchObservationList"),
      innerPulseBtn: byId("innerPulseBtn"),
      innerPulseCount: byId("innerPulseCount"),
      innerHint: byId("innerHint"),
      innerTouchPressure: byId("innerTouchPressure"),
      innerRefinePressure: byId("innerRefinePressure"),
      innerDantianPressure: byId("innerDantianPressure"),
      innerPurity: byId("innerPurity"),
      innerTemperature: byId("innerTemperature"),
      innerStability: byId("innerStability"),
      innerFaultText: byId("innerFaultText"),
      innerEventList: byId("innerEventList"),
      innerObservationStatus: byId("innerObservationStatus"),
      innerObservationList: byId("innerObservationList"),
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
