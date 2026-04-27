# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Silidox (硅基问道) is a programming-themed browser game. A broken robot traverses a cultivation (修仙) world, using programming to craft and fight. The first unlockable language is **Ladder Diagram** (梯形图 / LD), the graphical language used in PLC industrial control.

The game is pure vanilla JS with ES modules — no frameworks, no build tools, no package.json. Open `index.html` directly or serve the directory with any static file server.

## Running

```bash
# Serve locally (pick one):
bun index.html
```

Then open `http://localhost:3000` in your browser.

There are no tests, linting, or build steps.

## Architecture

```
index.html  →  main.js  →  Engine  (engine.js)
                        →  Screen  (screen.js)
                        →  IDE     (ide.js → lad.js)
```

### Engine (`engine.js`)

The game loop runs on a 10ms `setInterval` (100 Hz). It maintains a sliding window of the last 100 ticks to compute a heart rate (`heartCount`). Each tick it:
1. Reads `HEART` from `this.vars` (set by pointer/touch events on the screen circle)
2. Evaluates the pulse count and updates the engine DOM text/color
3. Runs the user's ladder logic program (`this.program`)
4. Calls `monitor()` to push variable values to the IDE and Screen

The user's ladder program is injected via `engine.program = () => { /* user LAD logic compiled to JS */ }`.

### Screen (`screen.js`)

Renders the circular robot "core" display. The circle radius expands based on heart rate. Pointer events (mousedown/up, touchstart/end) on the circle toggle `engine.vars.HEART`.

### IDE (`ide.js`)

Two sections: a **variable table** (name, type, value) and a **ladder diagram editor**.

- `SILVar` — a variable with name, type, value. Has `readonly()` flag. Inline editing via double-click.
- Ladder rungs (`SILLad`) are rendered as inline SVGs inside draggable divs.
- Drag-and-drop: drag a shape to the trash bin to delete it; Ctrl+click for multi-select.
- Variables are monitored in real-time: the `monitor()` method updates displayed values.

### LAD (`lad.js`)

The Ladder Diagram graphics engine. Class hierarchy:

- `LADShape` — base class with position, sizing, connectors, and an SVG `<g>` render method
- `LADNode` — a contact (input section) or coil (output section). Types: `open`, `set`, `rise`, with optional `reverse`. Factory methods: `LADNode.contact(kind)`, `LADNode.coil(kind)`
- `LADParallel` — a parallel branch (container, not yet rendered)
- `LADSeries` — a horizontal chain of children. Handles layout (left-to-right positioning) and `fitWidth()` for uniform rung width
- `SILLad` — a rung (梯级). Extends `LADSeries`, renders as a full SVG with power rails, drag-and-drop support, and a unique `gid` for tree addressing

Each shape gets a `gid` (dot-separated path like `"0.1"`) that identifies its position in the tree and enables drag-and-drop targeting.

### Data types (`types.js`)

PLC-style integer type constants: `INT32_MAX`, `UINT32_MAX`, `INT16_MAX`, `INT8_MAX`, etc.

### CSS organization

- `style.css` — body/font base
- `screen.css` — cursor style for the core circle
- `ide.css` — IDE layout, ladder SVG styling, drag target (trash bin), shape selection

## Key patterns

- Each component stores a back-reference on its DOM node: `node.controller = this`. This is how `engine.monitor()` reaches the IDE and Screen controllers.
- Ladder shapes use a builder-pattern fluent API: `LADNode.contact().operandOf("X").reversed()`.
- The `gid` addressing scheme uses dotted paths (e.g., `"0"`, `"0.1"`, `"0.1.2"`) for tree navigation during drag-and-drop.
