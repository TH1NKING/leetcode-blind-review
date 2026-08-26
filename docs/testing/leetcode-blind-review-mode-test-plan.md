# LeetCode Blind Review Mode 测试方案

状态：与 V1 设计规格同步  
被测对象：打包后的 Chrome Manifest V3 Extension  
相关规格：[LeetCode Blind Review Mode 设计规格](../design/leetcode-blind-review-mode.md)

## 1. 测试目标

测试不证明默认模板内容逐字正确，而要证明以下外部行为与安全不变量：

1. 在受支持、已测试的路径上，旧代码不会先于 Editor Guard 可见。
2. 只有持有有效 Reset Authorization、Attempt Ownership 和前台资格的当前 generation 才能开始 Reset UI 交互。
3. 每份 Reset Authorization 最多对应一次 Reset UI 点击序列与一次 Commit Point。
4. 过期异步任务、重复 Observer、旧 Document 和其他标签页不能触发 Reset 或解除 Guard。
5. Reset Confirmation 不明确时必须进入 Guarded Failure。
6. Released Attempt、Bypassed Entry 与 Revealed Entry 永远不能被自动事件重新 Reset。
7. Extension 保持 Content-Blind、零遥测、会话状态不跨浏览器重启且权限最小化。

自动测试使用合成的 `OLD_CODE_CANARY`、`DEFAULT_TEMPLATE_CANARY`、`TESTCASE_CANARY` 等测试标记。标记只存在于测试 fixture 和测试 runner 中；生产 Extension 不得读取、比较或记录它们。

## 2. 测试原则

- 优先测试用户可见行为，不断言私有 helper、具体函数调用或 DOM query 实现。
- 主回归必须针对实际打包产物，而不是只测试源码模块。
- 时间、网络和 DOM 异步由 fixture 确定性控制，不用真实 `sleep` 证明正确性。
- 所有竞态用 fake clock、事件屏障或受控 task queue 重现。
- 真实账号只用于低频、人工 DOM contract smoke test；CI 不保存账号凭据。
- 任何测试诊断都不得让生产 Extension 获得读取代码的接口。
- UI 改版测试的正确结果可以是 Guarded Failure；“自动化成功率”低于“无误点、无重复 Reset”。

## 3. 测试 Seams

### 3.1 主 seam：打包 Extension 的 Chrome 黑盒测试

在真实桌面 Chrome Stable 中加载实际发布用 MV3 Extension，并把 `https://leetcode.cn/**` 请求拦截为确定性的 LeetCode UI contract fixture。

该 seam 保留真实的：

- Manifest V3 Service Worker 生命周期；
- Guard CSS 与 `document_start` 注入顺序；
- Tabs、Windows、Storage 与消息通信；
- 前台／后台、多个窗口、多标签页与 Ownership Transfer；
- SPA route、language change、History 与 BFCache；
- popup、动态注册／注销和浏览器会话恢复边界。

测试 runner 只观察：

- Guard 是否可见、是否完整遮挡 canary；
- 用户按钮、键盘与页面导航结果；
- fixture 记录的 menu click、Reset action、Commit 与完成事件；
- Extension storage、permissions、network 与脱敏 diagnostics；
- Chrome trace、screencast、console error 与未清理资源计数。

不向发布构建加入测试专用后门。

### 3.2 补充 seam：纯生命周期协调器

状态机接受 route、language、foreground、clock、ownership、UI observation、recovery 与 user command 等事件，并输出 Guard、click、ownership 和终态命令。该 seam 使用 fake clock 和可控 Promise，覆盖浏览器黑盒难以穷举的竞态。

它只测试公开的“事件 → 命令／状态”contract，不锁定 reducer 的文件布局或辅助函数。

### 3.3 人工 seam：登录态 `leetcode.cn` contract smoke test

真实站点只验证当前 UI contract 与 best-effort 首帧表现，不作为高频 CI 依赖。使用专门的可丢弃草稿和普通题目，绝不在重要草稿上做 Reset 试验，也不导出代码、Cookie、Token 或完整页面 HTML。

