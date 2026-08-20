(function startKerrOpeningDebug(global) {
  const Data = global.SilidoxData;
  const Opening = global.SilidoxOpening;
  const FRAME_SECONDS = 1 / 60;
  const els = cacheElements();

  if (!Data || !Opening || Object.values(els).some((value) => value == null)) return;

  let state = createDebugState();
  let statusFrame = 0;
  let pixelCheckRunning = false;
  const opening = Opening.create({
    getState: () => state,
    onStart() {
      state.clock.paused = true;
      watchStatus();
    },
    onComplete() {
      state.origin.openingViewed = true;
      state.origin.openingCompletedAtMs = Date.now();
      state.clock.paused = false;
      watchStatus();
    },
  });

  els.replayBtn.addEventListener("click", playFormalOpening);
  els.playPauseBtn.addEventListener("click", togglePlayback);
  els.stepBtn.addEventListener("click", stepFrame);
  els.timeRange.addEventListener("input", scrubTime);
  els.progressRange.addEventListener("input", scrubProgress);
  els.tracerToggle.addEventListener("change", toggleTracer);
  els.pixelCheckBtn.addEventListener("click", runPixelCheck);
  els.speedButtons.forEach((button) => button.addEventListener("click", selectSpeed));
  els.sourceButtons.forEach((button) => button.addEventListener("click", selectSource));
  global.addEventListener("beforeunload", dispose);

  startInspection();

  function startInspection() {
    state = createDebugState();
    opening.play();
    opening.setDebugPlayback({
      enabled: true,
      paused: false,
      timeSeconds: 0,
      progress: 1,
      speed: 1,
      tracer: false,
      sourceMode: "stars",
    });
    watchStatus();
  }

  function playFormalOpening() {
    state = createDebugState();
    opening.setDebugPlayback({ enabled: false, tracer: false, sourceMode: "stars" });
    opening.play();
    els.diagnosticOutput.textContent = "正式开场时间线。";
    watchStatus();
  }

  function togglePlayback() {
    const playback = inspectionState();
    opening.setDebugPlayback({ enabled: true, paused: !playback.paused });
  }

  function stepFrame() {
    const playback = inspectionState();
    opening.setDebugPlayback({
      enabled: true,
      paused: true,
      timeSeconds: playback.timeSeconds + FRAME_SECONDS,
    });
  }

  function scrubTime() {
    opening.setDebugPlayback({
      enabled: true,
      paused: true,
      timeSeconds: Number(els.timeRange.value),
    });
  }

  function scrubProgress() {
    opening.setDebugPlayback({
      enabled: true,
      paused: true,
      progress: Number(els.progressRange.value),
    });
  }

  function toggleTracer() {
    opening.setDebugPlayback({ enabled: true, tracer: els.tracerToggle.checked });
  }

  function selectSpeed(event) {
    const speed = Number(event.currentTarget.dataset.debugSpeed);
    opening.setDebugPlayback({ enabled: true, speed });
  }

  function selectSource(event) {
    opening.setDebugPlayback({
      enabled: true,
      sourceMode: event.currentTarget.dataset.debugSource,
    });
  }

  function inspectionState() {
    const playback = opening.getDebugPlayback();
    if (playback?.enabled) return playback;
    return opening.setDebugPlayback({
      enabled: true,
      paused: true,
      timeSeconds: Number(els.timeRange.value),
      progress: Number(els.progressRange.value),
      speed: selectedSpeed(),
      tracer: els.tracerToggle.checked,
      sourceMode: selectedSourceMode(),
    });
  }

  function selectedSpeed() {
    return Number(els.speedButtons.find((button) => button.classList.contains("active"))?.dataset.debugSpeed || 1);
  }

  function selectedSourceMode() {
    return els.sourceButtons.find((button) => button.classList.contains("active"))?.dataset.debugSource
      || "stars";
  }

  async function runPixelCheck() {
    if (pixelCheckRunning) return;
    pixelCheckRunning = true;
    els.pixelCheckBtn.disabled = true;
    els.diagnosticOutput.textContent = "读取 GPU 帧缓冲...";
    let previous = null;
    try {
      await waitForRenderer();
      previous = inspectionState();
      opening.setDebugPlayback({ enabled: true, paused: true });
      const first = await opening.readDiagnosticPixels();
      opening.setDebugPlayback({ timeSeconds: previous.timeSeconds + 0.5 });
      const second = await opening.readDiagnosticPixels();
      const metrics = analyzeFrames(first, second);
      els.diagnosticOutput.textContent = [
        `非黑 ${formatPercent(metrics.nonBlack)}`,
        `阴影亮度 ${formatPercent(metrics.shadowLuminance)}`,
        `Δ0.5s ${formatPercent(metrics.frameDelta)}`,
      ].join(" / ");
    } catch (error) {
      els.diagnosticOutput.textContent = `像素检查失败：${error.message}`;
    } finally {
      if (previous) opening.setDebugPlayback(previous);
      pixelCheckRunning = false;
      els.pixelCheckBtn.disabled = false;
    }
  }

  async function waitForRenderer(timeoutMs = 5000) {
    const started = performance.now();
    while (!opening.getDebugPlayback()?.rendererReady) {
      const root = document.getElementById("kerrOpening");
      if (root?.dataset.renderer === "unsupported") {
        throw new Error(root.dataset.webgpuFailureDetail || "WebGPU renderer unavailable");
      }
      if (performance.now() - started > timeoutMs) throw new Error("WebGPU renderer timeout");
      await waitAnimationFrames(1);
    }
  }

  function waitAnimationFrames(count) {
    return new Promise((resolve) => {
      const next = () => {
        if (count <= 0) {
          resolve();
          return;
        }
        count -= 1;
        global.requestAnimationFrame(next);
      };
      next();
    });
  }

  function analyzeFrames(first, second) {
    if (first.width !== second.width || first.height !== second.height) {
      throw new Error("frame size changed during readback");
    }
    if (!first.format.includes("8unorm") || !second.format.includes("8unorm")) {
      throw new Error(`unsupported readback format: ${first.format}`);
    }

    const sampleStep = 8;
    const minDimension = Math.min(first.width, first.height);
    const centerX = first.width / 2 + minDimension * 0.05;
    const centerY = first.height / 2 - minDimension * 0.075;
    const shadowRadius = minDimension * 0.080;
    const sceneRadius = minDimension * 0.46;
    let samples = 0;
    let nonBlack = 0;
    let shadowSamples = 0;
    let shadowLuminance = 0;
    let motionSamples = 0;
    let frameDelta = 0;

    for (let y = 0; y < first.height; y += sampleStep) {
      for (let x = 0; x < first.width; x += sampleStep) {
        const firstLuminance = pixelLuminance(first, x, y);
        const secondLuminance = pixelLuminance(second, x, y);
        const distance = Math.hypot(x - centerX, y - centerY);
        samples += 1;
        if (firstLuminance > 0.025) nonBlack += 1;
        if (distance < shadowRadius) {
          shadowSamples += 1;
          shadowLuminance += firstLuminance;
        }
        if (distance > shadowRadius && distance < sceneRadius) {
          motionSamples += 1;
          frameDelta += Math.abs(firstLuminance - secondLuminance);
        }
      }
    }

    return {
      nonBlack: nonBlack / Math.max(samples, 1),
      shadowLuminance: shadowLuminance / Math.max(shadowSamples, 1),
      frameDelta: frameDelta / Math.max(motionSamples, 1),
    };
  }

  function pixelLuminance(frame, x, y) {
    const offset = y * frame.bytesPerRow + x * 4;
    const bgra = frame.format.startsWith("bgra");
    const red = frame.data[offset + (bgra ? 2 : 0)] / 255;
    const green = frame.data[offset + 1] / 255;
    const blue = frame.data[offset + (bgra ? 0 : 2)] / 255;
    return red * 0.2126 + green * 0.7152 + blue * 0.0722;
  }

  function formatPercent(value) {
    return `${(value * 100).toFixed(1)}%`;
  }

  function watchStatus() {
    if (statusFrame) global.cancelAnimationFrame(statusFrame);
    statusFrame = global.requestAnimationFrame(updateStatus);
  }

  function updateStatus() {
    const root = document.getElementById("kerrOpening");
    const renderer = root?.dataset.renderer || "pending";
    const renderStatus = document.getElementById("kerrRendererStatus")?.textContent || "等待渲染管线。";
    const playback = opening.getDebugPlayback();
    els.status.textContent = `${secureContextLabel()} / ${gpuApiLabel()} / ${renderer} / ${renderStatus}`;
    if (playback?.enabled) updateTimelineControls(playback);
    statusFrame = global.requestAnimationFrame(updateStatus);
  }

  function updateTimelineControls(playback) {
    if (document.activeElement !== els.timeRange) els.timeRange.value = String(playback.timeSeconds);
    if (document.activeElement !== els.progressRange) els.progressRange.value = String(playback.progress);
    els.timeOutput.textContent = `${playback.timeSeconds.toFixed(2)} s`;
    els.progressOutput.textContent = `${Math.round(playback.progress * 100)}%`;
    els.timelineSummary.textContent = `T+${playback.timeSeconds.toFixed(2)} / 施工 ${Math.round(playback.progress * 100)}%`;
    els.playPauseBtn.textContent = playback.paused ? "播放" : "暂停";
    els.tracerToggle.checked = playback.tracer;
    els.speedButtons.forEach((button) => {
      button.classList.toggle("active", Number(button.dataset.debugSpeed) === playback.speed);
    });
    els.sourceButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.debugSource === playback.sourceMode);
    });
  }

  function secureContextLabel() {
    return global.isSecureContext ? "Secure" : "Not secure";
  }

  function gpuApiLabel() {
    return global.navigator?.gpu ? "navigator.gpu" : "no navigator.gpu";
  }

  function dispose() {
    if (statusFrame) global.cancelAnimationFrame(statusFrame);
    opening.dispose();
  }

  function cacheElements() {
    const byId = (id) => document.getElementById(id);
    return {
      replayBtn: byId("replayOpeningBtn"),
      status: byId("debugRuntimeStatus"),
      timelineSummary: byId("debugTimelineSummary"),
      playPauseBtn: byId("debugPlayPauseBtn"),
      stepBtn: byId("debugStepBtn"),
      timeRange: byId("debugTimeRange"),
      timeOutput: byId("debugTimeOutput"),
      progressRange: byId("debugProgressRange"),
      progressOutput: byId("debugProgressOutput"),
      tracerToggle: byId("debugTracerToggle"),
      pixelCheckBtn: byId("debugPixelCheckBtn"),
      diagnosticOutput: byId("debugDiagnosticOutput"),
      speedButtons: Array.from(document.querySelectorAll("[data-debug-speed]")),
      sourceButtons: Array.from(document.querySelectorAll("[data-debug-source]")),
    };
  }

  function createDebugState() {
    const origin = Data.OPENING_ORIGINS.kerrBlackHole;
    return {
      origin: {
        id: origin.id,
        name: origin.name,
        memory: origin.memory,
        accident: origin.accident,
        openingViewed: false,
        openingCompletedAtMs: null,
        pausedBeforeOpening: false,
      },
      clock: { paused: false },
    };
  }
})(globalThis);
