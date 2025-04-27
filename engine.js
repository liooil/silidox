export class Engine {
  heartWindow = Array.from({ length: 100 }, () => false);
  heartCount = 0;
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
    // 读取 input
    this.vars.TICK = (this.vars.TICK + 1) % 1000;
    let idx = this.vars.TICK % 100
    if (this.heartWindow[idx]) {
      this.heartCount--
    }
    if (this.vars.HEART) {
      this.heartCount++;
    }
    this.heartWindow[idx] = this.vars.HEART
    // 计算心跳, 心跳数在 10 到 90 之间
    if (this.heartCount < 10) {
      this.node.textContent = '核心脉冲过低';
      this.node.style.background = 'lightcoral';
      this.node.style.color = 'white';
    } else if (this.heartCount > 20) {
      this.node.textContent = '核心脉冲过高';
      this.node.style.background = 'lightcoral';
      this.node.style.color = 'white';
    } else if (this.heartCount > 30) {
      this.node.textContent = '核心脉冲过载';
      this.node.style.background = 'lightyellow';
      this.node.style.color = 'black';
    } else {
      this.node.textContent = '核心脉冲正常';
      this.node.style.background = 'lightgreen';
      this.node.style.color = 'black';
    }
    this.program?.();
    // 写入 output
    this.monitor();
  }
  monitor() {
    const ide = document.getElementById('ide')?.controller;
    ide?.monitor(this.vars);
    const screen = document.getElementById('screen')?.controller;
    screen?.monitor(this);
  }
}