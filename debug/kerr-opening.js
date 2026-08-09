(function startKerrOpeningDebug(global) {
  const Data = global.SilidoxData;
  const Opening = global.SilidoxOpening;
  const Capture = global.SilidoxRenderCapture;
  const FRAME_SECONDS = 1 / 60;
  const DEFAULT_RECORDING_MS = 6000;
  const captureRequest = Capture?.parseRequest();
  const els = cacheElements();

  if (!Data || !Opening || !Capture || Object.values(els).some((value) => value == null)) return;

  let state = createDebugState();
  let statusFrame = 0;
  let recording = null;
  let recordingUrl = "";
  let captureBundleUrl = "";
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

  applyCaptureDimensions(captureRequest);
  els.replayBtn.addEventListener("click", playFormalOpening);
  els.playPauseBtn.addEventListener("click", togglePlayback);
  els.stepBtn.addEventListener("click", stepFrame);
  els.timeRange.addEventListener("input", scrubTime);
  els.progressRange.addEventListener("input", scrubProgress);
  els.tracerToggle.addEventListener("change", toggleTracer);
  els.captureFrameBtn.addEventListener("click", exportCurrentFrame);
  els.recordBtn.addEventListener("click", toggleRecording);
  els.pixelCheckBtn.addEventListener("click", runPixelCheck);
  els.speedButtons.forEach((button) => button.addEventListener("click", selectSpeed));
  global.addEventListener("beforeunload", dispose);

  startInspection(captureRequest);
  if (captureRequest) void runAutomaticCapture(captureRequest);

  function startInspection(request = null) {
    state = createDebugState();
    opening.play();
    opening.setDebugPlayback({
      enabled: true,
      paused: Boolean(request),
      timeSeconds: request?.timeSeconds ?? 0,
      progress: request?.progress ?? 1,
      speed: request?.speed ?? 1,
      tracer: request?.tracer ?? false,
    });
    watchStatus();
  }

  async function runAutomaticCapture(request) {
    document.documentElement.dataset.captureStatus = "waiting";
    els.diagnosticOutput.textContent = `等待自动${request.kind === "frame" ? "帧" : "视频"}捕获...`;
    try {
      await waitForRenderer(12000);
      opening.setDebugPlayback({
        enabled: true,
        paused: true,
        timeSeconds: request.timeSeconds,
        progress: request.progress,
        speed: request.speed,
        tracer: request.tracer,
      });
      await waitAnimationFrames(2);
      if (request.kind === "frame") {
        await captureFrameBundle(request, { autoDownload: true });
      } else {
        const completion = beginRecording({
          request,
          durationMs: Math.round(request.durationSeconds * 1000),
          autoDownload: true,
        });
        opening.setDebugPlayback({ paused: false });
        await completion;
      }
      document.documentElement.dataset.captureStatus = "complete";
    } catch (error) {
      document.documentElement.dataset.captureStatus = "failed";
      els.diagnosticOutput.textContent = `自动捕获失败：${error.message}`;
      await downloadFailureBundle(request, error);
    }
  }

  function playFormalOpening() {
    stopRecording();
    state = createDebugState();
    opening.setDebugPlayback({ enabled: false, tracer: false });
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
    });
  }

  function selectedSpeed() {
    return Number(els.speedButtons.find((button) => button.classList.contains("active"))?.dataset.debugSpeed || 1);
  }

  function exportCurrentFrame() {
    const playback = inspectionState();
    const request = {
      kind: "frame",
      captureId: Capture.safeToken(`manual-${Date.now()}`),
      timeSeconds: playback.timeSeconds,
      progress: playback.progress,
      speed: playback.speed,
      tracer: playback.tracer,
    };
    void captureFrameBundle(request, { autoDownload: true }).catch((error) => {
      els.diagnosticOutput.textContent = `帧导出失败：${error.message}`;
    });
  }

  async function captureFrameBundle(request, { autoDownload = false } = {}) {
    els.captureFrameBtn.disabled = true;
    els.diagnosticOutput.textContent = "读取 GPU 帧并编码 PNG...";
    const playback = opening.getDebugPlayback();
    try {
      opening.setDebugPlayback({
        enabled: true,
        paused: true,
        timeSeconds: request.timeSeconds,
        progress: request.progress,
        speed: request.speed,
        tracer: request.tracer,
      });
      const frame = await opening.capturePixels();
      opening.setDebugPlayback({ timeSeconds: request.timeSeconds + 0.5 });
      const comparisonFrame = await opening.capturePixels();
      opening.setDebugPlayback({ timeSeconds: request.timeSeconds });
      const metrics = analyzeFrames(frame, comparisonFrame);
      const png = await Capture.frameToPng(frame);
      const artifactName = `silidox-kerr-frame-${request.captureId}.png`;
      const manifest = createManifest(request, {
        status: "complete",
        artifact: {
          name: artifactName,
          mimeType: png.type,
          bytes: png.size,
          width: frame.width,
          height: frame.height,
          gpuFormat: frame.format,
        },
        metrics,
      });
      const bundle = await Capture.createBundle({ artifactName, artifactBlob: png, manifest });
      publishBundle(bundle, bundleFileName(request), autoDownload);
      els.diagnosticOutput.textContent = [
        `PNG ${frame.width}x${frame.height}`,
        `非黑 ${formatPercent(metrics.nonBlack)}`,
        `阴影亮度 ${formatPercent(metrics.shadowLuminance)}`,
        `Δ0.5s ${formatPercent(metrics.frameDelta)}`,
      ].join(" / ");
      return { bundle, manifest };
    } finally {
      opening.setDebugPlayback(playback);
      els.captureFrameBtn.disabled = false;
    }
  }

  function toggleRecording() {
    if (recording) {
      stopRecording();
      return;
    }

    const playback = inspectionState();
    const request = {
      kind: "video",
      captureId: Capture.safeToken(`manual-${Date.now()}`),
      timeSeconds: playback.timeSeconds,
      progress: playback.progress,
      speed: playback.speed,
      durationSeconds: DEFAULT_RECORDING_MS / 1000,
      tracer: playback.tracer,
    };
    opening.setDebugPlayback({ paused: false });
    void beginRecording({ request, durationMs: DEFAULT_RECORDING_MS, autoDownload: false }).catch((error) => {
      els.diagnosticOutput.textContent = `录制失败：${error.message}`;
    });
  }

  function beginRecording({ request, durationMs, autoDownload }) {
    if (recording) return Promise.reject(new Error("recording already active"));
    const canvas = opening.getCanvas();
    if (!canvas?.captureStream || !global.MediaRecorder) {
      return Promise.reject(new Error("此 Firefox 不支持 canvas MediaRecorder"));
    }

    const stream = canvas.captureStream(60);
    const mimeType = preferredRecordingType();
    const chunks = [];
    let recorder;
    try {
      recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 12_000_000,
      });
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      return Promise.reject(error);
    }

    let resolveCompletion;
    let rejectCompletion;
    const completion = new Promise((resolve, reject) => {
      resolveCompletion = resolve;
      rejectCompletion = reject;
    });
    const session = {
      recorder,
      stream,
      request,
      autoDownload,
      durationMs,
      startedAt: performance.now(),
      timer: 0,
      resolve: resolveCompletion,
      reject: rejectCompletion,
      error: null,
    };

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) chunks.push(event.data);
    });
    recorder.addEventListener("error", (event) => {
      session.error = event.error || new Error("MediaRecorder failed");
    });
    recorder.addEventListener("stop", () => void finishRecording(session, chunks));
    recorder.start(500);
    session.timer = global.setTimeout(stopRecording, durationMs);
    recording = session;
    els.recordBtn.textContent = "停止录制";
    els.recordBtn.classList.add("active");
    els.diagnosticOutput.textContent = `正在录制 WebGPU canvas / ${(durationMs / 1000).toFixed(1)} s`;
    return completion;
  }

  function stopRecording() {
    if (!recording) return;
    global.clearTimeout(recording.timer);
    if (recording.recorder.state !== "inactive") recording.recorder.stop();
  }

  async function finishRecording(session, chunks) {
    global.clearTimeout(session.timer);
    session.stream.getTracks().forEach((track) => track.stop());
    if (recording === session) recording = null;
    els.recordBtn.textContent = "录制 6 秒";
    els.recordBtn.classList.remove("active");

    try {
      if (session.error) throw session.error;
      const blob = new Blob(chunks, { type: session.recorder.mimeType || "video/webm" });
      if (!blob.size) throw new Error("编码器没有返回视频数据");
      if (recordingUrl) URL.revokeObjectURL(recordingUrl);
      recordingUrl = URL.createObjectURL(blob);
      els.recordingPreview.src = recordingUrl;
      els.recordingDownload.href = recordingUrl;
      const artifactName = `silidox-kerr-video-${session.request.captureId}.webm`;
      els.recordingDownload.download = artifactName;
      els.recordingResult.hidden = false;

      const actualDurationSeconds = (performance.now() - session.startedAt) / 1000;
      const manifest = createManifest(session.request, {
        status: "complete",
        artifact: {
          name: artifactName,
          mimeType: blob.type,
          bytes: blob.size,
          requestedDurationSeconds: session.durationMs / 1000,
          actualDurationSeconds,
          width: opening.getCanvas()?.width || 0,
          height: opening.getCanvas()?.height || 0,
        },
      });
      const bundle = await Capture.createBundle({ artifactName, artifactBlob: blob, manifest });
      publishBundle(bundle, bundleFileName(session.request), session.autoDownload);
      els.diagnosticOutput.textContent = [
        "录制完成",
        `${(blob.size / 1024 / 1024).toFixed(1)} MiB`,
        session.recorder.mimeType,
      ].join(" / ");
      void els.recordingPreview.play().catch(() => {});
      session.resolve({ bundle, manifest });
    } catch (error) {
      session.reject(error);
    }
  }

  function preferredRecordingType() {
    const candidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
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
      const first = await opening.capturePixels();
      opening.setDebugPlayback({ timeSeconds: previous.timeSeconds + 0.5 });
      const second = await opening.capturePixels();
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

  function createManifest(request, details) {
    const playback = opening.getDebugPlayback();
    return {
      schema: "silidox.render-capture.v1",
      scene: "kerr-opening",
      kind: request.kind,
      captureId: request.captureId,
      status: details.status,
      createdAt: new Date().toISOString(),
      source: `${global.location.protocol}//${global.location.pathname}`,
      playback: {
        timeSeconds: request.timeSeconds,
        progress: request.progress,
        speed: request.speed,
        tracer: request.tracer,
        rendererReady: playback.rendererReady,
      },
      renderer: document.getElementById("kerrOpening")?.dataset.renderer || "unknown",
      artifact: details.artifact || null,
      metrics: details.metrics || null,
      error: details.error || null,
    };
  }

  async function downloadFailureBundle(request, error) {
    const manifest = createManifest(request, {
      status: "failed",
      error: { name: error.name || "Error", message: error.message || String(error) },
    });
    const bundle = await Capture.createBundle({ artifactName: "", artifactBlob: null, manifest });
    publishBundle(bundle, bundleFileName(request), true);
  }

  function bundleFileName(request) {
    return `silidox-kerr-${request.kind}-${request.captureId}.tar`;
  }

  function publishBundle(bundle, fileName, autoDownload) {
    if (captureBundleUrl) URL.revokeObjectURL(captureBundleUrl);
    captureBundleUrl = URL.createObjectURL(bundle);
    els.captureDownload.href = captureBundleUrl;
    els.captureDownload.download = fileName;
    els.captureResult.hidden = false;
    if (autoDownload) Capture.download(bundle, fileName);
  }

  function applyCaptureDimensions(request) {
    if (!request) return;
    const canvas = opening.getCanvas();
    if (!canvas) return;
    canvas.style.width = `${request.width}px`;
    canvas.style.height = `${request.height}px`;
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
    if (recording) {
      const remaining = Math.max(0, (recording.durationMs - (performance.now() - recording.startedAt)) / 1000);
      els.diagnosticOutput.textContent = `正在录制 WebGPU canvas / ${remaining.toFixed(1)} s`;
    }
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
  }

  function secureContextLabel() {
    return global.isSecureContext ? "Secure" : "Not secure";
  }

  function gpuApiLabel() {
    return global.navigator?.gpu ? "navigator.gpu" : "no navigator.gpu";
  }

  function dispose() {
    if (statusFrame) global.cancelAnimationFrame(statusFrame);
    if (recording) {
      global.clearTimeout(recording.timer);
      recording.stream.getTracks().forEach((track) => track.stop());
    }
    if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    if (captureBundleUrl) URL.revokeObjectURL(captureBundleUrl);
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
      captureFrameBtn: byId("debugCaptureFrameBtn"),
      recordBtn: byId("debugRecordBtn"),
      pixelCheckBtn: byId("debugPixelCheckBtn"),
      diagnosticOutput: byId("debugDiagnosticOutput"),
      captureResult: byId("debugCaptureResult"),
      captureDownload: byId("debugCaptureDownload"),
      recordingResult: byId("debugRecordingResult"),
      recordingPreview: byId("debugRecordingPreview"),
      recordingDownload: byId("debugRecordingDownload"),
      speedButtons: Array.from(document.querySelectorAll("[data-debug-speed]")),
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
