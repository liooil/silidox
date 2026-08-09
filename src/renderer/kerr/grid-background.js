// Diagnostic 2D source canvas used to expose the Kerr lens mapping.
(function defineSilidoxKerrGridBackground(global) {
  const namespace = (global.SilidoxKerr = global.SilidoxKerr || {});

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
})(globalThis);
