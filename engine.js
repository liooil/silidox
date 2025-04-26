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
    let val = this.heartWindow.shift();
    if (val) {
      this.heartCount--;
    }
    this.heartWindow.push(this.vars.HEART);
    if (this.vars.HEART) {
      this.heartCount++;
    }
    // 计算心跳, 心跳数在 10 到 90 之间
    if (this.heartCount < 10) {
      this.node.textContent = '核心脉冲过低';
      this.node.style.background = 'lightcoral';
      this.node.style.color = 'white';
    } else if (this.heartCount > 90) {
      this.node.textContent = '核心脉冲过高';
      this.node.style.background = 'lightcoral';
      this.node.style.color = 'white';
    } else if (this.heartCount > 50) {
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