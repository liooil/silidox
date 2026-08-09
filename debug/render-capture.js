// Shared browser-side capture helpers for direct-file debug scenes.
(function defineSilidoxRenderCapture(global) {
  const TAR_BLOCK_BYTES = 512;
  const encoder = new TextEncoder();

  function parseRequest(search = global.location?.search || "") {
    const params = new URLSearchParams(search);
    const kind = params.get("capture");
    if (kind !== "frame" && kind !== "video") return null;

    return {
      kind,
      captureId: safeToken(params.get("captureId") || `capture-${Date.now()}`),
      timeSeconds: numberParameter(params, "time", 0, 0, 30),
      progress: numberParameter(params, "progress", 1, 0, 1),
      speed: numberParameter(params, "speed", 1, 0.05, 8),
      durationSeconds: numberParameter(params, "duration", 6, 1, 30),
      tracer: booleanParameter(params, "tracer", false),
      width: integerParameter(params, "width", 1600, 640, 3840),
      height: integerParameter(params, "height", 900, 360, 2160),
    };
  }

  function numberParameter(params, key, fallback, minimum, maximum) {
    if (!params.has(key)) return fallback;
    const value = Number(params.get(key));
    if (!Number.isFinite(value)) return fallback;
    return Math.max(minimum, Math.min(maximum, value));
  }

  function integerParameter(params, key, fallback, minimum, maximum) {
    return Math.round(numberParameter(params, key, fallback, minimum, maximum));
  }

  function booleanParameter(params, key, fallback) {
    if (!params.has(key)) return fallback;
    return ["1", "true", "yes", "on"].includes(String(params.get(key)).toLowerCase());
  }

  function safeToken(value) {
    const token = String(value || "capture")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64);
    return token || "capture";
  }

  async function frameToPng(frame) {
    validateFrame(frame);
    const canvas = document.createElement("canvas");
    canvas.width = frame.width;
    canvas.height = frame.height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("2D canvas unavailable for PNG encoding");

    const image = context.createImageData(frame.width, frame.height);
    const bgra = frame.format.startsWith("bgra");
    let targetOffset = 0;
    for (let y = 0; y < frame.height; y += 1) {
      let sourceOffset = y * frame.bytesPerRow;
      for (let x = 0; x < frame.width; x += 1) {
        image.data[targetOffset] = frame.data[sourceOffset + (bgra ? 2 : 0)];
        image.data[targetOffset + 1] = frame.data[sourceOffset + 1];
        image.data[targetOffset + 2] = frame.data[sourceOffset + (bgra ? 0 : 2)];
        image.data[targetOffset + 3] = frame.data[sourceOffset + 3];
        sourceOffset += 4;
        targetOffset += 4;
      }
    }
    context.putImageData(image, 0, 0);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error("PNG encoder returned no data"))),
        "image/png",
      );
    });
    canvas.width = 1;
    canvas.height = 1;
    return blob;
  }

  function validateFrame(frame) {
    if (!frame || !Number.isInteger(frame.width) || !Number.isInteger(frame.height)) {
      throw new Error("invalid GPU frame dimensions");
    }
    if (!(frame.data instanceof Uint8Array) || !Number.isInteger(frame.bytesPerRow)) {
      throw new Error("invalid GPU frame data");
    }
    if (!String(frame.format).includes("8unorm")) {
      throw new Error(`unsupported GPU frame format: ${frame.format}`);
    }
  }

  async function createBundle({ artifactName, artifactBlob, manifest }) {
    const entries = [];
    if (artifactBlob) {
      entries.push({
        name: safeFileName(artifactName),
        data: new Uint8Array(await artifactBlob.arrayBuffer()),
      });
    }
    entries.push({
      name: "capture.json",
      data: encoder.encode(`${JSON.stringify(manifest, null, 2)}\n`),
    });
    return createTar(entries);
  }

  function createTar(entries) {
    const chunks = [];
    const modifiedSeconds = Math.floor(Date.now() / 1000);
    for (const entry of entries) {
      const data = entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data);
      chunks.push(createTarHeader(entry.name, data.byteLength, modifiedSeconds), data);
      const remainder = data.byteLength % TAR_BLOCK_BYTES;
      if (remainder) chunks.push(new Uint8Array(TAR_BLOCK_BYTES - remainder));
    }
    chunks.push(new Uint8Array(TAR_BLOCK_BYTES * 2));
    return new Blob(chunks, { type: "application/x-tar" });
  }

  function createTarHeader(name, size, modifiedSeconds) {
    const header = new Uint8Array(TAR_BLOCK_BYTES);
    writeText(header, 0, 100, safeFileName(name));
    writeOctal(header, 100, 8, 0o644);
    writeOctal(header, 108, 8, 0);
    writeOctal(header, 116, 8, 0);
    writeOctal(header, 124, 12, size);
    writeOctal(header, 136, 12, modifiedSeconds);
    header.fill(0x20, 148, 156);
    header[156] = "0".charCodeAt(0);
    writeText(header, 257, 6, "ustar");
    writeText(header, 263, 2, "00");
    writeText(header, 265, 32, "silidox");
    writeText(header, 297, 32, "silidox");
    let checksum = 0;
    for (const byte of header) checksum += byte;
    const checksumText = checksum.toString(8).padStart(6, "0").slice(-6);
    writeText(header, 148, 6, checksumText);
    header[154] = 0;
    header[155] = 0x20;
    return header;
  }

  function writeText(target, offset, length, value) {
    const bytes = encoder.encode(String(value));
    target.set(bytes.subarray(0, length), offset);
  }

  function writeOctal(target, offset, length, value) {
    const text = Math.max(0, Math.floor(value))
      .toString(8)
      .padStart(length - 1, "0")
      .slice(-(length - 1));
    writeText(target, offset, length - 1, text);
    target[offset + length - 1] = 0;
  }

  function safeFileName(value) {
    const fileName = String(value || "capture.bin")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100);
    return fileName || "capture.bin";
  }

  function download(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = safeFileName(fileName);
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    global.setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  global.SilidoxRenderCapture = Object.freeze({
    parseRequest,
    safeToken,
    frameToPng,
    createBundle,
    download,
  });
})(globalThis);
