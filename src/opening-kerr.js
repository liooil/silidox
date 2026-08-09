// Kerr black-hole extraction-ring opening lifecycle. Browser-only; no simulation logic here.
(function defineSilidoxOpening(global) {
  const INTRO_SECONDS = 17;
  const DEBUG_TIMELINE_SECONDS = 30;
  const OPENING_SHELL_HTML = `
      <canvas class="opening-canvas opening-canvas-webgpu" id="kerrOpeningGpuCanvas" aria-hidden="true"></canvas>
      <div class="opening-scrim" aria-hidden="true"></div>

      <div class="opening-hud">
        <div class="opening-titleblock">
          <span>地球人类巨构工程 / 引力与时空数据</span>
          <h2 id="kerrOpeningTitle">克尔黑洞取能环</h2>
          <p>
            施工节点在远距安全轨道铺设赤道取能带。黑洞阴影、光子环和吸积盘用于校准测地线，
            金属环段的直接像由实体管线绘制，远侧环的多重像由局部克尔透镜重新构成。
          </p>
        </div>

        <dl class="opening-telemetry" aria-label="开场建设遥测">
          <div>
            <dt>自旋参数</dt>
            <dd>a/M <span id="kerrSpinReadout">0.91</span></dd>
          </div>
          <div>
            <dt>安全轨道</dt>
            <dd>8.4-10.2 r<sub>g</sub></dd>
          </div>
          <div>
            <dt>施工状态</dt>
            <dd id="kerrBeamReadout">待同步</dd>
          </div>
          <div>
            <dt>环体闭合</dt>
            <dd id="kerrPhaseReadout">00%</dd>
          </div>
          <div>
            <dt>记忆残片</dt>
            <dd>引力与时空数据</dd>
          </div>
        </dl>
      </div>

      <div class="opening-control">
        <ol class="opening-sequence" aria-label="建设阶段">
          <li data-opening-step="0">引力测绘</li>
          <li data-opening-step="1">锚点展开</li>
          <li data-opening-step="2">取能环闭合</li>
        </ol>
        <div class="opening-progress" aria-hidden="true"><i id="kerrOpeningProgress"></i></div>
        <button class="opening-enter" id="kerrOpeningEnter">确认施工记忆</button>
        <p id="kerrRendererStatus">等待渲染管线。</p>
      </div>
`;

  function createOpening(options = {}) {
    ensureOpeningShell(options.mountTarget);
    const els = cacheElements();
    if (!els.root) {
      return {
        showIfNeeded: () => false,
        play: () => false,
        setDebugPlayback: () => null,
        getDebugPlayback: () => null,
        capturePixels: () => Promise.reject(new Error("opening shell unavailable")),
        getCanvas: () => null,
        dispose: () => {},
      };
    }

    let renderer = null;
    let active = false;
    let frameId = 0;
    let renderRun = 0;
    let startedAt = 0;
    let debugLastFrameAt = 0;
    let restorePause = false;
    const debugPlayback = {
      enabled: false,
      paused: false,
      timeSeconds: 0,
      progress: 1,
      speed: 1,
      tracer: false,
    };
    const reducedMotion = Boolean(
      global.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches,
    );

    els.enterBtn.addEventListener("click", completeOpening);

    function showIfNeeded() {
      const state = options.getState?.();
      if (!openingRequired(state) || active) return false;
      const nextRestorePause =
        state.origin.pausedBeforeOpening == null
          ? Boolean(state.clock?.paused)
          : Boolean(state.origin.pausedBeforeOpening);
      return beginOpening(nextRestorePause);
    }

    function play() {
      return beginOpening(false, { restart: true });
    }

    function beginOpening(nextRestorePause, { restart = false } = {}) {
      if (active && !restart) return false;
      if (active) stopOpening();
      active = true;
      restorePause = Boolean(nextRestorePause);
      const runToken = ++renderRun;
      startedAt = performance.now();
      debugLastFrameAt = startedAt;
      els.root.hidden = false;
      els.root.dataset.renderer = "pending";
      delete els.root.dataset.webgpuFailure;
      delete els.root.dataset.webgpuFailureDetail;
      els.gpuCanvas.hidden = false;
      document.body.classList.add("opening-active");
      options.onStart?.({ restorePause });
      updateHud(0, "pending");
      void startRenderer(runToken);
      return true;
    }

    async function startRenderer(runToken) {
      try {
        if (!global.SilidoxKerr?.createScene) {
          const error = new Error("SilidoxKerr.createScene is unavailable");
          error.code = "missing_renderer";
          throw error;
        }
        const nextRenderer = await global.SilidoxKerr.createScene(els.gpuCanvas);
        if (!active || runToken !== renderRun) {
          nextRenderer.dispose();
          return;
        }
        renderer = nextRenderer;
        els.root.dataset.renderer = "webgpu";
        els.gpuCanvas.hidden = false;
        const initialTime = debugPlayback.enabled ? debugPlayback.timeSeconds : 0;
        const initialProgress = debugPlayback.enabled ? debugPlayback.progress : 0;
        updateHud(initialProgress, "webgpu");
        renderer.render(initialTime, initialProgress, { tracer: debugPlayback.tracer });
        frameId = global.requestAnimationFrame(renderFrame);
      } catch (error) {
        if (!active || runToken !== renderRun) return;
        const failure = describeWebGpuFailure(error);
        console.warn("Kerr opening WebGPU renderer unavailable", failure, error);
        renderer = null;
        els.root.dataset.renderer = "unsupported";
        els.root.dataset.webgpuFailure = failure.code;
        els.root.dataset.webgpuFailureDetail = failure.text;
        els.gpuCanvas.hidden = true;
        updateHud(1, "unsupported", failure.text);
      }
    }

    function renderFrame(now) {
      if (!active || !renderer) return;
      let displayTime;
      let progress;
      if (debugPlayback.enabled) {
        const deltaSeconds = Math.min(0.1, Math.max(0, (now - debugLastFrameAt) / 1000));
        if (!debugPlayback.paused) {
          debugPlayback.timeSeconds = positiveTime(
            debugPlayback.timeSeconds + deltaSeconds * debugPlayback.speed,
          );
        }
        displayTime = debugPlayback.timeSeconds;
        progress = debugPlayback.progress;
      } else {
        const elapsed = Math.max(0, (now - startedAt) / 1000);
        displayTime = reducedMotion ? Math.min(elapsed, 4.5) : elapsed;
        progress = Math.min(1, elapsed / INTRO_SECONDS);
      }
      debugLastFrameAt = now;
      updateHud(progress, renderer.backend);
      renderer.render(displayTime, progress, {
        tracer: debugPlayback.enabled && debugPlayback.tracer,
      });
      frameId = global.requestAnimationFrame(renderFrame);
    }

    function setDebugPlayback(patch = {}) {
      if (Object.hasOwn(patch, "enabled")) debugPlayback.enabled = Boolean(patch.enabled);
      if (Object.hasOwn(patch, "paused")) debugPlayback.paused = Boolean(patch.paused);
      if (Number.isFinite(patch.timeSeconds)) debugPlayback.timeSeconds = positiveTime(patch.timeSeconds);
      if (Number.isFinite(patch.progress)) {
        debugPlayback.progress = Math.max(0, Math.min(1, patch.progress));
      }
      if (Number.isFinite(patch.speed)) {
        debugPlayback.speed = Math.max(0.05, Math.min(8, patch.speed));
      }
      if (Object.hasOwn(patch, "tracer")) debugPlayback.tracer = Boolean(patch.tracer);
      debugLastFrameAt = performance.now();
      if (active && renderer && debugPlayback.enabled) {
        updateHud(debugPlayback.progress, renderer.backend);
        renderer.render(debugPlayback.timeSeconds, debugPlayback.progress, {
          tracer: debugPlayback.tracer,
        });
      }
      return getDebugPlayback();
    }

    function getDebugPlayback() {
      return {
        ...debugPlayback,
        active,
        rendererReady: Boolean(renderer),
      };
    }

    function capturePixels() {
      if (!active || !renderer) {
        return Promise.reject(new Error("WebGPU renderer is not ready"));
      }
      return renderer.readPixels();
    }

    function completeOpening() {
      if (!active) return;
      const nextRestorePause = restorePause;
      stopOpening();
      options.onComplete?.({ restorePause: nextRestorePause });
    }

    function dispose() {
      stopOpening();
      els.enterBtn.removeEventListener("click", completeOpening);
    }

    function updateHud(progress, backend, statusDetail = "") {
      const backendKey = String(backend).toLowerCase();
      const closure = constructionClosure(progress);
      els.progress.style.width = `${Math.round(progress * 100)}%`;
      els.phaseReadout.textContent = `${String(Math.round(closure * 100)).padStart(2, "0")}%`;
      els.beamReadout.textContent =
        progress < 0.28
          ? "引力测绘"
          : progress < 0.62
            ? "锚点展开"
            : progress < 0.88
              ? "环段闭合"
              : `${(64 + closure * 420).toFixed(1)} PW`;
      els.status.textContent =
        backendKey === "webgpu"
          ? "WEBGPU / MULTI-PASS KERR CONSTRUCTION"
          : backendKey === "unsupported"
            ? statusDetail || "WEBGPU 不可用 / 建设记录文本"
            : "GPU 管线初始化";
      const currentStep = progress < 0.34 ? 0 : progress < 0.72 ? 1 : 2;
      els.steps.forEach((step, index) => {
        step.classList.toggle("active", index <= currentStep);
      });
    }

    function stopOpening() {
      renderRun += 1;
      active = false;
      if (frameId) global.cancelAnimationFrame(frameId);
      frameId = 0;
      renderer?.dispose();
      renderer = null;
      els.root.hidden = true;
      document.body.classList.remove("opening-active");
    }

    return {
      showIfNeeded,
      play,
      setDebugPlayback,
      getDebugPlayback,
      capturePixels,
      getCanvas: () => els.gpuCanvas,
      dispose,
    };
  }

  function ensureOpeningShell(mountTarget = document.body) {
    const existing = document.getElementById("kerrOpening");
    if (existing) return existing;
    if (!mountTarget) return null;
    const root = document.createElement("section");
    root.className = "opening-shell";
    root.id = "kerrOpening";
    root.setAttribute("aria-labelledby", "kerrOpeningTitle");
    root.hidden = true;
    root.innerHTML = OPENING_SHELL_HTML;
    mountTarget.prepend(root);
    return root;
  }

  function openingRequired(state) {
    return (
      state &&
      state.origin?.id === global.SilidoxData.OPENING_ORIGINS.kerrBlackHole.id &&
      !state.origin.openingViewed
    );
  }

  function constructionClosure(progress) {
    return Math.max(0, Math.min(1, (progress - 0.58) / 0.34));
  }

  function positiveTime(value) {
    const wrapped = value % DEBUG_TIMELINE_SECONDS;
    return wrapped < 0 ? wrapped + DEBUG_TIMELINE_SECONDS : wrapped;
  }

  function cacheElements() {
    const byId = (id) => document.getElementById(id);
    const root = byId("kerrOpening");
    if (!root) return { root: null };
    return {
      root,
      gpuCanvas: byId("kerrOpeningGpuCanvas"),
      enterBtn: byId("kerrOpeningEnter"),
      progress: byId("kerrOpeningProgress"),
      spinReadout: byId("kerrSpinReadout"),
      beamReadout: byId("kerrBeamReadout"),
      phaseReadout: byId("kerrPhaseReadout"),
      status: byId("kerrRendererStatus"),
      steps: Array.from(root.querySelectorAll("[data-opening-step]")),
    };
  }

  function describeWebGpuFailure(error) {
    const code = String(error?.code || "unknown");
    const detail = String(error?.message || "").trim();
    const labels = {
      no_api: "WEBGPU 未启用：navigator.gpu 不存在",
      no_adapter: "WEBGPU 未启用：未取得 GPUAdapter",
      no_device: "WEBGPU 设备创建失败",
      no_context: "WEBGPU 画布上下文创建失败",
      missing_renderer: "WEBGPU 多管线模块未加载",
      validation: "WEBGPU 管线验证失败",
      unknown: "WEBGPU 不可用",
    };
    const prefix = labels[code] || labels.unknown;
    return {
      code,
      text: detail && code !== "no_api" && code !== "no_adapter" ? `${prefix} / ${detail}` : prefix,
    };
  }

  global.SilidoxOpening = Object.freeze({
    create: createOpening,
    mountShell: ensureOpeningShell,
    openingRequired,
    shaderSource: global.SilidoxKerr?.lensShader || "",
  });
})(globalThis);
