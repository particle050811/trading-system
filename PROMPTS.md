# 关键 Prompt 记录

精选开发中 6 条代表性 prompt，按"场景 → prompt 节选 → AI 方向 → 我的决策"四段呈现，重点是**我如何在 AI 输出之上做取舍**。

---

## 1. 撮合订单簿的数据结构选型

**场景**：撮合引擎从零开始，n 在百到千量级。

**Prompt 节选**：
> 候选三种实现：a) 有序数组+二分；b) 双堆；c) 价格→FIFO 链表 + 平衡 BST。请从「单笔下单摊还时间」「部分成交游标遍历」「撤单」三个维度比较，**先讲取舍，不要给代码**。

**AI 方向**：给了一张三维对比表，结论倾向 c 方案最通用。

**我的决策**：选 a。
- 撮合不是"取最优一个就走"——taker 大单走完一整档前缀时，堆要反复 push/pop，缓存命中和常数都劣于数组前缀遍历。
- n ≤ 千，O(n) 移位的常数远低于堆的指针跳转；若放大到 10⁵+ 才换 c。
- 撤单 O(n) 看似劣，但有 `ordersById` 索引 + 簿内 `indexOf`，n 千以内仍便宜。

代码：`back-end/src/store/orders.ts:30-47`、`back-end/src/engine/matcher.ts:42-104`。

---

## 2. 金额精度：后端只存精确整数

**场景**：金融系统对精度极敏感。我从开始就规避浮点，全程 `priceCents`（整数分）。摊销 `round(T*q/Q)` 这一步的整数化让我纠结：是否会破坏"存的全是精确整数"。

**Prompt 节选**：
> Position 我倾向只存 `qty / totalCostCents / frozenQty` 三个整数，不存均价（让前端自己算）。请帮我推清楚两件事：(1) 这个边界是否合理；(2) `round(T*q/Q)` 是否会留下"被四舍五入吞掉的零碎"，特别是清仓时。

**AI 方向**：
1. 三字段边界正确，均价是显示问题、不应进后端存储。
2. round 的作用不是"消化误差"，而是"把数学上不一定整除的中间量整数化以满足整数字段约束"——T 始终精确。
3. 清仓时 `q_k = Q_{k-1}` 代入公式，`T_k = 0` 精确成立，跨周期无残留。

**我的决策**：
- Position 三字段定型，类型注释写明"精确整数、不存派生量"，挡住未来加 `avgPriceCents` 的冲动。
- 不变量证明写进 `reservation.ts` 注释，审计时无需读测试。
- 用 `Math.round`（无偏）而非 floor/ceil；单测锁住"清仓后再买入均价无残留"。
- 路由层 `priceCents/qty ≤ 1e6` 是**抗滥用硬护栏**（10¹² cents 距 `MAX_SAFE_INTEGER` 还有 3+ 数量级余量），与精度数学无关。

**反思**：第一版我把这节标题写成"舍入误差怎么处理"，混淆了"显示精度"和"存储精度"。后端根本不存均价，不存在"被存进去的不精确值"——把 prompt 重写成"职责边界 + 整数化必要性"才对得上代码。

代码：`back-end/src/store/users.ts:4-15`、`back-end/src/store/reservation.ts:40-78`、`back-end/src/routes/orders.ts:45-60`。

---

## 3. WebSocket 鉴权：拒绝匿名 vs 接受匿名

**场景**：WS 同时承担公开行情广播和用户私有推送。

**Prompt 节选**：
> token 非法时直接 close，还是接受为匿名连接只让收行情？

**AI 方向**：方案 2 更合理——行情公开，作为登录前体验更友好；私有推送通过 `clientsByUser` 二级索引天然隔离。

**我的决策**：采纳方案 2。token 解析失败仅静默；`hello` 消息带 `userId`（匿名为 `null`）；匿名连接显式跳过 `sendSnapshot`，确保私有数据永远不发到匿名连接——这是安全边界。

代码：`back-end/src/ws/hub.ts:54-72`。

---

## 4. 委托面板：分 tab 还是合并表

**场景**：第一版按"未成交/已成交/已撤销"分 tab，自测时下一笔同价限价单瞬间全成交，"未成交"标签为空——我自己都误以为下单失败。

**Prompt 节选**：
> 改法 a：维持分 tab，下单后强制切到"已成交"或弹 toast；b：砍掉 tab 合并成时间倒序表，状态用 tag 区分。哪条 UX 更稳？

**AI 方向**：a 是补丁（toast 错过就回不来、自动切 tab 打断焦点）；b 在心智模型上更对——用户关心的就是"我刚下的单现在怎么样了"。

**我的决策**：选 b。围绕合并表补两件让优势落地的细节：
- 撤单按钮只在 `status ∈ {open, partial}` 时渲染，静态历史行显示 `—`。
- 部分成交单同时显示「30/100 进度」+「撤单按钮」——分 tab 时这两个信息必然分裂，合并表才能在同一行同时存在。

代码：`front-end/src/components/OrdersPanel.vue`。

---

## 5. 前端响应式 Map 的坑

**场景**：行情 store 用 `ref<Map<string, Stock>>`，`stocks.value.set(symbol, s)` 后界面不刷新。

**Prompt 节选**：
> Vue 3 + Pinia，`ref(Map)` 包装下 `.set()` 不触发响应式，怎么改？

**AI 方向**：a) 改 `reactive(new Map())`；b) 每次 `new Map(prev).set(symbol, s)` 让 ref 引用变化。

**我的决策**：选 b。reactive Map 的响应式覆盖在不同版本下行为易踩坑；显式替换快照在 3 支股票量级无负担，意图直白。三个 store（market/orders/portfolio）统一这个模式。

代码：`front-end/src/stores/market.ts:30-37`。

---

## 6. 单测如何隔离模块级单例

**场景**：撮合引擎依赖 `store/orders` `store/users` `store/stocks` 三个单例，vitest 用例间互相污染。

**Prompt 节选**：
> a) mock 这些 store；b) 导出 `__resetForTests()` 在 beforeEach 调用。哪种更好？

**AI 方向**：b 更值得。mock 会让测试与实现解耦过头、测不出 store 真实行为；带 `__` 前缀且只清空状态的 reset 钩子是工程上可接受的折中。

**我的决策**：采纳 b。换得的好处是测试走真实 reservation/order 路径，能抓到 mock 下永远跑不到的边界 bug——「清仓后再买入均价无残留」就是这样被锁住的。

代码：`back-end/src/store/orders.ts` 末尾、`back-end/src/engine/matcher.test.ts`。

---

## 我的 prompt 习惯

1. **先讲取舍、再要代码**——避免 AI 直接抛一坨方案。
2. **明确给候选**（"a 还是 b"）——AI 被迫比较时往往能看出我没考虑到的角度。
3. **对边界 case 单独追问**——舍入、溢出、空状态、断线重连。
4. **要复杂度而不是要"快"**——按维度比较比"哪个最快"得到的回复有用十倍。

最重要的：**写出的每一行代码，我都能讲清楚为什么这么写、还想过哪几条路、为什么没选**。