## 4. 测试环境

- 当前桌面 Google Chrome Stable，普通浏览窗口。
- 干净、独立的 persistent browser profile。
- 实际打包后的 MV3 Extension。
- 可拦截 `leetcode.cn` 请求的浏览器自动化 runner。
- fake clock 与受控 Service Worker suspend／wake 工具。
- screenshot／screencast 与 pixel assertion 工具。
- Windows 为主要 CI 环境；macOS／Linux 至少作为发布前兼容 smoke 环境，若实际交付承诺覆盖三者。

测试 profile 每个用例前后必须清理：

- 页面与标签页；
- session storage 与 ownership lease；
- popup／window focus 状态；
- fixture event log；
- screencast 与 diagnostics buffer。

持久 Blind Mode 设置只在专门验证 persistence 的用例间保留。

## 5. UI Contract Fixture

fixture 模拟的只是公开可见 contract，不复制 LeetCode 私有实现。它必须参数化支持：

- Practice、Reference、Unsupported 与未知 route；
- Problem Identity、query／hash 和语言变化；
- Coding Workspace 同步、延迟、永不挂载、零候选或多候选；
- Reset 入口、menu item、dialog、confirm 与 completion evidence 的延迟、缺失或歧义；
- 无二次确认、Reset action 自身即 Commit Point 的 UI 变体；
- Reset 后立即成功、延迟成功或永不出现完成证据；
- Run、Submit、Testcase、Console、layout resize 与无关 DOM storm；
- Editor 重挂载、随机 CSS class 变化和相同文案重复；
- 已登录、未登录与会话中途失效；
- SPA 切题、Reference 往返、语言 A → B → A、History 和 BFCache；
- Reset click、Commit、完成事件及其顺序的外部 event log；
- canary code、template、testcase、console、submission 与账号字段。

fixture contract 在登录态人工取证后更新。它不得保存真实用户代码、账号数据、Token 或整页 DOM snapshot。

## 6. 核心不变量与生成测试

纯状态机每条随机序列包含 20–200 个事件，至少运行 10,000 条序列。事件包括：

```text
enable / disable
foreground / background / window-focus / window-blur
route-practice / route-reference / route-unsupported
problem-change / language-change
reload-user / reload-recovery / pagehide / pageshow-persisted
workspace-found / workspace-missing / workspace-ambiguous
countdown-elapsed / active-budget-elapsed
reset-entry-found / action-found / confirm-found / commit / confirmation
bypass / retry / reveal / blind-restart
ownership-request / conflict / revoke / ack / tab-close
service-worker-suspend / service-worker-wake
old-generation-callback
```

每条序列持续验证：

- 同一 Ownership key 最多一个 owner。
- Commit 只能发生在 Blind Mode on、Practice View、前台、Guard 生效、Ownership 有效、Authorization 已正确消费、活动预算未耗尽且 generation 匹配时。
- Commit 次数不超过显式授予的 Authorization 数量。
- Released、Bypassed、Revealed 和 Guarded Failure 不会被自动事件重新授权。
- 旧 generation 永远不能点击、解锁、转移 Ownership 或改变新 Attempt。
- 非前台标签页永远不能越过 Commit Point。
- Reset Confirmation evidence 必须严格晚于当前 generation／Authorization 的 Commit，并与当前 adapter interaction instance 因果关联。
- Guarded Failure 只能由显式 Retry、Reveal 或关闭 Blind Mode 离开。
- Blind Mode off 最终导致零 Guard、零 owner、零活动任务。
- success、failure、bypass、reveal、cancel 与 end 最终都清理 timer、Observer 和 listener。

随机失败必须记录 seed，并固化为确定性回归用例。

## 7. 自动化用例

### 7.1 启用边界与路由

