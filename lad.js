export class LADShape {
  location = { x: 0, y: 0 };
  size = { top: 0, bottom: 0, left: 0, right: 0 };
  innerSize = { left: 0, right: 0 };
  get width() {
    return this.size.left + this.size.right;
  }
  get height() {
    return this.size.top + this.size.bottom;
  }
  get connectors() {
    return {
      left: this.location.x - this.innerSize.left,
      right: this.location.x + this.innerSize.right,
    };
  }
  /**
   * @param {SVGElement} parent
   */
  render(parent) {
    const g = parent.appendChild(
      document.createElementNS("http://www.w3.org/2000/svg", "g"),
    );
    g.classList.add("shape");
    g.controller = this;
    this.node = g;
    g.setAttribute(
      "transform",
      `translate(${this.location.x},${this.location.y})`,
    );
    return g;
  }
}

export class LADNode extends LADShape {
  /** @type {'input' | 'output'} */
  section = "input";
  /** @type {'open' | 'set' | 'rise'} */
  type = "open";
  reverse = false;
  operand = "";
  output() {
    this.section = "output";
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
  operandOf(operand = "") {
    this.operand = operand;
    return this;
  }
  layout() {
    this.size.left = 40;
    this.size.right = 40;
    this.size.top = 40;
    this.size.bottom = 20;
    this.innerSize.left = this.section === "input" ? 10 : 12;
    this.innerSize.right = this.section === "input" ? 10 : 12;
  }
  fitWidth(dx) {
    if (this.section === "input") return 0;
    this.location.x += dx;
    return dx;
  }
  render(parent) {
    const g = super.render(parent);
    const rect = g.appendChild(
      document.createElementNS("http://www.w3.org/2000/svg", "rect"),
    );
    rect.classList.add("node-rect");
    rect.setAttribute("x", -this.size.left);
    rect.setAttribute("y", -this.size.top);
    rect.setAttribute("width", this.size.left + this.size.right);
    rect.setAttribute("height", this.size.top + this.size.bottom);
    rect.setAttribute("fill", "white");
    rect.setAttribute("stroke", "black");
    const text = g.appendChild(
      document.createElementNS("http://www.w3.org/2000/svg", "text"),
    );
    text.textContent = this.operand;
    text.setAttribute("y", -20);
    text.setAttribute("text-anchor", "middle");
    if (this.section === "input") {
      let path;
      path = g.appendChild(
        document.createElementNS("http://www.w3.org/2000/svg", "path"),
      );
      path.setAttribute("d", `M-10,-10 L-10,10`);
      path.setAttribute("stroke", "black");
      path.setAttribute("fill", "none");
      path = g.appendChild(
        document.createElementNS("http://www.w3.org/2000/svg", "path"),
      );
      path.setAttribute("d", `M10,-10 L10,10`);
      path.setAttribute("stroke", "black");
      path.setAttribute("fill", "none");
    } else {
      let path;
      let dx = 3;
      let dy = 2;
      path = g.appendChild(
        document.createElementNS("http://www.w3.org/2000/svg", "path"),
      );
      path.setAttribute(
        "d",
        `M${-10 + dx},-10 C${-10 - dx},${-10 + dy} ${-10 - dx},${10 - dy} ${-10 + dx},10`,
      );
      path.setAttribute("stroke", "black");
      path.setAttribute("fill", "none");
      path = g.appendChild(
        document.createElementNS("http://www.w3.org/2000/svg", "path"),
      );
      path.setAttribute(
        "d",
        `M${10 - dx},-10 C${10 + dx},${-10 + dy} ${10 + dx},${10 - dy} ${10 - dx},10`,
      );
      path.setAttribute("stroke", "black");
      path.setAttribute("fill", "none");
    }
    const icon = g.appendChild(
      document.createElementNS("http://www.w3.org/2000/svg", "text"),
    );
    icon.setAttribute("text-anchor", "middle");
    icon.setAttribute("dominant-baseline", "middle");
    icon.setAttribute("font-size", "20px");
    if (this.type === "open") {
      icon.textContent = this.reverse ? "/" : " ";
    } else if (this.type === "set") {
      icon.textContent = this.reverse ? "R" : "S";
    } else if (this.type === "rise") {
      icon.textContent = this.reverse ? "N" : "P";
    }
  }
  static contact(kind = "open") {
    const self = new LADNode();
    switch (kind) {
      case "open":
        return self;
      case "closed":
        return self.reversed();
      case "positive":
        return self.typeOf("rise");
      case "negative":
        return self.typeOf("rise").reversed();
      default:
        return self;
    }
  }
  static coil(kind = "default") {
    const self = new LADNode().output();
    switch (kind) {
      case "default":
        return self;
      case "negated":
        return self.reversed();
      case "set":
        return self.typeOf("set");
      case "reset":
        return self.typeOf("set").reversed();
      case "positive":
        return self.typeOf("rise");
      case "negative":
        return self.typeOf("rise").reversed();
      default:
        return self;
    }
  }
}

export class LADParallel extends LADShape {
  children = [];
  appendChild(child) {
    child.gid = [this.gid, this.children.length].join(".");
    this.children.push(child);
    return this;
  }
  layout() {}
}

export class LADSeries extends LADShape {
  /** @type {(LADParallel | LADNode)[]} */
  children = [];
  appendChild(child) {
    child.gid = [this.gid, this.children.length].join(".");
    this.children.push(child);
    return this;
  }
  layout() {
    for (const child of this.children) {
      child.layout();
      this.size.top = Math.max(this.size.top, child.size.top);
      this.size.bottom = Math.max(this.size.bottom, child.size.bottom);
    }
    this.location.y = this.size.top;

    let x = 0;
    for (const child of this.children) {
      x += child.size.left;
      child.location.x = x;
      x += child.size.right;
      x += 20;
    }
    if (this.children.length > 0) {
      const firstChild = this.children[0];
      this.innerSize.left = -firstChild.connectors.left;
      const lastChild = this.children[this.children.length - 1];
      this.innerSize.right = lastChild.connectors.right;
    }
    this.size.right = x;
    console.log(this.width);
  }
  /**
   * Adjusts the width of the series layout by the given delta.
   * @param {number} dx The delta width to adjust.
   */
  fitWidth(dx) {
    this.size.right += dx;
    this.innerSize.right += dx;
    for (let i = this.children.length - 1; i >= 0; i--) {
      dx = this.children[i].fitWidth(dx);
      if (dx === 0) {
        break;
      }
    }
    return dx;
  }
  render(parent) {
    const g = super.render(parent);
    for (const child of this.children) {
      child.render(g);
    }
    for (let i = 0; i < this.children.length - 1; i++) {
      const child = this.children[i];
      const nextChild = this.children[i + 1];
      const line = g.appendChild(
        document.createElementNS("http://www.w3.org/2000/svg", "line"),
      );
      line.setAttribute("x1", child.connectors.right);
      line.setAttribute("x2", nextChild.connectors.left);
      line.setAttribute("stroke", "black");
      line.setAttribute("fill", "none");
    }
    return g;
  }
}

/**
 * 梯级
 */
export class SILLad extends LADSeries {
  constructor(gid = "") {
    super();
    this.gid = gid;
  }
  layout() {
    if (this.children.length === 0) {
      this.location.y = 20;
      this.size.right = 200;
      this.size.bottom = 40;
    } else {
      super.layout();
    }
  }
  render(parent) {
    const div = parent.appendChild(document.createElement("div"));
    div.draggable = true;
    div.onmousedown = (ev) => {
      div.draggingNode = ev.target?.closest("g.shape");
    };
    div.onmouseup = (ev) => {
      div.draggingNode = undefined;
    };
    div.ondragstart = (ev) => {
      if (div.draggingNode) {
        ev.dataTransfer.setData("gid", div.draggingNode.controller.gid);
        ev.dataTransfer.effectAllowed = "move";
        const boundingRect = div.draggingNode.getBoundingClientRect();
        ev.dataTransfer.setDragImage(
          div.draggingNode,
          ev.clientX - boundingRect.left,
          ev.clientY - boundingRect.top,
        );
        const trashBin = document.getElementById("trash-bin");
        if (trashBin) {
          trashBin.style.display = "block";
        }
        div.draggingNode = undefined;
      } else {
        ev.dataTransfer.setData("gid", this.gid);
        ev.dataTransfer.effectAllowed = "move";
        const trashBin = document.getElementById("trash-bin");
        if (trashBin) {
          trashBin.style.display = "block";
        }
      }
    };
    div.ondragend = (ev) => {
      const trashBin = document.getElementById("trash-bin");
      if (trashBin) {
        trashBin.style.display = "none";
      }
    };
    const svg = div.appendChild(
      document.createElementNS("http://www.w3.org/2000/svg", "svg"),
    );
    svg.classList.add("lad");
    svg.setAttribute("viewBox", `0 0 ${this.width} ${this.height}`);
    svg.setAttribute("width", `100%`);
    svg.setAttribute("preserveAspectRatio", "xMinYMin meet");
    super.render(svg);
    if (this.children.length > 0) {
      /** @type {SVGLineElement} */
      let line;
      line = svg.appendChild(
        document.createElementNS("http://www.w3.org/2000/svg", "line"),
      );
      line.setAttribute("x1", 0);
      line.setAttribute("x2", this.connectors.left);
      line.setAttribute("y1", this.location.y);
      line.setAttribute("y2", this.location.y);
      line.setAttribute("stroke", "black");
      line.setAttribute("stroke-width", "2");
      line = svg.appendChild(
        document.createElementNS("http://www.w3.org/2000/svg", "line"),
      );
      line.setAttribute("x1", this.connectors.right);
      line.setAttribute("x2", this.width);
      line.setAttribute("y1", this.location.y);
      line.setAttribute("y2", this.location.y);
      line.setAttribute("stroke", "black");
      line.setAttribute("stroke-width", "2");
    } else {
      const line = svg.appendChild(
        document.createElementNS("http://www.w3.org/2000/svg", "line"),
      );
      line.setAttribute("x1", 0);
      line.setAttribute("x2", this.width);
      line.setAttribute("y1", this.location.y);
      line.setAttribute("y2", this.location.y);
      line.setAttribute("stroke", "black");
      line.setAttribute("stroke-width", "2");
    }
    return svg;
  }
}
