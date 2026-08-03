# Silidox 本地执行器协议草案

## 目的

本地执行器是可选增强层。玩家可以下载并运行一个 Bun 或 WASM 程序，让已经验证的自动化在浏览器关闭后继续执行。没有执行器时，游戏不提供离线收益，但在线玩法保持完整。

## 安全边界

- 只监听 `127.0.0.1` 与 `::1`，不绑定局域网或公网地址。
- 首次连接需要执行器显示的一次性配对码；成功后浏览器保存随机令牌。
- 接受 `file://` 的 `Origin: null` 与本机 HTTP 来源，同时校验配对令牌。
- 不接收、不求值、不导入任意 JavaScript。
- 只执行版本化、声明式的 `silidox.automation-plan.v1`。
- 默认使用有限工作线程，玩家必须主动提高 CPU 上限。

## 自动化计划

浏览器当前可以导出：

```json
{
  "schema": "silidox.automation-plan.v1",
  "created_at": "ISO-8601",
  "simulation_elapsed_ms": 0,
  "resources": {
    "energy": 0,
    "material": 0
  },
  "jobs": [
    {
      "id": "body.heart",
      "device": "heart",
      "mode": "ladder",
      "scan_interval_ms": 1000,
      "program_ir": [
        {
          "contacts": [{ "op": "XIC", "pin": "I0" }],
          "coil": "Q0"
        }
      ],
      "estimated_scan_cost": 2,
      "physical_limits": {
        "max_actions_per_second": 1,
        "energy_per_action": 1
      }
    }
  ]
}
```

执行器必须重新计算扫描成本，不信任浏览器提交的估算值。

## 计划中的回环接口

- `GET /v1/status`：协议版本、配对状态、工作线程和能力。
- `POST /v1/pair`：使用一次性配对码交换长期令牌。
- `PUT /v1/plan`：部署不可变计划并返回 `plan_id` 与结果游标。
- `POST /v1/heartbeat`：页面在线时续租，执行器暂停同一存档的离线推进。
- `GET /v1/results?plan_id=...&after=...`：按游标读取尚未领取的结果。
- `POST /v1/results/ack`：确认结果已经写入浏览器存档，防止重复结算。

当前版本只定义并导出计划，不实现本地端口、配对或后台进程。

## 算力与物理产能

真实性能影响执行器每秒能够完成的有效控制扫描。程序触点、梯级、扫描频率和并发设备越多，所需计算量越高。

算力不足时，生产线会降采样、排队或空转；算力充足只能让设备达到自身物理上限。它不能跳过加工时间、凭空提供能源或材料，也不能直接加速世界时间。