| ID | 优先级 | 场景与预期 |
| --- | --- | --- |
| BRM-ROUTE-001 | P0 | 首次安装默认关闭；进入 Practice View 不 Guard、不点击 Reset。 |
| BRM-ROUTE-002 | P0 | 开启 Blind Mode 时，仅当前活动 Practice View 立即创建 Blind Attempt；其他既有 Practice View 不 Reset，但被纳管。 |
| BRM-ROUTE-003 | P0 | 开启前已打开的其他、不同 scope 标签页成为 Adopted Entry、取得 Ownership；后来仅被激活仍不 Reset。 |
| BRM-ROUTE-004 | P0 | Blind Mode 已开启后首次前台进入 Description，创建一个 Blind Attempt。 |
| BRM-ROUTE-005 | P0 | Run、Submit、Testcase、layout 变化和 Editor remount 均不创建 Attempt。 |
| BRM-ROUTE-006 | P0 | 直接进入 Solutions／Submissions 不显示可见 Guard、不 Reset。 |
| BRM-ROUTE-007 | P0 | Released／Bypassed／Revealed：Description → Reference → Description 延续原终态，不 Reset。 |
| BRM-ROUTE-008 | P0 | 外部 → Reference → Description，只在首次进入 Practice View 时创建 Attempt。 |
| BRM-ROUTE-009 | P0 | Countdown → Reference 取消 pending flow；返回 Practice 得到完整五秒窗口与新 generation。 |
| BRM-ROUTE-010 | P0 | Reset UI 点击序列开始后进入 Reference，Authorization 已消费；返回 Practice 不自动再试。 |
| BRM-ROUTE-011 | P0 | 离开 Problem Identity 后通过链接、前进或后退返回，创建新 Attempt。 |
| BRM-ROUTE-012 | P0 | A → B → A 快速 SPA 切换只有最终 generation 可继续，旧 generation 点击为零。 |
| BRM-ROUTE-013 | P0 | 语言 A → B → A 每次在目标旧代码可见前 Guard，并为变化后的语言创建新 Attempt。 |
| BRM-ROUTE-014 | P1 | 重复选择当前语言标识不变时不创建新 Attempt。 |
| BRM-ROUTE-015 | P0 | Reference View 中 Reload／语言变化不 Reset；之后进入 Practice 才创建 Attempt。 |
| BRM-ROUTE-016 | P0 | `leetcode.com`、Contest、Assessment、Explore、Playground 和未知 route 不激活。 |
| BRM-ROUTE-017 | P0 | 未登录或会话过期时不尝试 fallback；已 Guard 的 Practice flow 进入 Guarded Failure。 |
| BRM-ROUTE-018 | P0 | A 的 Reset UI 点击序列开始后切到 B：A 的旧 generation 不再点击；返回 A 直接 Guarded Failure，不自动补发。 |
| BRM-ROUTE-019 | P0 | 语言 A 的 Reset UI 点击序列开始后切到 B，再切回 A：A scope 保持 uncertain，只有显式 Retry／Reveal 可继续。 |
| BRM-ROUTE-020 | P0 | 开启时存在同 scope 重复标签页：当前活动页优先，其他页进入 Ownership Conflict，任何页都不被批量 Reset。 |

### 7.2 Editor Guard 与首帧

