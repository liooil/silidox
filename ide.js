import { LADNode, LADSeries, LADParallel } from "./lad.js";

export class IDE {
  vars = [
    new SILVar("TICK", "INT32").readonly(),
    new SILVar("HEART", "BOOL").readonly(),
  ];
  lads = [
    new SILLad()
      .appendChild(LADNode.contact().operandOf("VAR_1"))
      .appendChild(LADNode.contact("closed").operandOf("VAR_1"))
      .appendChild(LADNode.coil().operandOf("VAR_2"))
      .appendChild(LADNode.coil("negated").operandOf("VAR_2")),
    new SILLad()
      .appendChild(LADNode.contact("positive").operandOf("VAR_1"))
      .appendChild(LADNode.contact("negative").operandOf("VAR_1"))
      .appendChild(LADNode.coil("positive").operandOf("VAR_2"))
      .appendChild(LADNode.coil("negative").operandOf("VAR_2")),
    new SILLad()
      .appendChild(LADNode.contact().operandOf("VAR_1"))
      .appendChild(LADNode.coil("set").operandOf("VAR_2"))
      .appendChild(LADNode.coil("reset").operandOf("VAR_2")),
    new SILLad(),
  ];
  head = document.createElement("table");
  body = document.createElement("div");

  constructor(node = document.getElementById("ide")) {
    this.node = node;
    this.node.controller = this;
    this.node.append(this.head, document.createElement("hr"), this.body);
    this.render();
  }
  render() {
    this.renderHead();
    this.renderBody();
  }

  renderHead() {
    this.head.innerHTML = "";
    const headRow = this.head.appendChild(document.createElement("tr"));
    for (const name of ["名称", "类型", "值"]) {
      const cell = headRow.appendChild(document.createElement("th"));
      cell.textContent = name;
    }
    const silvars = this.head.appendChild(document.createElement("tbody"));
    silvars.id = "ide-vars";
    for (const silvar of this.vars) {
      silvar.render(silvars);
    }
    const addBtnRow = this.head.appendChild(document.createElement("tr"));
    const addBtnCell = addBtnRow.appendChild(document.createElement("td"));
    addBtnCell.colSpan = 3;
    const addBtn = addBtnCell.appendChild(document.createElement("button"));
    addBtn.textContent = "添加变量";
    addBtn.onclick = () => {
      this.vars.push(new SILVar(this.getNextName("VAR_"), "BOOL", ""));
      this.renderHead();
    };
  }
  renderBody() {
    this.body.innerHTML = "";
    let width = 200;
    for (const lad of this.lads) {
      lad.layout();
      width = Math.max(width, lad.width);
    }
    for (const lad of this.lads) {
      lad.fitWidth(width - lad.width);
      lad.render(this.body);
    }
    const addBtn = this.body.appendChild(document.createElement("button"));
    addBtn.textContent = "添加梯级";
    addBtn.classList.add("add-lad");
    addBtn.onclick = () => {
      this.lads.push(new SILLad());
      this.renderBody();
    };
  }

  monitor(values) {
    for (const silvar of this.vars) {
      silvar.monitor(values[silvar.name]);
    }
  }

  getNextName(prefix) {
    let i = 1;
    while (this.vars.find((v) => v.name === `${prefix}${i}`)) {
      i++;
    }
    return `${prefix}${i}`;
  }
}

/**
 * 变量
 */
export class SILVar {
  editable = true;
  /**
   * @param {string} name
   * @param {string} type
   * @param {string} value
   */
  constructor(name, type, value = "") {
    this.name = name;
    this.type = type;
    this.value = value;
  }
  readonly() {
    this.editable = false;
    return this;
  }
  render(tbody) {
    const row = tbody.appendChild(document.createElement("tr"));
    row.controller = this;
    const nameCell = row.appendChild(document.createElement("td"));
    this.renderCell(nameCell, "name");
    const typeCell = row.appendChild(document.createElement("td"));
    this.renderCell(typeCell, "type");
    const valueCell = row.appendChild(document.createElement("td"));
    this.renderCell(valueCell, "value");
    this.node = row;
    this.nameCell = nameCell;
    this.typeCell = typeCell;
    this.valueCell = valueCell;
  }
  monitor(value) {
    if (this.valueCell) {
      this.valueCell.textContent = value;
      this.valueCell.style.color = "blue";
    }
  }

  renderCell(cell, key) {
    cell.textContent = this[key];
    if (this.editable) {
      cell.ondblclick = () => {
        const input = document.createElement("input");
        input.type = "text";
        input.value = this[key];
        cell.textContent = "";
        cell.appendChild(input);
        input.focus();
        input.onblur = () => {
          this[key] = input.value;
          cell.textContent = this[key];
          input.remove();
        };
      };
    } else {
      cell.style.color = "gray";
      cell.style.cursor = "not-allowed";
    }
  }
}

/**
 * 梯级
 */
export class SILLad extends LADSeries {
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
    const svg = parent.appendChild(
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
