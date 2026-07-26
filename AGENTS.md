# AGENTS.md

This file provides guidance to Codex when working with code in this repository.

Project-level architecture and development decisions live in `ARCHITECTURE.md`. Worldbuilding canon and open setting ideas live in `WORLD.md`, with detailed setting documents under `world/`. Follow these documents when choosing implementation approaches and writing in-game text. Write setting documents and in-game setting prose in Chinese by default.

## Project Overview

Silidox (硅基问道) is a programming-themed browser game. A broken robot traverses a cultivation (修仙) world, using programming to craft and fight. The first unlockable language is **Ladder Diagram** (梯形图 / LD), the graphical language used in PLC industrial control.

The current MVP is a pure vanilla browser app: no framework, no build step, and no `package.json`. It is written as classic browser scripts so `index.html` can still be opened directly from disk.

Do not introduce React, Vue, Svelte, Angular, bundlers, transpilers, or runtime package dependencies unless the project explicitly changes its architecture decision in `ARCHITECTURE.md`.

## Running

```bash
bun index.html
```

Then open `http://localhost:3000` in a browser.

You can also open `index.html` directly. Keep this direct-file workflow working unless there is a deliberate decision to move to ES modules or a build step.

There are no formal tests, linting, or build steps.

The release model is the source repository itself. Do not assume a generated `dist` artifact or deployment build.

## Current Runtime Architecture

```
index.html
  -> styles.css
  -> src/data.js
  -> src/ladder-editor.js
  -> src/app.js
```

### `src/data.js`

Shared static data:

- Input pins: `I0` through `I7`
- Output coils/actions: `Q0` through `Q4`
- Cultivation realm thresholds
- Action priority order
- One-dimensional rail length, start index, and fragment positions

Keep this file side-effect free.

### `src/ladder-editor.js`

The graphical Ladder Diagram editor and compiler.

Responsibilities:

- Load, normalize, migrate, and save ladder programs in `localStorage`
- Render ladder rungs as inline SVG
- Support toolbar insertion of rungs, contacts, and coils
- Support drag-and-drop insertion from the toolbar
- Support dragging existing contacts to reorder them or move them between rungs
- Maintain the selected rung/contact/coil
- Render the contextual pin picker
- Compile ladder data into runtime rungs
- Evaluate compiled rungs against sensor values

Current ladder data shape:

```js
{
  id: "rung-1",
  enabled: true,
  contacts: [{ op: "XIC", pin: "I1" }],
  coil: "Q2",
}
```

Supported contact operations:

- `XIC`: normally-open contact
- `XIO`: normally-closed contact

Parallel branches are not implemented yet. Track editor roadmap items in `TODO.md`.

### `src/app.js`

Main game runtime and world rendering.

Responsibilities:

- Cache DOM references
- Initialize the ladder editor
- Create and reset world state
- Run ticks
- Read world sensors
- Apply selected output action to the robot
- Render sensors, log lines, canvas world, and metrics
- Wire compile, step, run, and reset controls

`src/app.js` depends on globals defined by `src/data.js` and `src/ladder-editor.js`, so script order in `index.html` matters.

## Legacy Files

The root-level files below are legacy prototype code and are not loaded by the current `index.html` runtime:

- `main.js`
- `engine.js`
- `screen.js`
- `ide.js`
- `lad.js`
- `types.js`
- `site-nav.js`
- `SILLad.js`
- `style.css`, `screen.css`, `ide.css`

Do not assume those files are active just because they exist. If reusing code from them, first verify whether it still matches the current MVP.

## CSS Organization

The active page uses root-level `styles.css`.

Current major sections:

- Global theme and layout
- Manual panel
- Ladder editor panel
- Sensor/log terminal area
- Canvas world panel
- Responsive layout

## Worldbuilding Documents

- `WORLD.md`: setting canon, terminology, and open questions
- `world/faction-cards/`: detailed faction and cultivation-path designs
- `world/characters.md`: provisional era characters, histories, conflicts, and relationships
- `world/mortal-societies.md`: mortal ideologies and political systems
- `world/production-relations.md`: automation, ownership, labor, and later social conflict
- `world/naming-guide.md`: naming research and project naming rules
- `world/ai-character-contract.md`: provider-neutral AI role-card and game-state protocol
- `world/character-prompts/`: model-callable character prompt prototypes

Character and faction names marked as provisional must stay provisional until their regions, families, sect histories, and naming systems are defined. AI character prompts must preserve the direct-file game: online model access is optional, model output is untrusted, and the local game engine validates every action before applying it.

## Key Patterns

- Follow `ARCHITECTURE.md` for platform and release constraints.
- Follow `WORLD.md` for setting canon, terminology, and open worldbuilding questions.
- Follow `world/naming-guide.md` before assigning formal character, faction, location, or technique names.
- Follow `world/ai-character-contract.md` for role-card inputs, outputs, memory, and validation boundaries.
- Write worldbuilding notes and setting prose in Chinese by default; use English only for technical names, code identifiers, or deliberate contrast.
- The app intentionally uses classic scripts for direct `index.html` support.
- `src/data.js` should stay side-effect free.
- `src/ladder-editor.js` owns ladder data, editing, compiling, and rung evaluation.
- `src/app.js` owns simulation state and visual world rendering.
- The ladder editor persists to `localStorage` under `silidox.ladder.v2`.
- Legacy text programs may be migrated from `silidox.program`.
- `TODO.md` is the source of truth for near-term implementation tasks.

## Verification

Use the bundled or local Node executable for syntax checks when available:

```bash
node --check src/data.js
node --check src/ladder-editor.js
node --check src/app.js
git diff --check
```

For manual verification, run `bun index.html`, open the page, then check:

- Ladder rungs render correctly
- Contacts and coils are selectable
- Toolbar click insertion works
- Toolbar drag insertion works
- Existing contact drag reordering works
- Pin picker updates selected contact/coil
- `1 tick` advances the world
