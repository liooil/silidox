import { Engine } from "./engine.js"

const app = document.getElementById('app')

const engine = new Engine()

function add(parent, tag, id) {
  const el = parent.appendChild(document.createElement(tag))
  el.id = id;
  return el;
}

const pulse = add(app, 'div', 'pulse')

pulse.textContent = '心跳'
pulse.onclick = () => {
  engine.pulse()
  pulse.animate([
    {},
    {},
  ], 1000);
}