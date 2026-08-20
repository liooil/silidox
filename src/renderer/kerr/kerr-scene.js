// Multi-pass WebGPU render graph for the Kerr extraction-ring opening.
(function defineSilidoxKerrScene(global) {
  const namespace = (global.SilidoxKerr = global.SilidoxKerr || {});
  const HDR_FORMAT = "rgba16float";
  const UNIFORM_FLOATS = 16;
  const MAX_PIXEL_RATIO = 2;

  class KerrSceneRenderer {
    constructor(canvas, device, context, canvasFormat) {
      this.backend = "WebGPU";
      this.canvas = canvas;
      this.device = device;
      this.context = context;
      this.format = canvasFormat;
      this.pixelRatio = 1;
      this.uniformData = new Float32Array(UNIFORM_FLOATS);
      this.pendingReadback = null;
      this.hdrTexture = null;
      this.bloomTexture = null;
      this.sourceCanvas = null;
      this.sourceTexture = null;
      this.sourceMode = "";
      this.postBindGroup = null;
      this.bloomBindGroup = null;

      this.uniformBuffer = device.createBuffer({
        label: "silidox-kerr-scene-uniforms",
        size: this.uniformData.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      this.segmentBuffer = device.createBuffer({
        label: "silidox-kerr-ring-segments",
        size: namespace.segmentCount * 16,
        usage: GPUBufferUsage.STORAGE,
      });
      this.particleBuffer = device.createBuffer({
        label: "silidox-kerr-energy-particles",
        size: namespace.particleCount * 32,
        usage: GPUBufferUsage.STORAGE,
      });
      this.foregroundData = namespace.createForegroundInstances();
      this.foregroundBuffer = device.createBuffer({
        label: "silidox-kerr-foreground-instances",
        size: this.foregroundData.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(this.foregroundBuffer, 0, this.foregroundData);
      this.linearSampler = device.createSampler({
        label: "silidox-kerr-linear-sampler",
        magFilter: "linear",
        minFilter: "linear",
      });

      this.createPipelines();
      this.createStaticBindGroups();
    }

    createPipelines() {
      const device = this.device;
      const shaderModule = (label, code) => device.createShaderModule({ label, code });
      const skyModule = shaderModule("silidox-kerr-sky-shader", namespace.skyShader);
      const lensModule = shaderModule("silidox-kerr-lens-shader", namespace.lensShader);
      const ringModule = shaderModule("silidox-kerr-ring-direct-shader", namespace.ringDirectShader);
      const simulationModule = shaderModule("silidox-kerr-simulation-shader", namespace.simulationShader);
      const foregroundModule = shaderModule("silidox-kerr-foreground-shader", namespace.foregroundShader);
      const energyModule = shaderModule("silidox-kerr-energy-render-shader", namespace.energyRenderShader);
      const bloomModule = shaderModule("silidox-kerr-bloom-shader", namespace.bloomShader);
      const compositeModule = shaderModule("silidox-kerr-composite-shader", namespace.compositeShader);
      this.shaderModules = {
        sky: skyModule,
        lens: lensModule,
        ring: ringModule,
        simulation: simulationModule,
        foreground: foregroundModule,
        energy: energyModule,
        bloom: bloomModule,
        composite: compositeModule,
      };

      this.skyPipeline = device.createRenderPipeline({
        label: "silidox-kerr-sky-pipeline",
        layout: "auto",
        vertex: { module: skyModule, entryPoint: "vertex_main" },
        fragment: { module: skyModule, entryPoint: "fragment_main", targets: [{ format: HDR_FORMAT }] },
        primitive: { topology: "triangle-list" },
      });
      this.lensPipeline = device.createRenderPipeline({
        label: "silidox-kerr-lens-pipeline",
        layout: "auto",
        vertex: { module: lensModule, entryPoint: "vertex_main" },
        fragment: { module: lensModule, entryPoint: "fragment_main", targets: [{ format: HDR_FORMAT }] },
        primitive: { topology: "triangle-list" },
      });
      this.simulationPipeline = device.createComputePipeline({
        label: "silidox-kerr-simulation-pipeline",
        layout: "auto",
        compute: { module: simulationModule, entryPoint: "compute_main" },
      });
      this.ringPipeline = device.createRenderPipeline({
        label: "silidox-kerr-ring-direct-pipeline",
        layout: "auto",
        vertex: { module: ringModule, entryPoint: "vertex_main" },
        fragment: { module: ringModule, entryPoint: "fragment_main", targets: [{ format: HDR_FORMAT }] },
        primitive: { topology: "triangle-list" },
      });
      this.foregroundPipeline = device.createRenderPipeline({
        label: "silidox-kerr-foreground-pipeline",
        layout: "auto",
        vertex: {
          module: foregroundModule,
          entryPoint: "vertex_main",
          buffers: [
            {
              arrayStride: 32,
              stepMode: "instance",
              attributes: [
                { shaderLocation: 0, offset: 0, format: "float32x4" },
                { shaderLocation: 1, offset: 16, format: "float32x4" },
              ],
            },
          ],
        },
        fragment: {
          module: foregroundModule,
          entryPoint: "fragment_main",
          targets: [
            {
              format: HDR_FORMAT,
              blend: {
                color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
                alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
              },
            },
          ],
        },
        primitive: { topology: "triangle-list" },
      });
      this.energyPipeline = device.createRenderPipeline({
        label: "silidox-kerr-energy-pipeline",
        layout: "auto",
        vertex: { module: energyModule, entryPoint: "vertex_main" },
        fragment: {
          module: energyModule,
          entryPoint: "fragment_main",
          targets: [
            {
              format: HDR_FORMAT,
              blend: {
                color: { srcFactor: "one", dstFactor: "one" },
                alpha: { srcFactor: "one", dstFactor: "one" },
              },
            },
          ],
        },
        primitive: { topology: "triangle-list" },
      });
      this.bloomPipeline = device.createRenderPipeline({
        label: "silidox-kerr-bloom-pipeline",
        layout: "auto",
        vertex: { module: bloomModule, entryPoint: "vertex_main" },
        fragment: { module: bloomModule, entryPoint: "fragment_main", targets: [{ format: HDR_FORMAT }] },
        primitive: { topology: "triangle-list" },
      });
      this.compositePipeline = device.createRenderPipeline({
        label: "silidox-kerr-composite-pipeline",
        layout: "auto",
        vertex: { module: compositeModule, entryPoint: "vertex_main" },
        fragment: {
          module: compositeModule,
          entryPoint: "fragment_main",
          targets: [{ format: this.format }],
        },
        primitive: { topology: "triangle-list" },
      });
    }

    async shaderCompilationError() {
      const errors = [];
      for (const [name, module] of Object.entries(this.shaderModules)) {
        if (typeof module.getCompilationInfo !== "function") continue;
        const info = await module.getCompilationInfo();
        for (const message of info.messages) {
          if (message.type !== "error") continue;
          errors.push(`${name}:${message.lineNum}:${message.linePos} ${message.message}`);
        }
      }
      return errors.length ? errors.slice(0, 8).join(" | ") : "";
    }

    createStaticBindGroups() {
      const uniformEntry = { binding: 0, resource: { buffer: this.uniformBuffer } };
      this.simulationBindGroup = this.device.createBindGroup({
        layout: this.simulationPipeline.getBindGroupLayout(0),
        entries: [
          uniformEntry,
          { binding: 1, resource: { buffer: this.segmentBuffer } },
          { binding: 2, resource: { buffer: this.particleBuffer } },
        ],
      });
      this.foregroundBindGroup = this.device.createBindGroup({
        layout: this.foregroundPipeline.getBindGroupLayout(0),
        entries: [uniformEntry],
      });
      this.ringBindGroup = this.device.createBindGroup({
        layout: this.ringPipeline.getBindGroupLayout(0),
        entries: [uniformEntry, { binding: 1, resource: { buffer: this.segmentBuffer } }],
      });
      this.energyBindGroup = this.device.createBindGroup({
        layout: this.energyPipeline.getBindGroupLayout(0),
        entries: [uniformEntry, { binding: 1, resource: { buffer: this.particleBuffer } }],
      });
    }

    static async create(canvas) {
      validateShaderNamespace();
      if (!global.navigator?.gpu) {
        throw createWebGpuError("no_api", "navigator.gpu is not exposed");
      }
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
      if (!adapter) throw createWebGpuError("no_adapter", "requestAdapter returned null");
      let device;
      try {
        device = await adapter.requestDevice();
      } catch (error) {
        throw createWebGpuError("no_device", error?.message || "requestDevice failed", error);
      }
      const context = canvas.getContext("webgpu");
      if (!context) {
        device.destroy();
        throw createWebGpuError("no_context", "canvas.getContext('webgpu') returned null");
      }
      const format = navigator.gpu.getPreferredCanvasFormat();
      device.pushErrorScope("validation");
      context.configure({
        device,
        format,
        alphaMode: "opaque",
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      });
      const renderer = new KerrSceneRenderer(canvas, device, context, format);
      const compilationError = await renderer.shaderCompilationError();
      const validationError = await device.popErrorScope();
      if (compilationError || validationError) {
        renderer.dispose();
        throw createWebGpuError(
          "validation",
          compilationError || validationError.message,
          validationError || undefined,
        );
      }
      return renderer;
    }

    resize(sourceMode = namespace.sourceModes.stars) {
      this.pixelRatio = Math.min(MAX_PIXEL_RATIO, Math.max(1, global.devicePixelRatio || 1));
      const width = Math.max(1, Math.round(this.canvas.clientWidth * this.pixelRatio));
      const height = Math.max(1, Math.round(this.canvas.clientHeight * this.pixelRatio));
      const nextSourceMode = namespace.normalizeSourceMode(sourceMode);
      if (
        this.canvas.width === width
        && this.canvas.height === height
        && this.hdrTexture
        && this.sourceMode === nextSourceMode
      ) return;
      this.canvas.width = width;
      this.canvas.height = height;
      this.destroyFrameTextures();
      this.sourceMode = nextSourceMode;
      if (!this.sourceCanvas) {
        this.sourceCanvas = namespace.createSourceCanvas(width, height, nextSourceMode);
      } else {
        namespace.paintSourceCanvas(this.sourceCanvas, width, height, nextSourceMode);
      }
      this.sourceTexture = this.device.createTexture({
        label: `silidox-kerr-${nextSourceMode}-source`,
        size: [width, height],
        format: "rgba8unorm",
        usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
      });
      this.device.queue.copyExternalImageToTexture(
        { source: this.sourceCanvas },
        { texture: this.sourceTexture },
        { width, height },
      );
      this.hdrTexture = this.device.createTexture({
        label: "silidox-kerr-hdr-scene",
        size: [width, height],
        format: HDR_FORMAT,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
      this.bloomTexture = this.device.createTexture({
        label: "silidox-kerr-bloom",
        size: [Math.max(1, Math.ceil(width / 2)), Math.max(1, Math.ceil(height / 2))],
        format: HDR_FORMAT,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
      const sourceEntries = [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: this.sourceTexture.createView() },
        { binding: 2, resource: this.linearSampler },
      ];
      this.skyBindGroup = this.device.createBindGroup({
        layout: this.skyPipeline.getBindGroupLayout(0),
        entries: sourceEntries,
      });
      this.lensBindGroup = this.device.createBindGroup({
        layout: this.lensPipeline.getBindGroupLayout(0),
        entries: sourceEntries,
      });
      this.bloomBindGroup = this.device.createBindGroup({
        layout: this.bloomPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: this.hdrTexture.createView() },
          { binding: 1, resource: this.linearSampler },
        ],
      });
      this.postBindGroup = this.device.createBindGroup({
        layout: this.compositePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: this.hdrTexture.createView() },
          { binding: 1, resource: this.bloomTexture.createView() },
          { binding: 2, resource: this.linearSampler },
        ],
      });
    }

    render(timeSeconds, progress, diagnostics = {}) {
      this.resize(diagnostics.sourceMode);
      const construction = Math.min(1, Math.max(0, progress));
      const closure = Math.max(0, Math.min(1, (construction - 0.58) / 0.34));
      this.uniformData.set([
        this.canvas.width,
        this.canvas.height,
        timeSeconds,
        1 / Math.max(1, Math.min(this.canvas.width, this.canvas.height)),
        construction,
        closure,
        0.91,
        diagnostics.tracer ? 1 : 0,
        0.10,
        -0.15,
        9.22,
        7.80,
        1.24,
        -0.055,
        1.0,
        0.0,
      ]);
      this.device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformData);

      const encoder = this.device.createCommandEncoder({ label: "silidox-kerr-render-graph" });
      this.encodeSimulation(encoder);
      this.encodeSky(encoder);
      this.encodeLens(encoder);
      this.encodeRing(encoder);
      this.encodeForeground(encoder);
      this.encodeEnergy(encoder);
      this.encodeBloom(encoder);

      const currentTexture = this.context.getCurrentTexture();
      this.encodeComposite(encoder, currentTexture);
      const readback = this.prepareReadback(encoder, currentTexture);
      this.device.queue.submit([encoder.finish()]);
      this.resolveReadback(readback);
    }

    encodeSimulation(encoder) {
      const pass = encoder.beginComputePass({ label: "simulation.compute" });
      pass.setPipeline(this.simulationPipeline);
      pass.setBindGroup(0, this.simulationBindGroup);
      pass.dispatchWorkgroups(Math.ceil(Math.max(namespace.segmentCount, namespace.particleCount) / 64));
      pass.end();
    }

    encodeSky(encoder) {
      const pass = encoder.beginRenderPass({
        label: "sky.render",
        colorAttachments: [
          {
            view: this.hdrTexture.createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });
      pass.setPipeline(this.skyPipeline);
      pass.setBindGroup(0, this.skyBindGroup);
      pass.draw(3);
      pass.end();
    }

    encodeLens(encoder) {
      const pass = encoder.beginRenderPass({
        label: "kerr-lens.fragment",
        colorAttachments: [
          { view: this.hdrTexture.createView(), loadOp: "load", storeOp: "store" },
        ],
      });
      const scissor = this.lensScissor();
      pass.setScissorRect(scissor.x, scissor.y, scissor.width, scissor.height);
      pass.setPipeline(this.lensPipeline);
      pass.setBindGroup(0, this.lensBindGroup);
      pass.draw(3);
      pass.end();
    }

    encodeForeground(encoder) {
      const pass = encoder.beginRenderPass({
        label: "foreground.render",
        colorAttachments: [
          { view: this.hdrTexture.createView(), loadOp: "load", storeOp: "store" },
        ],
      });
      pass.setPipeline(this.foregroundPipeline);
      pass.setBindGroup(0, this.foregroundBindGroup);
      pass.setVertexBuffer(0, this.foregroundBuffer);
      pass.draw(6, this.foregroundData.length / 8);
      pass.end();
    }

    encodeRing(encoder) {
      const pass = encoder.beginRenderPass({
        label: "ring-direct.render",
        colorAttachments: [
          { view: this.hdrTexture.createView(), loadOp: "load", storeOp: "store" },
        ],
      });
      pass.setPipeline(this.ringPipeline);
      pass.setBindGroup(0, this.ringBindGroup);
      pass.draw(36, namespace.segmentCount);
      pass.end();
    }

    encodeEnergy(encoder) {
      const pass = encoder.beginRenderPass({
        label: "energy-ribbons.render",
        colorAttachments: [
          { view: this.hdrTexture.createView(), loadOp: "load", storeOp: "store" },
        ],
      });
      pass.setPipeline(this.energyPipeline);
      pass.setBindGroup(0, this.energyBindGroup);
      pass.draw(6, namespace.particleCount);
      pass.end();
    }

    encodeBloom(encoder) {
      const pass = encoder.beginRenderPass({
        label: "bloom.render",
        colorAttachments: [
          {
            view: this.bloomTexture.createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });
      pass.setPipeline(this.bloomPipeline);
      pass.setBindGroup(0, this.bloomBindGroup);
      pass.draw(3);
      pass.end();
    }

    encodeComposite(encoder, currentTexture) {
      const pass = encoder.beginRenderPass({
        label: "tone-map.render",
        colorAttachments: [
          {
            view: currentTexture.createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });
      pass.setPipeline(this.compositePipeline);
      pass.setBindGroup(0, this.postBindGroup);
      pass.draw(3);
      pass.end();
    }

    lensScissor() {
      const width = this.canvas.width;
      const height = this.canvas.height;
      const minimumDimension = Math.min(width, height);
      const centerX = (width + 0.1 * minimumDimension) * 0.5;
      const centerY = (height - 0.15 * minimumDimension) * 0.5;
      const radius = Math.ceil(minimumDimension * 0.47);
      const left = Math.max(0, Math.floor(centerX - radius));
      const top = Math.max(0, Math.floor(centerY - radius));
      const right = Math.min(width, Math.ceil(centerX + radius));
      const bottom = Math.min(height, Math.ceil(centerY + radius));
      return {
        x: left,
        y: top,
        width: Math.max(1, right - left),
        height: Math.max(1, bottom - top),
      };
    }

    prepareReadback(encoder, currentTexture) {
      if (!this.pendingReadback) return null;
      const request = this.pendingReadback;
      this.pendingReadback = null;
      const bytesPerRow = Math.ceil((this.canvas.width * 4) / 256) * 256;
      const buffer = this.device.createBuffer({
        label: "silidox-kerr-final-readback",
        size: bytesPerRow * this.canvas.height,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
      encoder.copyTextureToBuffer(
        { texture: currentTexture },
        { buffer, bytesPerRow, rowsPerImage: this.canvas.height },
        { width: this.canvas.width, height: this.canvas.height, depthOrArrayLayers: 1 },
      );
      return { request, buffer, bytesPerRow, width: this.canvas.width, height: this.canvas.height };
    }

    resolveReadback(readback) {
      if (!readback) return;
      void readback.buffer
        .mapAsync(GPUMapMode.READ)
        .then(() => {
          const data = new Uint8Array(readback.buffer.getMappedRange()).slice();
          readback.buffer.unmap();
          readback.buffer.destroy();
          readback.request.resolve({
            data,
            width: readback.width,
            height: readback.height,
            bytesPerRow: readback.bytesPerRow,
            format: this.format,
          });
        })
        .catch((error) => {
          readback.buffer.destroy();
          readback.request.reject(error);
        });
    }

    readPixels() {
      if (this.pendingReadback) {
        return Promise.reject(new Error("pixel readback already pending"));
      }
      return new Promise((resolve, reject) => {
        this.pendingReadback = { resolve, reject };
      });
    }

    destroyFrameTextures() {
      this.hdrTexture?.destroy();
      this.bloomTexture?.destroy();
      this.sourceTexture?.destroy();
      this.hdrTexture = null;
      this.bloomTexture = null;
      this.sourceTexture = null;
    }

    dispose() {
      this.pendingReadback?.reject(new Error("renderer disposed"));
      this.pendingReadback = null;
      this.destroyFrameTextures();
      this.uniformBuffer?.destroy();
      this.segmentBuffer?.destroy();
      this.particleBuffer?.destroy();
      this.foregroundBuffer?.destroy();
      this.device?.destroy();
    }
  }

  function validateShaderNamespace() {
    for (const key of [
      "skyShader",
      "lensShader",
      "ringDirectShader",
      "simulationShader",
      "foregroundShader",
      "energyRenderShader",
      "bloomShader",
      "compositeShader",
      "sourceModes",
      "normalizeSourceMode",
      "createSourceCanvas",
      "paintSourceCanvas",
      "createForegroundInstances",
    ]) {
      if (!namespace[key]) throw createWebGpuError("missing_renderer", `SilidoxKerr.${key} is missing`);
    }
  }

  function createWebGpuError(code, message, cause) {
    const error = new Error(message);
    error.code = code;
    if (cause) error.cause = cause;
    return error;
  }

  namespace.createScene = (canvas) => KerrSceneRenderer.create(canvas);
})(globalThis);
