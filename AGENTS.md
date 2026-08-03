# AGENTS.md

This file provides guidance to Codex when working with code in this repository.

Project architecture decisions live in `ARCHITECTURE.md`. Worldbuilding canon and open ideas live in `WORLD.md`, with detailed setting documents under `world/`. Follow these documents when choosing implementation approaches and writing in-game text. Write setting documents and in-game setting prose in Chinese by default.

## Project Overview

Silidox（硅基问道）是一个以修仙为主题的增量游戏。主角是一台来自异界的损坏机器；物理生存、工业、修仙与多种可编程系统会逐步连接。

梯形图（Ladder Diagram / LD）是第一种设备控制语言，但不是全部玩法的统一界面。后续还可能出现体内连线布阵、外部阵法、炼丹和其他专业系统。

项目使用纯原生 HTML、CSS 与 JavaScript，没有框架、构建步骤或 `package.json`。不要引入 React、Vue、Svelte、Angular、打包器、转译器或运行时包依赖，除非 `ARCHITECTURE.md` 明确改变平台决策。

## Running

```bash
bun index.html
```

然后打开 `http://localhost:3000`。也可以直接打开 `index.html`；必须保持 `file://` 工作流可用。

源码仓库本身就是发布物，不假设存在 `dist` 或部署构建。

## Current Runtime Architecture

```text
index.html
  -> styles.css
  -> src/data.js
  -> src/simulation.js
  -> src/inner-landscape.js
  -> src/ladder-editor.js
  -> src/automation-plan.js
  -> src/ui.js
  -> src/app.js
```

### `src/data.js`

只保存静态定义：

- `250ms` 固定步长
- 能源、木材、结构料、矿石、部件和核心上限
- 九格森林地表、四层地下剖面、可再生树木与确定性矿层
- 控制器、建设任务与持续时间
- 设备级梯形图输入输出上下文
- 存档与程序键名

不要在此读取 DOM、localStorage 或运行模拟。

### `src/simulation.js`

确定性玩法内核：

- 创建和规范化 `silidox.save.v2`
- 推进核心衰减、停机恢复、木气化供能和建设计时
- 执行地表移动、掉头、伐木、燃烧木材、向下掘进、竖井升降和控制器动作
- 运行预设控制与设备梯形图输出
- 推进掘进头、维修台、发电器、传感器、地下残阵采样与部件加工

此文件不得依赖 DOM 或 localStorage，以便直接在 Node 中测试。

### `src/inner-landscape.js`

内景确定性内核：

- 十类节点目录与第一套参考回路
- 灵流、灵压、纯度、杂质、温度和稳定度推进
- 过压、过热、污染、振荡四类可解释故障与事件记录
- 声明式神意控制（模式切换、泄压、排异）与确定性重放

此文件不得依赖 DOM 或 localStorage，以便直接在 Node 中测试。

### `src/ladder-editor.js`

图形化梯形图编辑器、编译器与求值器：

- 使用 `silidox.ladder.v3` 按设备保存多个程序
- 将旧 `silidox.ladder.v2` 复制到只读档案，但不删除旧键
- 支持工具栏点击、拖放、触点重排与跨梯级移动
- 支持 XIC 常开、XIO 常闭和设备上下文输入输出
- 计算声明式扫描成本

当前设备程序：

- `body.heart`
- `environment.drive`
- `environment.pickup`
- `environment.excavator`

当前梯级数据仍为：

```js
{
  id: "rung-1",
  enabled: true,
  contacts: [{ op: "XIC", pin: "I0" }],
  coil: "Q0"
}
```

平行分支尚未实现，记录在 `TODO.md`。

### `src/automation-plan.js`

生成 `silidox.automation-plan.v1`。计划只能包含声明式梯形图 IR、扫描成本和设备物理限制，不得携带任意 JavaScript。

未来本地执行器协议见 `LOCAL_RUNNER_PROTOCOL.md`。当前没有执行器就没有离线收益。

### `src/ui.js`

负责 DOM 缓存、交互绑定和渲染：

- 渐进解锁机体、环境、工坊与未知阵法工作区
- 核心、林地、控制器、建设和异常证据
- 控制与诊断抽屉、设备 I/O 和事件日志

### `src/app.js`

负责启动和模块编排：

- 读取、保存和重置存档
- 运行固定步长时钟
- 连接模拟、梯形图和 UI
- 导出自动化计划

## Progression Rules

- 开局先手动心跳，再解锁环境和自动化。
- 核心归零是可恢复停机，不清空进度。
- 主角在森林中复苏；开局只显示无障碍地表横轴，装配掘进头后展开为横向位置与向下深度组成的二维剖面。
- 树木会再生。伐木取得木材，木材既用于建设，也能手动或通过木气化炉转化为能源。
- 挖矿是第二个手动小游戏。地下岩层需要多次掘进才会击穿，坑道与未完成进度永久保存；深层硬度更高，并产出结构料与固定矿层中的矿石。
- 当前地下只允许沿竖井升降；横向选址在地表完成，不加入洞穴寻路、坍塌或随机地形。
- 预设控制器始终可完成基础自动化；编程用于提效和联动。
- 当前切片止于确认残阵存在非守恒输出。
- 开局不得出现修行炉、灵气、根基或境界；真正修行在稳定工坊和取得本地方法之后。
- 后续内景是形骸、灵流与神意共同构成的可运行自我模型；不得实现成静态技能树或身体内部的 Factorio。
- 道痕只允许功法在模拟运行期间无人值守；没有本地执行器时，页面关闭后仍然没有离线收益。
- 能源、材料、维修和工业在修仙后继续存在，灵气不替代物理生产。

## Legacy Files

以下根目录文件属于未加载的旧原型：

- `main.js`
- `engine.js`
- `screen.js`
- `ide.js`
- `lad.js`
- `types.js`
- `site-nav.js`
- `SILLad.js`
- `style.css`, `screen.css`, `ide.css`

复用前必须确认其概念仍符合当前增量设计。

## Worldbuilding Documents

- `WORLD.md`：设定正典、术语和开放问题
- `world/inner-landscape.md`：内景、人工灵根、功法、道痕、境界与无根到筑基实现计划
- `world/faction-cards/`：流派与功法
- `world/characters.md`：时代人物
- `world/mortal-societies.md`：凡人意识形态与政治制度
- `world/production-relations.md`：自动化、所有权、劳动和社会冲突
- `world/naming-guide.md`：命名研究与规则

人物与势力正式命名前遵循命名规范。在线模型始终可选，输出不可信，所有行动必须由本地引擎验证。

## Verification

```bash
node --check src/data.js
node --check src/simulation.js
node --check src/inner-landscape.js
node --check src/ladder-editor.js
node --check src/automation-plan.js
node --check src/ui.js
node --check src/app.js
node tests/simulation.test.js
node tests/inner-landscape.test.js
node tests/direct-file.test.js
git diff --check
```

手动验证应同时覆盖直接打开 `index.html` 与 `bun index.html`：

- 三次手动心跳解锁环境
- 停机后应急恢复且不丢进度
- 森林地表移动、掉头、伐木、树木再生和木材燃烧
- 装配掘进头后展开二维剖面，验证逐层掘进、竖井往返、固定矿层和地下残阵
- 控制器安装、预设运行与梯形图接管
- 工坊建设进度和残阵三次采样
- 梯形图点击、拖放、重排和整体滚动
- 桌面与移动端无文字或控件重叠