| ID | 优先级 | 场景与预期 |
| --- | --- | --- |
| BRM-GUARD-001 | P0 | 冷启动 screencast 的每一帧都由不透明 Guard 覆盖 `OLD_CODE_CANARY`；首个 animation frame 亦如此。 |
| BRM-GUARD-002 | P0 | SPA 换题和语言切换在 fixture 替换代码前同步恢复全视口 Guard，无 canary frame。 |
| BRM-GUARD-003 | P0 | 只有唯一识别 Coding Workspace 后才缩小 Guard；缺失或多候选时保持全视口保护并失败。 |
| BRM-GUARD-004 | P0 | Workspace Guard 覆盖语言、toolbar、代码、行号、minimap、Testcase、结果、Console、Run 与 Submit。 |
| BRM-GUARD-005 | P1 | Guard 阻止 Workspace pointer、keyboard 与 focus；题目描述仍可阅读和滚动。 |
| BRM-GUARD-006 | P0 | Reset Confirmation 前 Guard 始终存在；成功后 Workspace 一次性解锁。 |
| BRM-GUARD-007 | P1 | 成功提示淡出后 Released Attempt 无常驻网页 UI。 |
| BRM-GUARD-008 | P0 | Selector 失效、timeout 或证据歧义时保持 Guard 并显示可操作失败状态。 |
| BRM-GUARD-009 | P0 | BFCache 返回和 Recovery Entry 的首个捕获帧不显示旧 Workspace。 |
| BRM-GUARD-010 | P1 | 100%、125%、150%、200% 缩放及 resize／分栏拖动后 Guard 无视觉缝隙。 |
| BRM-GUARD-011 | P1 | Light／dark theme 与 Editor full-screen 中 Guard 仍不透明且控制可读。 |

### 7.3 倒计时、预算、取消与单向锁

| ID | 优先级 | 场景与预期 |
| --- | --- | --- |
| BRM-LIFE-001 | P0 | Guarded Preflight 后提供完整五秒窗口；五秒前不得自动开始 Reset UI 点击。 |
| BRM-LIFE-002 | P0 | “立即盲重置”或 Enter 只消费一份 Authorization。 |
| BRM-LIFE-003 | P0 | Commit 前“保留当前草稿”或 Esc：Commit 为零、进入 Bypassed Entry、解除 Guard。 |
| BRM-LIFE-004 | P0 | Bypassed Entry 遭遇 DOM storm、remount 与旧 callback 仍不得 Reset。 |
| BRM-LIFE-005 | P0 | Reset Confirmation 后进入 Released Attempt；后续自动事件 Commit 为零。 |
| BRM-LIFE-006 | P0 | Revealed Entry 后自动事件 Commit 为零。 |
| BRM-LIFE-007 | P0 | Commit 前关闭 Blind Mode：取消、解除 Guard、释放 Ownership，Commit 为零。 |
| BRM-LIFE-008 | P0 | Commit 后关闭不发新点击、不补偿写入，也不声称回滚。 |
| BRM-LIFE-009 | P0 | 30 秒为从首次前台 Guard 开始的不可续期累计活动预算，包含 Ownership acquisition、五秒窗口与后续 phase；Observer 不得续期。 |
| BRM-LIFE-010 | P0 | 剩余预算不足完整五秒时进入 Guarded Failure，不缩短窗口或仓促 Commit。 |
| BRM-LIFE-011 | P0 | Preflight／Countdown 失去前台进入 Suspended Attempt；预算和倒计时停止消耗，恢复后只继承剩余量。 |
| BRM-LIFE-012 | P0 | Reset Pre-commit 失去前台因结果可能含糊进入 Guarded Failure。 |
| BRM-LIFE-013 | P0 | Reset Committed 后失去前台只观察已有结果，绝不发第二次点击。 |
| BRM-LIFE-014 | P0 | 主动 F5 与工具栏 Blind Restart 使用同一生命周期规则。 |
| BRM-LIFE-015 | P1 | Released 后 Enter、Esc 与 Editor shortcut 不再被 Extension 拦截。 |
| BRM-LIFE-016 | P0 | 后台协调器不响应、Ownership 消息丢失或仲裁卡住仍消耗同一活动预算并在耗尽后 Guarded Failure。 |
| BRM-LIFE-017 | P0 | Adopted Entry 在仅激活、DOM storm、Run／Submit 与 remount 中不 Reset；只有合格 Blind Restart 才结束。 |

### 7.4 Reset UI、Timeout 与 Failure

