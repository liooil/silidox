import { INT32_MAX } from './types.js';

export class Engine {
  heartWindow = Array.from({ length: 100 }, () => false);
  heartCount = 0;
  normalTicks = 0;
  levelComplete = false;
  prevVars = {};
  vars = {
    TICK: 0,
    HEART: false,
  }

  constructor(node = document.getElementById('engine')) {
    this.node = node;
    this.node.id = 'engine';
    this.node.controller = this;
    this.mainCycle = setInterval(this.main.bind(this), 10);
  }
  [Symbol.dispose]() {
    clearInterval(this.mainCycle);
  }
  main() {
    this.prevVars = { ...this.vars };
    this.vars.TICK = (this.vars.TICK + 1) % 1000;

    this.program?.();

    let idx = this.vars.TICK % 100;
    if (this.heartWindow[idx]) this.heartCount--;
    if (this.vars.HEART) this.heartCount++;
    this.heartWindow[idx] = this.vars.HEART;

    if (this.heartCount < 10) {
      this.normalTicks = 0;
      this.node.textContent = '核心脉冲过低';
      this.node.style.background = 'lightcoral';
      this.node.style.color = 'white';
    } else if (this.heartCount > 30) {
      this.normalTicks = 0;
      this.node.textContent = '核心脉冲过载';
      this.node.style.background = 'lightyellow';
      this.node.style.color = 'black';
    } else {
      this.normalTicks++;
      if (this.normalTicks >= 300 && !this.levelComplete) {
        this.levelComplete = true;
        this.node.textContent = '开机自检完成';
        this.node.style.background = '#4CAF50';
        this.node.style.color = 'white';
      } else if (!this.levelComplete) {
        this.node.textContent = '核心脉冲正常';
        this.node.style.background = 'lightgreen';
        this.node.style.color = 'black';
      }
    }
    this.monitor();
  }
  monitor() {
    const ide = document.getElementById('ide')?.controller;
    ide?.monitor(this.vars, this);
    const screen = document.getElementById('screen')?.controller;
    screen?.monitor(this);
  }
}