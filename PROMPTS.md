# 关键 Prompt 记录

精选开发中 4 条代表性 prompt，按"场景 → AI 初版方案 → 我发现的问题 → 我要求的修正"四段呈现，重点是**我如何审查 AI 产出并把方向掰回来**。

---

## 1. 撮合订单簿的数据结构选型

**场景**：撮合引擎从零开始，需要支持任意规模的挂单簿，并保证价格优先 + 时间优先。

**AI 初版**：让 AI 实现订单簿，它选了"有序数组 + 二分插入"——`insertResting` 二分定位、`splice` 维持排序，撤单 `indexOf` + `splice`。当时 AI 给的理由是"n 在百到千量级，O(n) 移位常数小"。

**我的 Prompt 节选**：
> 这个方案不对。撮合的核心数据结构必须是跳表（或 BST），别用数组撑。同价位用 FIFO 队列保留时间优先，跨价档用跳表索引。**不要自己造跳表**——直接装 npm 上的 `proper-skip-list`。

**修正后**：挂单簿改为 `Map<symbol, ProperSkipList<priceCents, Order[]>>`。
- 撮合热路径走 `findEntriesFromMin/Max` 双向迭代，从最优档往外扫；每档 FIFO 队首天然就是时间优先最先挂的单。
- 同价位频繁挂撤场景下，跳表 O(log n) 比数组 `splice` 的 O(n) 移位优势随 n 放大。
- 用第三方库不自己写：双向迭代、概率层级、空档删除这些细节自己写一遍只会引入 bug。

实现踩坑：跳表迭代过程中**不能直接 `delete` 当前键**（会破坏 next/prev 指针），所以收集 `emptiedPrices`，循环结束统一删除。

代码：`back-end/src/store/orders.ts`、`back-end/src/engine/matcher.ts`、类型声明 `back-end/src/types/proper-skip-list.d.ts`、跳表行为单测 `back-end/src/store/orders.test.ts`。

---

## 2. 金额精度：后端只存精确整数

**场景**：金融系统对精度极敏感。

**AI 初版**：AI 默认用了 `number` 存金额（小数，单位元），并在 `Position` 上挂了 `avgPrice` 字段维护均价；下单校验也用浮点比较。

**我的 Prompt 节选**：
> 金额永远不准用浮点。全部改成整数分 (`priceCents`)，类型注释里写明"精确整数、不存派生量"。`Position` 只留 `qty / totalCostCents / frozenQty` 三个整数，**均价不要存**——这是显示问题，让前端自己算。再帮我推一遍：摊销 `round(T*q/Q)` 在清仓时是否会留下"被四舍五入吞掉的零碎"？

**修正后**：
- 全部金额走 `priceCents`（整数分），下单数量限制 `priceCents/qty ≤ 1e6`，10¹² cents 距 `MAX_SAFE_INTEGER` 还有 3+ 数量级余量，作为抗滥用硬护栏。
- `Position` 三字段定型，挡住未来加 `avgPriceCents` 的冲动。
- AI 推完证明：清仓时 `q_k = Q_{k-1}` 代入 `round(T*q/Q)` 公式，`T_k = 0` 精确成立，跨周期无残留。`Math.round` 用无偏舍入。
- 不变量证明写进 `reservation.ts` 注释；单测锁住"清仓后再买入均价无残留"。

代码：`back-end/src/store/users.ts:4-15`、`back-end/src/store/reservation.ts:40-78`、`back-end/src/routes/orders.ts:45-60`。

---

## 3. 委托面板：分 tab 还是合并表

**场景**：委托列表前端展示。

**AI 初版**：AI 默认按"未成交 / 已成交 / 已撤销"切了三个 tab。自测时下了一笔同价限价单瞬间全成交，"未成交"标签为空——我自己都误以为下单失败。

**我的 Prompt 节选**：
> 分 tab 这条路不对。下完单切到空 tab 用户看不到成交反馈，自动切 tab 又打断焦点，弹 toast 错过就回不来。砍掉 tab 改成时间倒序的合并表，状态用 tag 区分；撤单按钮只在 `status ∈ {open, partial}` 时渲染。

**修正后**：
- 一张时间倒序表，列里加状态 tag，所有委托都在同一视图下。
- 撤单按钮按状态条件渲染，静态历史行显示 `—`。
- 部分成交单同时显示「30/100 进度」+「撤单按钮」——分 tab 时这两个信息必然分裂，合并表才能在同一行同时存在。

代码：`front-end/src/components/OrdersPanel.vue`。

---

## 4. 前端响应式 Map 的坑

**场景**：行情 store 用 `Map<symbol, Stock>` 维护多支股票。

**AI 初版**：AI 写成 `const stocks = ref(new Map<string, Stock>())`，更新走 `stocks.value.set(symbol, s)`。代码看起来合理，但 WS 推送过来后界面不刷新——`Map.prototype.set` 不触发 ref 的 trigger。

**我的 Prompt 节选**：
> 这版不行，`ref(Map)` 包装下 `.set()` 根本不响应式。两个候选：(a) 改 `reactive(new Map())`；(b) 每次 `stocks.value = new Map(prev).set(symbol, s)` 让 ref 引用整体替换。选 (b)，因为 reactive Map 的响应式覆盖在不同 Vue 版本下行为踩坑多。

**修正后**：
- `market` / `orders` / `portfolio` 三个 store 统一走"显式替换快照"模式：`s.value = new Map(s.value).set(k, v)`。
- 3 支股票量级下整体 clone 无性能负担；意图直白，新人 review 一眼就能看懂触发响应式的是赋值不是 `.set()`。

代码：`front-end/src/stores/market.ts:30-37`。

---

## 我的 prompt 习惯

1. **先看 AI 给什么，再判断是否需要打回**——不预先设候选，让 AI 暴露它默认的取向。
2. **打回时要明确指出问题在哪、修正方向是什么**——"这版不对，原因是 X，改成 Y"，避免 AI 又抛一堆方案让我挑。
3. **不让 AI 自己造轮子**——能用第三方就用，跳表、JWT、WebSocket 库都不自己写。
4. **对边界 case 单独追问**——舍入、溢出、空状态、断线重连、自成交。

最重要的：**写出的每一行代码，我都能讲清楚为什么这么写、AI 第一版错在哪、我是怎么发现并掰回来的**。