| ID | 优先级 | 场景与预期 |
| --- | --- | --- |
| BRM-RESET-001 | P0 | 正常 contract：打开可见 menu、选择 Reset、处理最终确认、观察完成证据、释放 Guard。 |
| BRM-RESET-002 | P0 | 无二次确认 contract：Reset action 自身被正确标为 Commit Point，且只点击一次。 |
| BRM-RESET-003 | P0 | 异步延迟挂载可在剩余活动预算内成功，不依赖固定 sleep。 |
| BRM-RESET-004 | P0 | Reset entry／action／dialog 暂时零候选时只在剩余预算内等待；readiness／预算结束仍为零才失败；多候选立即失败，任何情况都不猜测点击。 |
| BRM-RESET-005 | P0 | 已 Commit 但无完成证据：Guard 保留，Commit 为一，不自动再次确认。 |
| BRM-RESET-006 | P0 | Reset Confirmation 只使用 UI workflow evidence；Extension 不读取 canary。 |
| BRM-RESET-007 | P0 | 活动预算耗尽与完成事件竞争时只产生一个终态；过期成功事件不得解锁。 |
| BRM-RESET-008 | P0 | 用户每次 Retry 恰好获得一份新 Authorization；一次 Retry 最多再 Commit 一次。 |
| BRM-RESET-009 | P0 | Commit 前失败显示“保留当前草稿”；Commit 后只显示“显示当前 Editor 状态”。 |
| BRM-RESET-010 | P0 | Reveal 解除 Guard 但不点击 Reset，并产生 Revealed Entry。 |
| BRM-RESET-011 | P0 | success、cancel、failure、route change 后 timer、Observer、listener 与 pending task 归零。 |
| BRM-RESET-012 | P1 | 随机 CSS class 全变但语义 contract 不变时仍工作；语义 contract 变化时安全失败。 |
| BRM-RESET-013 | P0 | Commit 前已经存在的 toast、已关闭 dialog 或旧 generation completion event 不得产生 Reset Confirmation。 |
| BRM-RESET-014 | P0 | Run／Submit／无关 mutation 引发的相似 UI evidence 不得解锁；重复 evidence 只被消费一次。 |

### 7.5 前后台、Recovery 与 BFCache

| ID | 优先级 | 场景与预期 |
| --- | --- | --- |
| BRM-TAB-001 | P0 | Blind Mode 已开启后后台新开的 Practice View 是 Dormant Entry：不取得 Ownership、不计时、不点击。 |
| BRM-TAB-002 | P0 | Dormant Entry 首次变为合格前台后才进入 Acquiring Ownership，并获得完整五秒窗口。 |
| BRM-TAB-003 | P0 | 打开 popup 导致页面 DOM focus 变化，不应把当前 Chrome active tab 误判为后台。 |
| BRM-TAB-004 | P0 | Chrome 窗口真正失焦时，Commit 前自动流程停止进展。 |
| BRM-REC-001 | P0 | Chrome 会话恢复页进入 Recovery Entry；成为前台仍不自动倒计时。 |
| BRM-REC-002 | P0 | fixture 确定性模拟 Memory Saver discard、崩溃恢复与 Extension recovery 标记时，全部进入 Recovery Entry。 |
| BRM-REC-003 | P0 | Recovery 选择“重新盲写”后先申请 Ownership，获准后才进入五秒窗口。 |
| BRM-REC-004 | P0 | Recovery 选择“保留当前草稿”也必须先申请 Ownership；获准后进入 Bypassed Entry，Commit 为零。 |
| BRM-REC-005 | P0 | 无法可靠判断 reload 来源时保守使用 Recovery Entry。 |
| BRM-REC-006 | P0 | 离开后由 BFCache 返回不能复活旧 Released Attempt；按重新进入语义处理。 |
| BRM-REC-007 | P1 | 同 Document Practice／Reference SPA 往返不被误判为 Recovery。 |
| BRM-REC-008 | P0 | `pagehide`／`pageshow`、冻结期间丢失广播后，页面重新同步 Blind Mode 与 Ownership。 |
| BRM-REC-009 | P0 | 多个同 scope 恢复页选择继续时只有一个取得 Ownership，其他进入 Conflict。 |

