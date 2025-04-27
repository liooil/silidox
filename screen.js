export class Screen {
  constructor(node = document.getElementById('screen')) {
    this.node = node;
    this.node.controller = this;
    this.node.style.width = '100%';
    this.render();
  }
  render() {
    const circle = this.node.querySelector('circle');
    if (circle) {
      circle.setAttribute('r', 20);
    }
  }
  /**
   * 
   * @param {import('./engine').Engine} engine
   */
  monitor(engine) {
    const circle = this.node.querySelector('circle');
    if (circle) {
      circle.setAttribute('r', this.getCircleR(engine.heartCount));
    }
  }
  getCircleR(heartCount) {
    // 0 = 20
    // 10 = 60
    // 20 = 100
    if (heartCount <= 20) return 20 + heartCount * 1
    return 40
  }
}


