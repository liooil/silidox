# Architecture and Development Guidelines

This document records project-level architecture decisions for Silidox.

## Platform Decision

Silidox should stay a native browser game built with plain HTML, CSS, and JavaScript.

Use:

- HTML
- CSS
- Vanilla JavaScript
- Browser-native APIs such as DOM, SVG, Canvas, localStorage, and drag-and-drop

Do not introduce:

- React, Vue, Svelte, Angular, or similar UI frameworks
- Bundlers or build systems
- Transpilers
- Runtime package dependencies
- A required `package.json`

The game should remain understandable as a small source repository that can be inspected and modified directly.

## Run Model

Opening `index.html` should be enough to start playing.

This direct-file workflow is a hard constraint for the current project shape. Serving locally is allowed for convenience:

```bash
bun index.html
```

But local serving must not become mandatory unless the project explicitly decides to change its platform model.

## Release Model

Release the source repository directly.

There is no generated `dist` directory, build artifact, packed app, or deployment pipeline in the current plan. A release should be the checked-in source files plus assets needed by `index.html`.

Implications:

- Keep all runtime code and assets in the repository.
- Avoid CDN-only dependencies.
- Avoid generated files that must be rebuilt before playing.
- Prefer stable relative paths from `index.html`.
- Keep manual verification simple: open `index.html` or run `bun index.html`.

## Script Model

The current runtime uses classic browser scripts instead of ES modules:

```html
<script src="./src/data.js"></script>
<script src="./src/ladder-editor.js"></script>
<script src="./src/app.js"></script>
```

This preserves direct `file://` loading. If the project later considers ES modules, first decide whether losing direct-file compatibility is acceptable.

## Development Style

Prefer small, explicit modules by responsibility:

- `src/data.js`: shared static data
- `src/ladder-editor.js`: Ladder Diagram editing, rendering, compiling, and rung evaluation
- `src/app.js`: game loop, world simulation, and screen rendering
- `styles.css`: active page styling

Cultivation thresholds, I/O identifiers, output actions, and rail/world templates should stay in
`src/data.js` when they are static shared data.

Use browser-native structures before inventing abstractions. Add abstractions only when they reduce real complexity or keep feature work local.

## Compatibility Expectations

When changing runtime architecture, preserve:

- Direct `index.html` playability
- No build step
- No framework dependency
- Source-repository release model
- Clear file boundaries