### 7.6 Blind Mode 与动态激活

| ID | 优先级 | 场景与预期 |
| --- | --- | --- |
| BRM-MODE-001 | P0 | off 状态没有可见 Guard、自动化或页面网络副作用。 |
| BRM-MODE-002 | P0 | enabling 事务成功注册 Guard／controller 后才发布 on。 |
| BRM-MODE-003 | P0 | 注册失败时回滚为 off，不把页面留在无 controller 的 Guard 状态。 |
| BRM-MODE-004 | P0 | disabling 先阻止新 workflow，再注销、广播取消、解除 Guard 和清理 session state。 |
| BRM-MODE-005 | P0 | 注销后当前 Document 中已注入 controller 功能性惰性，不再响应 DOM／route。 |
| BRM-MODE-006 | P0 | Service Worker 启动 reconciliation 修复 config 与注册状态不一致。 |
| BRM-MODE-007 | P0 | Extension 更新不重置用户 Blind Mode 偏好，但已有页面按 Recovery 规则处理。 |
| BRM-MODE-008 | P1 | toolbar command 在 Reference／Unsupported 中禁用并给出无破坏性说明。 |

### 7.7 多标签页 Attempt Ownership

| ID | 优先级 | 场景与预期 |
| --- | --- | --- |
| BRM-OWN-001 | P0 | 两标签页同时申请同一 key，原子仲裁后恰好一个 owner。 |
| BRM-OWN-002 | P0 | 第二标签页保持 Guard 与 Conflict，默认 Commit 为零。 |
| BRM-OWN-003 | P0 | 不同 Problem Identity 或不同语言使用独立 key，可并行。 |
| BRM-OWN-004 | P0 | Released、Bypassed、Revealed 在 entry 结束前继续持有 Ownership。 |
| BRM-OWN-005 | P0 | Transfer 必须先使旧 owner Guard／暂停并 ACK，再向新 owner 授权。 |
| BRM-OWN-006 | P0 | event log 证明新 owner Commit 严格晚于旧 owner pause ACK。 |
| BRM-OWN-007 | P0 | Transfer 不修改旧 owner 的合成草稿，只遮挡 Workspace。 |
| BRM-OWN-008 | P0 | 旧 owner 无响应时不强制接管，新标签页保持冲突。 |
| BRM-OWN-009 | P0 | owner 关闭、离开、换语言、off 或完成 Transfer 时准确释放 lease。 |
| BRM-OWN-010 | P0 | waiter 不因 owner 消失而迟到自动 Reset；仍需显式继续当前流程。 |
| BRM-OWN-011 | P0 | Service Worker suspend／wake、重复／乱序消息与过期 ACK 不产生双 owner。 |
| BRM-OWN-012 | P0 | tab ID 复用但 Document identity／epoch 不匹配时拒绝旧消息。 |
| BRM-OWN-013 | P0 | 旧 owner 位于 Reset Pre-commit／Committed／uncertain failure 时拒绝 Transfer，不向新 tab 授权。 |
| BRM-OWN-014 | P0 | 旧 owner 到达确定终态或 Document 被证明消失后，用户重新发起 Transfer 才可继续。 |
| BRM-OWN-015 | P0 | Conflict tab 不能直接 Reveal／编辑；只有 Transfer 成功或关闭 Blind Mode 才解除独占 Guard。 |
| BRM-OWN-016 | P0 | Paused by Transfer 可聚焦 owner、反向 Transfer，或在 scope 释放后显式 reclaim；不会永久无出口，也不会自动揭示。 |

### 7.8 Privacy、Permissions 与 Diagnostics

