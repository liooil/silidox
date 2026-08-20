// Deterministic star field plus the diagnostic source plane used by the Kerr lens.
(function defineSilidoxKerrGridBackground(global) {
  const namespace = (global.SilidoxKerr = global.SilidoxKerr || {});

  namespace.sourceModes = Object.freeze({
    stars: "stars",
    grid: "grid",
  });

  namespace.normalizeSourceMode = function normalizeSourceMode(mode) {
    return mode === namespace.sourceModes.grid
      ? namespace.sourceModes.grid
      : namespace.sourceModes.stars;
  };

  namespace.createSourceCanvas = function createSourceCanvas(width, height, mode = "stars") {
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    namespace.paintSourceCanvas(canvas, width, height, mode);
    return canvas;
  };

  namespace.paintSourceCanvas = function paintSourceCanvas(canvas, width, height, mode = "stars") {
    const sourceMode = namespace.normalizeSourceMode(mode);
    if (sourceMode === namespace.sourceModes.grid) {
      namespace.paintGridCanvas(canvas, width, height);
      return sourceMode;
    }
    namespace.paintStarCanvas(canvas, width, height);
    return sourceMode;
  };

  namespace.createStarCanvas = function createStarCanvas(width, height) {
    return namespace.createSourceCanvas(width, height, namespace.sourceModes.stars);
  };

  namespace.paintStarCanvas = function paintStarCanvas(canvas, width, height) {
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Kerr star field requires a 2D canvas context");

    const safeWidth = canvas.width;
    const safeHeight = canvas.height;
    const minimumDimension = Math.min(safeWidth, safeHeight);
    context.fillStyle = "#010207";
    context.fillRect(0, 0, safeWidth, safeHeight);

    context.save();
    context.translate(safeWidth * 0.52, safeHeight * 0.46);
    context.rotate(-0.20);
    const bandHeight = Math.max(96, minimumDimension * 0.34);
    const galaxy = context.createLinearGradient(0, -bandHeight, 0, bandHeight);
    galaxy.addColorStop(0, "rgba(7, 12, 24, 0)");
    galaxy.addColorStop(0.33, "rgba(32, 45, 68, 0.18)");
    galaxy.addColorStop(0.50, "rgba(84, 75, 70, 0.24)");
    galaxy.addColorStop(0.66, "rgba(26, 42, 70, 0.17)");
    galaxy.addColorStop(1, "rgba(5, 9, 20, 0)");
    context.fillStyle = galaxy;
    context.fillRect(-safeWidth, -bandHeight, safeWidth * 2, bandHeight * 2);
    context.restore();

    const starCount = Math.min(2200, Math.max(420, Math.round((safeWidth * safeHeight) / 720)));
    for (let index = 0; index < starCount; index += 1) {
      const x = hash01(index * 11.73 + 2.17) * safeWidth;
      const baseY = hash01(index * 19.91 + 8.41);
      const bandBias = (hash01(index * 5.37 + 4.03) - 0.5) * 0.34;
      const galaxyY = 0.46 - (x / safeWidth - 0.52) * 0.20 + bandBias;
      const inBand = hash01(index * 29.17 + 6.11) > 0.46;
      const y = (inBand ? galaxyY : baseY) * safeHeight;
      if (y < 0 || y > safeHeight) continue;

      const energy = Math.pow(hash01(index * 41.31 + 1.27), 5.2);
      const radius = 0.35 + energy * 1.65;
      const warmth = hash01(index * 13.57 + 9.73);
      const alpha = 0.20 + energy * 0.76;
      context.fillStyle =
        warmth > 0.82
          ? `rgba(255, 220, 174, ${alpha})`
          : warmth < 0.18
            ? `rgba(170, 208, 255, ${alpha})`
            : `rgba(226, 234, 244, ${alpha})`;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();

      if (energy > 0.78) {
        context.strokeStyle = `rgba(224, 235, 255, ${alpha * 0.42})`;
        context.lineWidth = 0.7;
        context.beginPath();
        context.moveTo(x - radius * 3.2, y);
        context.lineTo(x + radius * 3.2, y);
        context.moveTo(x, y - radius * 2.2);
        context.lineTo(x, y + radius * 2.2);
        context.stroke();
      }
    }

    const dustCount = Math.round(starCount * 0.34);
    context.fillStyle = "rgba(162, 181, 210, 0.13)";
    for (let index = 0; index < dustCount; index += 1) {
      const x = hash01(index * 23.71 + 17.4) * safeWidth;
      const centerY = safeHeight * (0.46 - (x / safeWidth - 0.52) * 0.20);
      const y = centerY + (hash01(index * 31.13 + 3.2) - 0.5) * minimumDimension * 0.25;
      context.fillRect(x, y, 0.8, 0.8);
    }
  };

  namespace.createGridCanvas = function createGridCanvas(width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    canvas.setAttribute("aria-hidden", "true");
    namespace.paintGridCanvas(canvas, width, height);
    return canvas;
  };

  namespace.paintGridCanvas = function paintGridCanvas(canvas, width, height) {
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Kerr diagnostic grid requires a 2D canvas context");

    const minimumDimension = Math.min(width, height);
    const centerX = Math.round((width + minimumDimension * 0.1) * 0.5) + 0.5;
    const centerY = Math.round((height - minimumDimension * 0.15) * 0.5) + 0.5;
    const minorStep = 24;
    const majorStep = minorStep * 4;
    const gradient = context.createRadialGradient(
      centerX,
      centerY,
      minimumDimension * 0.08,
      centerX,
      centerY,
      Math.max(width, height) * 0.76,
    );
    gradient.addColorStop(0, "#102234");
    gradient.addColorStop(0.48, "#07131f");
    gradient.addColorStop(1, "#02060b");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    context.lineWidth = 1;

    for (let x = centerX % minorStep; x <= width; x += minorStep) {
      const offset = Math.round((x - centerX) / minorStep);
      context.strokeStyle = offset % 4 === 0 ? "rgba(92, 211, 239, 0.34)" : "rgba(59, 151, 182, 0.16)";
      context.beginPath();
      context.moveTo(Math.round(x) + 0.5, 0);
      context.lineTo(Math.round(x) + 0.5, height);
      context.stroke();
    }
    for (let y = centerY % minorStep; y <= height; y += minorStep) {
      const offset = Math.round((y - centerY) / minorStep);
      context.strokeStyle = offset % 4 === 0 ? "rgba(92, 211, 239, 0.34)" : "rgba(59, 151, 182, 0.16)";
      context.beginPath();
      context.moveTo(0, Math.round(y) + 0.5);
      context.lineTo(width, Math.round(y) + 0.5);
      context.stroke();
    }

    context.strokeStyle = "rgba(145, 237, 255, 0.88)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(centerX, 0);
    context.lineTo(centerX, height);
    context.moveTo(0, centerY);
    context.lineTo(width, centerY);
    context.stroke();

    context.font = "600 11px ui-monospace, SFMono-Regular, Consolas, monospace";
    context.textBaseline = "top";
    for (let x = centerX + majorStep; x < width; x += majorStep) {
      context.fillStyle = "rgba(124, 219, 244, 0.72)";
      context.fillText(`X+${Math.round((x - centerX) / majorStep)}`, x + 6, centerY + 7);
    }
    for (let x = centerX - majorStep; x > 0; x -= majorStep) {
      context.fillStyle = "rgba(124, 219, 244, 0.72)";
      context.fillText(`X${Math.round((x - centerX) / majorStep)}`, x + 6, centerY + 7);
    }
    for (let y = centerY + majorStep; y < height; y += majorStep) {
      context.fillStyle = "rgba(124, 219, 244, 0.62)";
      context.fillText(`Y+${Math.round((y - centerY) / majorStep)}`, centerX + 8, y + 6);
    }
    for (let y = centerY - majorStep; y > 0; y -= majorStep) {
      context.fillStyle = "rgba(124, 219, 244, 0.62)";
      context.fillText(`Y${Math.round((y - centerY) / majorStep)}`, centerX + 8, y + 6);
    }

    const markers = [
      [width * 0.17, height * 0.24, "#ff9b45", "SOURCE A"],
      [width * 0.79, height * 0.22, "#83e7ff", "SOURCE B"],
      [width * 0.24, height * 0.78, "#d4ff77", "SOURCE C"],
      [width * 0.82, height * 0.73, "#e68cff", "SOURCE D"],
    ];
    for (const [x, y, color, label] of markers) {
      context.fillStyle = color;
      context.beginPath();
      context.arc(x, y, 5, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = color;
      context.fillText(label, x + 10, y - 6);
    }

    context.fillStyle = "rgba(167, 235, 251, 0.92)";
    context.font = "700 12px ui-monospace, SFMono-Regular, Consolas, monospace";
    context.fillText("KERR LENS SOURCE PLANE", 18, 16);
  };

  function hash01(value) {
    const sine = Math.sin(value * 12.9898 + 78.233) * 43758.5453123;
    return sine - Math.floor(sine);
  }
})(globalThis);
