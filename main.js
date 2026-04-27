import { Engine } from "./engine.js";
import { Screen } from "./screen.js";
import { IDE } from "./ide.js";

const app = document.getElementById("app");

const engine = new Engine();
const screen = new Screen();
const ide = new IDE();

for (const silvar of ide.vars) {
  if (!(silvar.name in engine.vars)) {
    engine.vars[silvar.name] = false;
  }
}

engine.program = () => ide.evaluate(engine);

const circle = screen.node;

circle.onmousedown = () => {
  engine.vars.HEART = true;
};
circle.onmouseup = () => {
  engine.vars.HEART = false;
};

circle.addEventListener("touchstart", (ev) => {
  ev.preventDefault();
  engine.vars.HEART = true;
});

circle.addEventListener("touchend", () => {
  engine.vars.HEART = false;
});