| ID | 优先级 | 场景与预期 |
| --- | --- | --- |
| BRM-PRIV-001 | P0 | Manifest snapshot 只含批准权限与 `leetcode.cn/problems/*` host；禁止 `<all_urls>`、cookies、webRequest、unlimitedStorage。 |
| BRM-PRIV-002 | P0 | Extension 自定义外部 fetch、XHR、Beacon、WebSocket、EventSource 请求为零。 |
| BRM-PRIV-003 | P0 | 持久 storage 只含 Blind Mode 与非敏感配置；Attempt／Ownership／diagnostics 只在 session storage。 |
| BRM-PRIV-004 | P0 | 完整浏览器重启后 Attempt、Ownership 与 diagnostics 消失，Blind Mode 设置保留。 |
| BRM-PRIV-005 | P0 | code、testcase、console、submission、account canary 不出现在消息、storage、日志、诊断或剪贴板。 |
| BRM-PRIV-006 | P0 | 构建审计禁止 Editor 内容 getter、Editor 写入、LeetCode storage 草稿修改、私有 API 与远程代码。 |
| BRM-PRIV-007 | P0 | fixture 证明唯一破坏性路径是可见 Reset UI；Extension 不直接修改 Editor value／DOM。 |
| BRM-DIAG-001 | P1 | diagnostics 严格按 schema allowlist，只含版本、route、slug、语言、状态、耗时、候选数量与错误码。 |
| BRM-DIAG-002 | P1 | “复制诊断”必须由用户点击触发，且不含 HTML、大段文本、截图、账号或 Token。 |
| BRM-DIAG-003 | P1 | 默认不持续刷 console；成功后无网页诊断 UI。 |

### 7.9 Popup、Keyboard 与 Accessibility

| ID | 优先级 | 场景与预期 |
| --- | --- | --- |
| BRM-A11Y-001 | P1 | Guard 状态、倒计时、失败、Recovery 和 Conflict 有明确可访问名称与状态说明。 |
| BRM-A11Y-002 | P1 | 五秒窗口中 Enter 立即 Reset、Esc Bypass；按钮焦点顺序可预测。 |
| BRM-A11Y-003 | P1 | Commit 后取消控件消失或禁用，不提供虚假可撤销承诺。 |
| BRM-A11Y-004 | P1 | Guard 期间焦点不能落入被覆盖 Workspace；解锁后焦点可正常进入 Editor。 |
| BRM-A11Y-005 | P1 | Light／dark theme 中状态、按钮和错误文本符合可读性与对比度要求。 |
| BRM-A11Y-006 | P1 | Screen reader 公告不朗读 Editor／Console 内容，仅报告 workflow 状态。 |

## 8. 视觉防泄露测试方法

### 8.1 Cold document

1. 在导航前开启 Chrome screencast／trace。
2. fixture 在最早可绘制时插入醒目的 `OLD_CODE_CANARY` 区块。
3. 捕获从 navigation start 到 Released／Failure 的所有帧。
4. 对 Coding Workspace 区域做像素与遮挡断言。
5. 任意帧出现 canary 可辨识像素即 P0 失败。

### 8.2 SPA 与语言切换

fixture 在 route／language handler 中同步替换 canary。测试验证 Extension 在支持的捕获路径中先升起 Guard，再允许 fixture mutation。快速重复 50 次以发现单帧 race。

### 8.3 限制

截图与 screencast 只能提供高强度经验保证，不能证明硬件、Chrome 故障、Extension 被禁用或其他 Extension 干预时绝对零帧。测试结论必须保持与产品 best-effort 承诺一致。

## 9. 登录态 `leetcode.cn` 人工 Contract 清单

每次发布以及发现 UI 改版时，在当前 Chrome Stable、普通窗口、已登录测试账号下执行：

