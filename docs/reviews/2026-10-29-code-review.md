# LeetCode Blind Review 代码审查与修复记录

日期：2026-10-29（Asia/Shanghai）  
审查基线：`47159c1caa428c4a9797c363481fa08c0fc9c0f1`（main）  
修复分支：`review/2026-10-29-correctness`  
变更入口：[Draft PR #22](https://github.com/TH1NKING/leetcode-blind-review/pull/22)

## 审查结论和范围

当前代码完成的是 Ticket 01 和 Ticket 03 的非破坏性阶段：默认关闭、动态激活、Editor Guard、五秒窗口、Attempt Bypass，以及 Reset intent 后的 Guarded Failure。生产包没有真正的 Reset executor。规格中列出的 SPA、语言切换、前台活动预算、Attempt Ownership、Ownership Transfer 和 Recovery Entry 尚未实现，本次没有把它们写成已完成功能。

本次阅读了全部五个生产 TypeScript 文件、构建脚本、扩展静态文件、全部测试及 harness、依赖配置、CI，以及 AGENTS、CONTEXT、四份 ADR、设计规格、测试方案和相关 GitHub tickets。审查覆盖正确性、异步竞争、异常路径、资源释放和测试缺口。

共记录 11 项问题：2 项 P0、7 项 P1、2 项 P2。P0 沿用仓库的定义：可能泄露旧代码或破坏保护边界。每项都在本分支修复；下表明确区分 Chrome 复现、静态证据和单独资源实验。

## 按严重程度排列的问题

| ID | 等级 | 问题与影响 | 证据 | 修复位置 |
| --- | --- | --- | --- | --- |
| R01 | P0 | 工作区布局变化后 Guard 位置过期，可能露出旧代码 | 修复前 Chrome CI 的布局回归失败 | `src/content/controller.ts`：工作区视觉保护和 Guard 位置维护 |
| R02 | P0 | 工作区节点被替换后仍引用旧节点，不能可靠保护新表面及其焦点 | 修复前 Chrome CI 的替换回归失败 | 同上：边界失效时回到全视口保护，焦点判断同步保守处理 |
| R03 | P1 | 关闭仅枚举当前 Description URL，遗漏已发生同 Document 导航的控制器 | 修复前 Solutions 和 problemset 两条 Chrome 回归失败 | `src/background/index.ts`：按打开的 tab ID 发送本扩展清理消息 |
| R04 | P1 | 关闭或回滚遇到一个 API 异常就跳过后续清理；关闭还依赖预先成功读取配置 | 修复前注销失败回归失败；另补配置读取失败用例 | 后台 `settleRuntimeToOff`、`disableBlindMode` |
| R05 | P1 | 清理消息异常一律吞掉，没有确认接收方已停止，就可能发布 off | 源码调用路径明确；新增真实扩展消息故障注入回归 | 后台消息 ACK 校验、控制器确认应答 |
| R06 | P1 | Guard 内所有按键被 preventDefault，Tab 无法切换按钮，空格不能激活按钮 | 修复前键盘回归中焦点停在“保留当前草稿” | 控制器 `#handleKeydown` |
| R07 | P1 | Popup 的消息 Promise 拒绝没有处理，按钮可能永久 disabled | 修复前 Popup 消息失败回归超时 | `src/popup/index.ts`：错误状态、应答校验与显式重试 |
| R08 | P1 | 初始化 Promise 首次拒绝后被永久缓存；状态请求异常也可能没有结构化应答 | 静态异步调用链证据；专门的冷启动故障注入仍属测试缺口 | 后台 `startInitialization`、`handleModeMessage` |
| R09 | P1 | Manifest 声称支持 Chrome 102，但注册对象使用 Chrome 119 才支持的字段 | Chrome 官方 API 文档与代码对照；未实际运行 Chrome 102–118 | Manifest、构建 target、包快照与 README 统一为 119 |
| R10 | P2 | 读取配置直接类型断言，未知 schema 或非法字段被当成有效配置 | 静态证据；修复后的 schema 冷启动回归 | 后台 `readConfiguration` |
| R11 | P2 | Harness 初始化失败时临时 profile 和 package 目录泄漏 | 指定不存在的 Chrome：基线遗留 2 个目录，修复后 0 个 | `tests/black-box/chrome-harness.ts` |

### R01：布局变化造成 Guard 缺口

基线只在建立 Workspace Guard、window resize 和 scroll 时读取工作区矩形。页面改变网格比例、展开侧栏或调整分栏时，工作区可以移动，而这些事件完全不发生。

复现步骤：开启模式，在 fixture 进入 countdown 后按 Enter 进入非破坏性的 Guarded Failure，把 `#fixture-root` 的列比例从 `40% 60%` 改为 `20% 80%`，等待渲染帧，然后比较 Guard 与工作区边界。基线的左侧覆盖不足，Chrome CI 返回 false。

修复同时做两件事：保护期间把已识别工作区的 opacity 设为 `0 !important`，避免两个位置更新之间露出原表面；在绘制帧中维护 Guard 位置，使控件随布局移动，只在位置样式变化时写入 CSS。保留原始 opacity 值和优先级，Bypass 或关闭时恢复。绘制帧属于 Guard 的显示资源，只在 Guard 存在时维护，不产生 Reset Authorization。没有进行性能基准；Guard 持续显示期间仍有每帧边界读取成本。

这不构成任意浏览器、任意页面改写下的零帧证明。真实站点 contract、全屏和完整缩放矩阵仍需后续票据验证。

### R02：工作区身份失效

基线保存了一个 HTMLElement 引用。页面替换该节点后，Guard 仍按旧节点定位，焦点判断也只检查旧节点包含关系。旧元素的 inert 不会自动施加到新元素。

修复在旧边界断开或尺寸无效时恢复全视口 Guard；旧工作区断开时，焦点检查也按全视口处理。不会把新节点自动认作已验证的工作区，也不会为它签发新的授权。它没有实现完整 SPA 或语言生命周期。

### R03：关闭必须覆盖已注入的控制器

基线用 `PRACTICE_MATCH` 查询待清理标签。`history.pushState` 改变 URL 后，脚本仍在同一 Document 运行，但该标签可能不再匹配查询，所以会出现“配置已经 off、Guard 仍存在”的状态。

修复只使用打开标签的 ID 发送本扩展的停止与中和消息，不读取其他标签内容，也不增加 Manifest 权限。不存在本扩展接收方的标签保持无操作。此变更保证全局关闭的收尾范围，不宣称已经具备 SPA route classifier。

### R04、R05：失败时继续清理，同时保留真实状态

旧流程的顺序 await 链在持久化、注销或消息失败时提前结束。新的关闭流程先关闭内存工作门，再依次尝试停止页面、持久化 disabling、注销、控制器中和和 session 清理；单步失败不会跳过剩余步骤。有失败时保留可重试的 disabling，全部完成后才发布 off。

取消不再以成功读取 storage 为前置条件。清理消息必须收到 `stopped` 或 `neutralized` 确认；只有可识别的接收方不存在、标签已关闭等情况按收尾完成处理，其他错误保留为失败。即使中和消息失败，CSS 移除仍在 finally 中尝试。

剩余边界：这仍是当前单 worker 的恢复流程，不是具有 Document/epoch 校验的跨标签所有权协议。Chrome 强制终止、扩展更新和丢失接收方的完整恢复语义由后续 Recovery tickets 处理。

### R06、R07：键盘与 Popup 恢复

Guard 保留 Enter 的立即 intent 和 Esc 的 Attempt Bypass 语义，同时允许 Guard 内按钮的原生 Tab、Shift+Tab 和空格操作。Bypass 和关闭时移除拦截监听器。

Popup 校验后台应答。通信拒绝时显示明确错误，并提供“重试读取 Blind Mode”；失败的 disabling 仍保留关闭按钮。不会根据一个拒绝的 Promise 宣称开关已成功。内容控制器也检查状态应答的 `ok`，并忽略失效控制器收到的迟到成功应答。

### R08、R09、R10：启动和配置边界

初始化失败会清除对应的 rejected Promise 缓存，后续请求可以重新初始化；初始化与前台查询异常进入统一的 `{ ok: false, ... }` 应答路径。

`matchOriginAsFallback` 官方支持范围是 Chrome 119+。本次提高 minimum_chrome_version 和构建 target，并同步实际包快照；这只修正 API 兼容声明，没有声称完成 Chrome 119 的历史版本实测。参考：[Chrome Scripting API](https://developer.chrome.com/docs/extensions/reference/api/scripting#type-RegisteredContentScript)。

配置必须是受支持的 schemaVersion、模式枚举和有限的非负 countdownMs；非法配置恢复为默认关闭。当前实际倒计时仍固定为五秒，没有新增可配置倒计时功能。

### R11：测试初始化也需要收尾

基线在定位 Chrome 前创建两个临时目录。定位失败时函数尚未返回 harness，调用者无法调用 dispose。修复先检查 Chrome 和 omission 参数；目录创建、复制文件失败也清理已经创建的资源。单独执行公开 harness 初始化的资源实验已确认“2 个遗留 → 0 个遗留”。

## 测试证据

### 已完成的复现

- [修复前 CI，commit 2082d12](https://github.com/TH1NKING/leetcode-blind-review/actions/runs/40894910807)：原有 33 个用例通过；新增 9 个用例中 7 个失败、2 个通过。失败覆盖布局、节点替换、键盘、两条导航后关闭路径、注销失败、Popup 通信拒绝。
- [第一轮修复 CI，commit 3674506](https://github.com/TH1NKING/leetcode-blind-review/actions/runs/40895756116)：6 个测试文件、43 个用例全部通过，包含新增的清理消息失败回归。
- [完整功能验证，commit c8d4a76](https://github.com/TH1NKING/leetcode-blind-review/actions/runs/40896605679)：6 个文件、44 个用例全部通过，包含配置读取失败仍清理的回归、harness 资源修复和浏览器版本记录。环境为 Windows、Node.js 22、Chrome 156.0.8078.48、扩展 0.1.0。后续报告整理和 Guard 样式去重写入也由 PR 最新 verify 检查覆盖。
- 本地已通过 TypeScript 检查、生产构建、15 个 lifecycle/artifact 用例及 `git diff --check`。
- 本地资源实验：不存在的 Chrome 路径，基线遗留两个临时目录，修复后为零。

本地 Linux Chrome 因执行环境拒绝其所需的 Unix socket 而无法启动，这不是通过结果。真实扩展行为由仓库既有的 Windows Chrome CI 执行，未通过删除用例、skip 或替代 DOM 单测取得结果。

### 新增回归覆盖

`tests/black-box/review-regressions.test.ts` 包含 11 个真实发布包用例：布局变化、工作区替换、键盘、两条导航后的关闭路径、注销失败、Popup 通信拒绝、非法 schema 冷启动、清理确认失败、竞争开关请求，以及关闭中的配置读取失败。竞争请求用例在基线已经通过，用于保留现有队列保证，不计为发现的缺陷。

配置冷启动用例增加了 Popup 初始化完成的屏障，避免写入测试配置与首次默认配置写入竞争；首次运行中该用例通过，不计入修复前七个失败证据。

## 并发、错误和资源审查结果

| 边界 | 当前实现与本次结论 |
| --- | --- |
| 多个开关命令 | `modeMutationQueue` 串行处理；一个请求失败不会毒化后续队列。并发 enable/disable 回归通过基线与首轮修复 CI。 |
| 单次 intent | reducer 只从 countdown 转移一次 available Authorization；重复 Enter、button 和 timer 不会产生第二个 intent。 |
| 迟到回调 | `WorkflowRef` 比较 Document ID 和 generation；控制器还检查 active、acceptingWorkflow 与 AbortSignal。当前没有实现跨 SPA 的 generation 递增。 |
| Bypassed Entry | 撤销授权、停止 Attempt timer/listener、移除 Guard，并保留防重复激活的控制器标记。 |
| Guarded Failure | 停止 Attempt 自动进展；Guard 的视觉定位和安全出口继续存在。失败时仍显示 Guard 不等于 Reset workflow 仍在运行。 |
| 关闭与回滚 | 停止新工作、尝试所有收尾、校验 ACK；失败保留 disabling 并允许显式重试。 |
| 资源 | 没有生产网络客户端、文件句柄或 MutationObserver。存在倒计时、DOM 监听器、runtime listener 和 Guard 绘制帧；各自有取消路径。 |
| 内容边界 | 未发现生产代码读取、散列、记录或上传 Editor/Testcase/Console/Submission 内容。新增读取限于元素边界、连接状态和扩展需要恢复的样式元数据。 |
| 依赖与打包 | 无生产 npm runtime dependencies；esbuild 打成三个脚本。包快照、最小权限和禁用内容 getter/点击/网络路径的审计继续保留。静态正则不是形式化证明。 |

## 仍需明确保留的测试与功能缺口

下列内容已经分配给后续 tickets，不能因本次测试通过而声称完成：

1. Ticket 02：登录态真实 `leetcode.cn` 的 route、workspace、语言、Reset menu/dialog/Commit/Confirmation contract 取证。
2. Ticket 04A/04B、05：标准做题路径与 Reference 的完整分类、SPA/语言变化前的 Guard、generation 递增和旧事件隔离。
3. Ticket 06：持续的前台资格、后台暂停、累计活动预算；当前只在启动时查询资格。
4. Ticket 07、08A/08B：同题同语言的 Attempt Ownership、先暂停再授予、epoch、worker 休眠和 tab identity 复用。
5. Ticket 09：BFCache、会话恢复、discard、崩溃和扩展恢复。
6. Ticket 10A、11、12：真实 Reset adapter、Commit Barrier、Reset Confirmation、Retry/Reveal，生产 Reset 门禁继续关闭。
7. Ticket 14–16：完整隐私 canary 的消息/日志覆盖、诊断、缩放/主题/辅助技术矩阵、10,000 条事件序列和关键场景 50 次稳定性门禁。
8. 本次未补的专门异常矩阵：首次初始化 API 一次性失败的冷启动注入、每个 API 的持久失败、CSS 移除失败及真实扩展更新后的失联控制器恢复。

因此，本次结论是当前非破坏性阶段的缺陷修复和回归验证，不是 V1 完整发布认证。

架构、业务实现与面试问答见：[实际架构与面试材料](2026-10-29-architecture-and-interview.md)。
