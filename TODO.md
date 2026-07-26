# TODO

## Playable vertical slice

- [x] Add an independent core-pulse survival loop.
- [x] Replace semantic navigation inputs with raw contact and material signals.
- [x] Unlock visual perception through automated salvage.
- [x] Add a two-scan Heaven ledger invariant that can be exploited through ladder logic.
- [x] Trigger a Heaven patch and reincarnation after duplicate settlement.
- [x] Preserve ladder code while remapping the input bus in the next epoch.
- [x] Add a full-reset command for replaying the slice.
- [ ] Add contract tests that can validate modules across I/O remaps.
- [ ] Add a second valid exploit strategy with a different cost profile.

## Code organization

- [x] Split shared data and the Ladder editor out of `src/app.js`.
- [x] Document native browser platform and source-repository release constraints.

## Incremental cultivation core

- [x] Add the first cultivation panel: qi, foundation, realm, yin extraction, yang generation, and Heaven attention.
- [x] Add manual actions for extraction, breath-method improvement, foundation consolidation, spirit generation array setup, and breakthrough.
- [x] Let ladder outputs assist cultivation automation without making programming mandatory for the earliest loop.
- [x] Persist cultivation progress across local reboots.
- [x] Hide cultivation UI until the machine has survived the opening phase and restored a low-level aura interface.
- [x] Replace the early 2D movement and tree-cutting survival loop with 1D obstacle-free movement and pickup.
- [x] Remove the early base-return step; fragments now count immediately when picked up.

## Worldbuilding

- [x] 创建 `WORLD.md`，收纳设定正典和开放问题。
- [x] 建立首张流派卡：石胎门与《山纹炼形法》。
- [x] 建立第二张流派卡：蓄能剑修与内外门体系。
- [x] 建立第三张流派卡：舍弃根基、反复突破的逐境门。
- [x] 建立第四张流派卡：围剿后仍抽取人魂、后来转向养鸡的牧魂门。
- [x] 建立第五张流派卡：作为正道魁首与修行基准的太衡宗。
- [x] 建立初始敌对流派卡：奉行人类至上并持续追杀主角的靖异门。
- [x] 为石胎门、藏锋宗和逐境门生成并接入印象图。
- [ ] 为牧魂门生成并接入围剿后初遇阶段的印象图。
- [ ] 为太衡宗生成并接入正统山门印象图。
- [ ] 为靖异门生成并接入追猎主角的印象图。
- [ ] 确定正道魁首与初始追杀宗门的正式名称及根本功法名。
- [x] 明确门派缺陷向主角工程问题转换，并以石胎门建立首个“学习、移植、反哺”闭环。
- [x] 明确藏锋宗的控制、预测难题与合击调度反哺方向。
- [x] 明确牧魂门初遇时仍抽取人魂，并由主角推动养鸡转型。
- [x] 区分主角与玩家的伦理位置：机器只建模事实与后果，价值判断留给玩家。
- [x] 明确主角效忠地球人类、本地人只是类人生物，以及玩家对本地世界的三种长期立场。
- [x] 明确先进生产方式必然重组功法、资源、劳动与基础设施的所有和控制关系。
- [x] 明确故事从前期个体身份矛盾升级为后期生产力与生产关系的社会矛盾。
- [x] 建立首批十名跨越宗门、国家与阶层的时代人物及其生平、立场和关系。
- [x] 调研仙侠人物与宗门命名方式，建立项目命名规范。
- [ ] 建立主要地区、家族与宗门的命名谱系，并替换当前人物和宗门暂名。
- [x] 明确逐境门的增量重修程序，以及通过重复构筑夯实根基的反哺方向。
- [x] 确立仙凡双轨、权力不对称、经济互赖与地区制度多样的社会基准。
- [x] 设计守土朝、百年律国、百工城盟等首批凡人意识形态与政治体制。
- [ ] 为凡人政治体制确定正式国名、地理位置、历史关系与当前冲突。
- [ ] 把程序公开、阵法所有权、产物分配与自动化替代转化为可玩的长期选择。
- [ ] 设计主角获得社会承认的中期转折，以及后期武装斗争的势力、设施与胜负条件。
- [ ] 把时代人物分配到具体地区与剧情阶段，设计首次相遇、关系转折和不可逆选择。
- [ ] 继续扩展宗门、势力，以及“生灵”的本土术语。

## AI characters

- [x] 定义稳定角色核心、转生变量和局内状态三层角色协议。
- [x] 保存首张靖异门追猎者角色 Prompt 原型。
- [ ] 在人物正式命名后，为其余时代人物建立可调用角色卡。
- [ ] 设计不破坏直接打开模式的供应商无关模型调用边界与确定性回退。
- [ ] 实现模型 JSON 校验、非法行动拒绝、关系结算和持久记忆。
- [ ] 验证不同 `incarnation_profile` 能改变角色方法而不覆盖稳定人格。

## Ladder editor

- [x] Replace the text-only LAD program editor with a graphical rung editor.
- [x] Use one scrollable ladder workspace instead of per-rung overflow.
- [x] Add icon-based editing tools with hover labels.
- [x] Support click-to-insert for contacts at the selected position.
- [x] Support dragging tools from the toolbar onto a rung.
- [x] Fix LAD symbol drawing so wires do not pass through contacts or coils.
- [x] Shorten the normally-closed contact slash to look like `|/|`.
- [x] Support dragging existing contacts to reorder or move them between rungs.
- [ ] Add parallel branch editing and rendering.
- [x] Add a clearer variable/pin picker for inserted nodes.