1. 确认 Practice／Reference route map 与 slug normalization。
2. 确认 Coding Workspace 完整边界。
3. 确认语言标识及在旧语言代码显示前可拦截的切换路径。
4. 确认 Reset menu 入口、menu item、是否存在二次确认、最终确认与 Commit Point。
5. 使用可丢弃草稿执行一次完整 Reset，确认 UI completion evidence。
6. 冷加载、F5、SPA 换题与语言切换分别录制并逐帧查看 Guard。
7. 验证 Solutions／Submissions 直达与往返语义。
8. 人为使 adapter contract 失配，确认 Guarded Failure 而非误点。
9. 两个标签页验证 Conflict 与 Ownership Transfer。
10. 验证 Run、Submit、Editor remount 不触发新 Reset。
11. 检查 Network，确认没有 Extension 遥测或私有 API。
12. 检查 Manifest permissions、storage 与复制诊断内容。
13. 检查成功后无常驻 UI、键盘事件不再被拦截。
14. 确认测试期间没有产生 Submit 或改变 Submission History。
15. 在真实 Chrome 中分别演练一次会话恢复、Memory Saver discard 和 Extension update recovery；不得用 fixture 通过替代这项人工门禁。

人工记录只包含 Chrome／Extension 版本、日期、UI contract version、通过／失败与脱敏界面截图；不得记录代码或账号信息。

最低人工语言矩阵应包含 C++、Java、Python3 和一种 SQL／数据库题语言，以覆盖不同模板形态；如果发布声明支持更多特殊语言 UI，则增加对应 contract smoke。

## 10. 发布门禁

版本不得发布，除非：

- 所有 P0 自动测试通过。
- P1 无已知功能性失败；非破坏性 UI 缺陷必须有书面接受记录。
- 状态机至少 10,000 条随机事件序列无不变量失败。
- 首帧、快速导航、active-budget timeout、旧 callback 与 Ownership race P0 用例连续重复 50 次无 flake。
- 测试对象是实际发布包，而不仅是测试构建。
- 当前 Chrome Stable 登录态人工 contract test 全部通过。
- 真实 Chrome 会话恢复／discard／Extension recovery 人工演练全部通过；不可自动化环境中的 skip 不算通过。
- Manifest permission snapshot 与批准清单一致。
- Extension 自定义外部网络请求为零。
- 所有 Guarded Failure 都有明确 Retry／Reveal／Disable 出口。
- 没有未解释的 console error、未清理 Observer、timer、listener 或悬空 Ownership。
- 设计规格、fixture contract 与 DOM adapter version 同步更新。

## 11. 缺陷分级

| 等级 | 定义 | 示例 |
| --- | --- | --- |
| P0 / Blocker | 可能泄露旧代码、覆盖未授权草稿、重复 Commit、跨标签双 owner 或绕过 Content-Blind | Guard 单帧缺口、Released 后 Reset、后台 Commit |
| P1 / Major | 自动流程安全失败错误、用户无法恢复、错误 route 行为或重要诊断缺失 | Reference 被 Reset、Failure 无 Reveal |
| P2 / Minor | 不影响安全边界的视觉、文案或非关键易用性问题 | 成功提示动画不平滑 |

任何 P0 缺陷都禁止发布，不接受“低概率”豁免。

## 12. 已知测试缺口

- 自动 fixture 无法预测 LeetCode A/B 测试、未公开改版或全新 Editor；真实站点 contract test 因而是强制门禁。
- Chrome crash recovery、Memory Saver 和 Extension update 在部分 CI 中无法完全复现，需要周期性人工演练。
- 页面在 `pagehide` 前崩溃、Extension 被禁用或其他 Extension 破坏 Guard 的场景无法保证首帧。
- Content-Blind 决策意味着测试只能确认 Reset UI workflow，不能确认模板内容逐字正确。
- LeetCode 自身跨标签页持久化时序不受 Extension 控制；Ownership 只约束本 Extension 的 Reset concurrency。
- Edge、Firefox、移动端、无痕、`leetcode.com`、Contest 与其他特殊 Editor 不属于测试承诺。

## 13. Prior Art

当前仓库在本设计前没有实现代码、测试框架或相似浏览器自动化测试，因此没有可引用的代码库 prior art。V1 应把“打包 Extension 的 Chrome 黑盒 seam”和“纯生命周期协调器 seam”建立为后续功能的测试先例；不得为了声称复用而引入更低层、更多的测试 seam。
