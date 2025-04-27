export class LADShape {
  location = { x: 0, y: 0 };
  boundingBox = { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 };
  set x(x) {
    const dx = x - this.location.x;
    this.location.x = x;
    this.boundingBox.left += dx;
    this.boundingBox.right += dx;
  }
  get x() {
    return this.location.x;
  }
  set y(y) {
    const dy = y - this.location.y;
    this.location.y = y;
    this.boundingBox.top += dy;
    this.boundingBox.bottom -= dy;
  }
  get y() {
    return this.location.y;
  }
  set top(y) {
    const dy = y - this.boundingBox.top;
    this.boundingBox.top = y;
    this.boundingBox.height -= dy;
  }
  get top() {
    return this.boundingBox.top;
  }
  set bottom(y) {
    const dy = y - this.boundingBox.bottom;
    this.boundingBox.bottom = y;
    this.boundingBox.height += dy;
  }
  get bottom() {
    return this.boundingBox.bottom;
  }
  set left(x) {
    const dx = x - this.boundingBox.left;
    this.boundingBox.left = x;
    this.boundingBox.width -= dx;
  }
  get left() {
    return this.boundingBox.left;
  }
  set right(x) {
    const dx = x - this.boundingBox.right;
    this.boundingBox.right = x;
    this.boundingBox.width += dx;
  }
  get right() {
    return this.boundingBox.right;
  }
}

export class LADNode extends LADShape {
  /** @type {'input' | 'output'} */
  section = 'input';
  /** @type {'open' | 'set' | 'rise'} */
  type = 'open';
  reverse = false;
  operand = '';
  output() {
    this.section = 'output';
    return this;
  }
  /**
   * @param {LADNode['type']} type
   */
  typeOf(type) {
    this.type = type;
    return this;
  }
  reversed() {
    this.reverse = true;
    return this;
  }
  operandOf(operand = '') {
    this.operand = operand;
    return this;
  }
  layout() {
    this.left -= 20;
    this.right += 20;
    this.top -= 40;
    this.bottom += 20;
  }
  render(parent) {
    const g = parent.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'g'));
    g.controller = this;
    g.setAttribute('transform', `translate(${this.x},${this.y})`);
    const text = g.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'text'));
    text.textContent = this.operand;
  }
  static contact(kind = 'open') {
    const self = new LADNode().output();
    switch (kind) {
      case 'open': return self;
      case 'closed': return self.reversed();
      case 'positive': return self.typeOf('rise');
      case 'negative': return self.typeOf('rise').reversed();
      default: return self;
    }
  }
  static coil(kind = 'default') {
    const self = new LADNode().output();
    switch (kind) {
      case 'default': return self;
      case 'closed': return self.reversed();
      case 'set': return self.typeOf('set');
      case 'reset': return self.typeOf('set').reversed();
      case 'positive': return self.typeOf('rise');
      case 'negative': return self.typeOf('rise').reversed();
      default: return self;
    }
  }
}

export class LADParallel extends LADShape {
  children = [];
  appendChild(child) {
    this.children.push(child);
    return this;
  }
  layout() {

  }
}

export class LADSeries extends LADShape {
  /** @type {(LADParallel | LADNode)[]} */
  children = [];
  appendChild(child) {
    this.children.push(child);
    return this;
  }
  layout() {
    let x = this.left;
    let top = this.top;
    let y = this.y;
    for (const child of this.children) {
      child.x = x;
      child.y = top;
      child.layout();
      y = Math.max(y, child.y);
    }
    for (const child of this.children) {
      child.y = y;
    }
  }
}
