/**
 * 业务文件 1/3：客户改款拆镶闭环 —— 规则
 * 纯类型、常量、种子数据与无副作用业务规则，不依赖 React / DOM。
 */

/* ---------------------------------- 枚举 ---------------------------------- */

/** 宝石分拣状态 */
export const STONE_STATUS = ["待镶", "已镶嵌", "待复检", "待修", "已交付"] as const;
export type StoneStatus = (typeof STONE_STATUS)[number];

/** 拆镶单状态 */
export const REMOVAL_STATUS = ["待拆镶", "待复检", "已完成"] as const;
export type RemovalStatus = (typeof REMOVAL_STATUS)[number];

/** 复检结论项（爪痕 / 崩边等，可多选） */
export const INSPECTION_FINDINGS = ["无损伤", "爪痕", "崩边", "表面划伤", "缺口"] as const;
export type InspectionFinding = (typeof INSPECTION_FINDINGS)[number];

/** 形状（与筛选芯片一致） */
export const SHAPES = ["圆形", "椭圆", "梨形", "祖母绿切"] as const;
export type Shape = (typeof SHAPES)[number];

/** 尺寸档（按最大直径 mm 归档） */
export const SIZE_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: "≤3mm", min: 0, max: 3 },
  { label: "3–5mm", min: 3.01, max: 5 },
  { label: "5–8mm", min: 5.01, max: 8 },
  { label: ">8mm", min: 8.01, max: 999 },
];

/* --------------------------------- 数据模型 -------------------------------- */

export interface Gemstone {
  id: string;
  code: string; // 宝石编号
  kind: string; // 种类
  shape: Shape;
  carat: number; // 克拉重量
  mm: number; // 尺寸（最大直径 mm）
  clarity: string; // 净度
  color: string; // 颜色
  cut: string; // 切工
  status: StoneStatus; // 分拣状态
  orderId: string | null; // 所属订单
  position: string; // 镶嵌位置；待镶时为 "待配镶位"
  positionSnapshot: string | null; // 拆镶瞬间原镶位留档（损伤只读用）
  defectNote: string; // 缺陷备注
  batchId: string | null; // 分拣批次
  /** 正经历的未结拆镶单号（待拆镶/待复检期间冻结） */
  removalId: string | null;
}

export interface Order {
  id: string;
  customer: string; // 客户
  item: string; // 款型
  delivered: boolean; // 是否已交付
}

export interface SortingBatch {
  id: string;
  name: string;
  createdAt: string;
}

export interface RemovalItem {
  stoneId: string;
  positionSnapshot: string; // 拆镶前镶位留档
  inspected: boolean; // 是否已复检
  findings: InspectionFinding[]; // 复检结论
  inspectNote: string; // 复检备注
}

export interface RemovalOrder {
  id: string;
  orderId: string; // 来源订单
  customer: string; // 客户（登记时快照）
  reason: string; // 改款说明
  status: RemovalStatus;
  createdAt: string;
  items: RemovalItem[];
}

export interface AppState {
  stones: Gemstone[];
  orders: Order[];
  batches: SortingBatch[];
  removals: RemovalOrder[];
  seq: { removal: number };
}

/* -------------------------------- 规则结果类型 ------------------------------- */

export interface RuleResult<T = unknown> {
  ok: boolean;
  message: string;
  /** 整次拒绝时给出冲突宝石，便于页面提示 */
  conflicts?: string[];
  data?: T;
}

/* ---------------------------------- 判据 ---------------------------------- */

/** 已交付订单 */
export const isOrderDelivered = (s: AppState, orderId: string): boolean =>
  s.orders.some((o) => o.id === orderId && o.delivered);

/** 该石是否存在未结拆镶单（待拆镶/待复检） */
export function hasOpenRemoval(s: AppState, stoneId: string): boolean {
  return s.removals.some(
    (r) => r.status !== "已完成" && r.items.some((i) => i.stoneId === stoneId),
  );
}

/**
 * 拆镶期间冻结：已被未结拆镶单占用，或复检判定损伤后进入待修。
 * 冻结期间不得被其他订单配石、不得改镶嵌位。
 */
export function isStoneFrozen(stone: Gemstone, s: AppState): boolean {
  if (stone.status === "待修") return true;
  if (stone.removalId && hasOpenRemoval(s, stone.id)) return true;
  return false;
}

/** 拆镶候选：已镶嵌 且 所属订单未交付 且 未被冻结 */
export function eligibleForRemoval(stone: Gemstone, s: AppState): boolean {
  if (stone.status !== "已镶嵌") return false;
  if (!stone.orderId || isOrderDelivered(s, stone.orderId)) return false;
  if (isStoneFrozen(stone, s)) return false;
  return true;
}

/** 可配石（分配到订单）：仅待镶且未冻结 */
export function canAssignStone(stone: Gemstone, s: AppState): RuleResult {
  if (stone.status !== "待镶") return { ok: false, message: "仅待镶宝石可配石" };
  if (isStoneFrozen(stone, s))
    return { ok: false, message: "拆镶/待修期间冻结，不得配石" };
  return { ok: true, message: "" };
}

/** 可改镶嵌位：已镶嵌或待镶，且未冻结；已交付不可改 */
export function canRepositionStone(stone: Gemstone, s: AppState): RuleResult {
  if (stone.status === "已交付") return { ok: false, message: "已交付，不可改镶嵌位" };
  if (stone.status === "待复检" || stone.status === "待修")
    return { ok: false, message: "拆镶期间冻结，不得改镶嵌位" };
  if (stone.removalId && hasOpenRemoval(s, stone.id))
    return { ok: false, message: "拆镶期间冻结，不得改镶嵌位" };
  if (stone.status !== "已镶嵌" && stone.status !== "待镶")
    return { ok: false, message: "当前状态不可改镶嵌位" };
  return { ok: true, message: "" };
}

/* ------------------------------ 拆镶单生命周期 ------------------------------ */

export interface CreateRemovalInput {
  orderId: string;
  reason: string;
  stoneIds: string[];
}

/**
 * 登记拆镶单。
 * 规则：
 *  1. 只能选已镶嵌且未交付订单的宝石；
 *  2. 同颗宝石已有未结拆镶单时，整次拒绝（原子性：不产生任何部分单据）；
 * 拒绝时原单与分拣状态均不变（调用方拿到 !ok 不得写状态）。
 */
export function createRemoval(
  s: AppState,
  input: CreateRemovalInput,
): RuleResult<{ state: AppState; removal: RemovalOrder }> {
  const order = s.orders.find((o) => o.id === input.orderId);
  if (!order) return { ok: false, message: "来源订单不存在" };
  if (order.delivered) return { ok: false, message: "订单已交付，不能发起改款拆镶" };
  if (input.stoneIds.length === 0)
    return { ok: false, message: "请至少选择一颗宝石" };

  const conflicts: string[] = [];
  const rejectReasons: string[] = [];

  for (const id of input.stoneIds) {
    const stone = s.stones.find((g) => g.id === id);
    if (!stone) {
      rejectReasons.push(`宝石 ${id} 不存在`);
      continue;
    }
    // 规则 2：同颗已有未结拆镶单 → 整次拒绝
    if (hasOpenRemoval(s, id)) {
      conflicts.push(stone.code);
      continue;
    }
    // 规则 1：必须已镶嵌且订单未交付，且当前不属于其他已交付订单
    if (stone.status !== "已镶嵌") {
      rejectReasons.push(`${stone.code} 非已镶嵌状态`);
      continue;
    }
    if (stone.orderId !== input.orderId) {
      rejectReasons.push(`${stone.code} 不属于订单 ${input.orderId}`);
      continue;
    }
    if (isOrderDelivered(s, stone.orderId ?? "")) {
      rejectReasons.push(`${stone.code} 所属订单已交付`);
    }
  }

  if (conflicts.length > 0) {
    return {
      ok: false,
      message: `整次拒绝：${conflicts.join("、")} 已有未结拆镶单，原单与分拣状态不变`,
      conflicts,
    };
  }
  if (rejectReasons.length > 0) {
    return { ok: false, message: `整次拒绝：${rejectReasons.join("；")}` };
  }

  const no = s.seq.removal + 1;
  const id = `CX-${String(no).padStart(4, "0")}`;
  const now = new Date().toISOString();

  const removal: RemovalOrder = {
    id,
    orderId: order.id,
    customer: order.customer,
    reason: input.reason.trim() || "客户改款",
    status: "待拆镶",
    createdAt: now,
    items: input.stoneIds.map((stoneId) => {
      const stone = s.stones.find((g) => g.id === stoneId)!;
      return {
        stoneId,
        positionSnapshot: stone.position,
        inspected: false,
        findings: [],
        inspectNote: "",
      };
    }),
  };

  // 冻结：宝石标记 removalId（分拣状态此时仍为“已镶嵌”，但被冻结）
  const stones = s.stones.map((g) =>
    input.stoneIds.includes(g.id) ? { ...g, removalId: id } : g,
  );

  return {
    ok: true,
    message: `拆镶单 ${id} 已登记，${input.stoneIds.length} 颗宝石进入拆镶冻结`,
    data: {
      state: {
        ...s,
        stones,
        removals: [removal, ...s.removals],
        seq: { removal: no },
      },
      removal,
    },
  };
}

/** 确认拆镶完成（物理拆下）：单据 → 待复检，宝石 → 待复检 */
export function confirmRemoved(s: AppState, removalId: string): RuleResult<AppState> {
  const r = s.removals.find((x) => x.id === removalId);
  if (!r) return { ok: false, message: "拆镶单不存在" };
  if (r.status !== "待拆镶") return { ok: false, message: "仅待拆镶单可确认拆镶" };

  const ids = new Set(r.items.map((i) => i.stoneId));
  return {
    ok: true,
    message: `${r.id} 已拆下，等待逐颗复检`,
    data: {
      ...s,
      removals: s.removals.map((x) => (x.id === removalId ? { ...x, status: "待复检" } : x)),
      stones: s.stones.map((g) =>
        ids.has(g.id)
          ? { ...g, status: "待复检" as StoneStatus, position: "待复检" }
          : g,
      ),
    },
  };
}

export interface InspectionInput {
  stoneId: string;
  findings: InspectionFinding[];
  inspectNote: string;
}

/**
 * 登记一颗宝石的复检结论（爪痕、崩边等）。
 * - 有损伤 → 宝石转“待修”，原镶位留只读记录（positionSnapshot），不可配石/改位；
 * - 无损伤 → 宝石恢复“待镶”，可重新配石。
 * 拆镶单全部复检完 → 自动完结。
 */
export function submitInspection(
  s: AppState,
  removalId: string,
  input: InspectionInput,
): RuleResult<AppState> {
  const r = s.removals.find((x) => x.id === removalId);
  if (!r) return { ok: false, message: "拆镶单不存在" };
  if (r.status !== "待复检") return { ok: false, message: "该单不在待复检环节" };

  const item = r.items.find((i) => i.stoneId === input.stoneId);
  if (!item) return { ok: false, message: "该宝石不在此拆镶单内" };
  if (item.inspected) return { ok: false, message: "复检结论已登记，只读不可改" };

  const findings = input.findings.filter((f) => f !== "无损伤");
  const damaged = findings.length > 0;

  const nextItems: RemovalItem[] = r.items.map((i) =>
    i.stoneId === input.stoneId
      ? {
          ...i,
          inspected: true,
          findings: damaged ? findings : (["无损伤"] as InspectionFinding[]),
          inspectNote: input.inspectNote.trim(),
        }
      : i,
  );
  const allDone = nextItems.every((i) => i.inspected);

  // 每颗复检完即解除其拆镶冻结标记：
  // 无损伤 → 待镶可重新配石；有损伤 → 待修，靠状态本身保持冻结
  const nextStone = (g: Gemstone): Gemstone => {
    if (g.id !== input.stoneId) return g;
    if (damaged) {
      // 有损伤：转待修，原镶位留只读记录，缺陷备注追加复检结论
      return {
        ...g,
        status: "待修",
        position: `待修（原${item.positionSnapshot}）`,
        positionSnapshot: item.positionSnapshot,
        removalId: null,
        defectNote: appendNote(
          g.defectNote,
          `拆镶复检：${findings.join("、")}${input.inspectNote.trim() ? `（${input.inspectNote.trim()}）` : ""}`,
        ),
      };
    }
    // 无损伤：恢复待镶，可重新配石
    return {
      ...g,
      status: "待镶",
      position: "待配镶位",
      positionSnapshot: item.positionSnapshot,
      removalId: null,
    };
  };

  return {
    ok: true,
    message: damaged
      ? `复检有损伤（${findings.join("、")}），转待修并保留只读记录`
      : "复检无损伤，已恢复待镶",
    data: {
      ...s,
      removals: s.removals.map((x) =>
        x.id === removalId
          ? { ...x, items: nextItems, status: allDone ? "已完成" : "待复检" }
          : x,
      ),
      stones: s.stones.map(nextStone),
    },
  };
}

function appendNote(prev: string, add: string): string {
  const base = prev.trim();
  if (!base) return add;
  return base.includes(add) ? base : `${base}；${add}`;
}

/* ------------------------------ 配石 / 改镶嵌位 ------------------------------ */

/** 配石：把待镶石分配给未交付订单 */
export function assignStone(
  s: AppState,
  stoneId: string,
  orderId: string,
): RuleResult<AppState> {
  const stone = s.stones.find((g) => g.id === stoneId);
  if (!stone) return { ok: false, message: "宝石不存在" };
  const guard = canAssignStone(stone, s);
  if (!guard.ok) return { ok: false, message: guard.message };
  const order = s.orders.find((o) => o.id === orderId);
  if (!order) return { ok: false, message: "订单不存在" };
  if (order.delivered) return { ok: false, message: "订单已交付，不能配石" };

  return {
    ok: true,
    message: `${stone.code} 已配至订单 ${order.id}（${order.customer}）`,
    data: {
      ...s,
      stones: s.stones.map((g) =>
        g.id === stoneId
          ? {
              ...g,
              orderId,
              status: "待镶" as StoneStatus,
              position: g.position === "待配镶位" ? "待安排镶位" : g.position,
            }
          : g,
      ),
    },
  };
}

/** 改镶嵌位：仅非冻结、非交付的在制石 */
export function repositionStone(
  s: AppState,
  stoneId: string,
  position: string,
): RuleResult<AppState> {
  const stone = s.stones.find((g) => g.id === stoneId);
  if (!stone) return { ok: false, message: "宝石不存在" };
  const guard = canRepositionStone(stone, s);
  if (!guard.ok) return { ok: false, message: guard.message };
  const pos = position.trim();
  if (!pos) return { ok: false, message: "镶嵌位不能为空" };

  return {
    ok: true,
    message: `${stone.code} 镶嵌位已改为 ${pos}`,
    data: {
      ...s,
      stones: s.stones.map((g) => (g.id === stoneId ? { ...g, position: pos } : g)),
    },
  };
}

/** 订单交付：已镶嵌石一并转已交付（交付后不可拆镶/改位） */
export function deliverOrder(s: AppState, orderId: string): RuleResult<AppState> {
  const order = s.orders.find((o) => o.id === orderId);
  if (!order) return { ok: false, message: "订单不存在" };
  if (order.delivered) return { ok: false, message: "订单已交付" };
  if (hasOrderOpenRemoval(s, orderId))
    return { ok: false, message: "该订单存在未结拆镶单，不能交付" };

  return {
    ok: true,
    message: `订单 ${orderId} 已交付`,
    data: {
      ...s,
      orders: s.orders.map((o) => (o.id === orderId ? { ...o, delivered: true } : o)),
      stones: s.stones.map((g) =>
        g.orderId === orderId && g.status === "已镶嵌"
          ? { ...g, status: "已交付" as StoneStatus }
          : g,
      ),
    },
  };
}

export function hasOrderOpenRemoval(s: AppState, orderId: string): boolean {
  return s.removals.some((r) => r.orderId === orderId && r.status !== "已完成");
}

/* --------------------------------- 筛选派生 -------------------------------- */

export interface StoneFilter {
  shape: Shape | "全部";
  sizeLabel: string | "全部";
  keyword: string;
}

/** 订单清单、分拣批次、尺寸筛选共用的同一份筛选结果 */
export function filterStones(stones: Gemstone[], f: StoneFilter): Gemstone[] {
  const bucket = SIZE_BUCKETS.find((b) => b.label === f.sizeLabel);
  const kw = f.keyword.trim().toLowerCase();
  return stones.filter((g) => {
    if (f.shape !== "全部" && g.shape !== f.shape) return false;
    if (bucket && !(g.mm >= bucket.min && g.mm <= bucket.max)) return false;
    if (kw) {
      const hay = `${g.code} ${g.kind} ${g.orderId ?? ""} ${g.position}`.toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    return true;
  });
}

/* -------------------------------- 种子数据 -------------------------------- */

export function seedState(): AppState {
  const orders: Order[] = [
    { id: "DD-1001", customer: "林女士", item: "蓝宝石三石戒", delivered: false },
    { id: "DD-1002", customer: "陈先生", item: "围钻群镶吊坠", delivered: false },
    { id: "DD-1003", customer: "周女士", item: "祖母绿戒指", delivered: true },
    { id: "DD-1004", customer: "王先生", item: "梨形钻戒指", delivered: false },
  ];

  const batches: SortingBatch[] = [
    { id: "PC-09", name: "九月上旬分拣批次", createdAt: "2026-09-03" },
    { id: "PC-10", name: "九月中旬分拣批次", createdAt: "2026-09-15" },
  ];

  const stones: Gemstone[] = [
    {
      id: "g1", code: "ST-2048", kind: "蓝宝石", shape: "椭圆", carat: 1.28, mm: 7.2,
      clarity: "VS", color: "皇家蓝", cut: "椭圆明亮切", status: "已镶嵌",
      orderId: "DD-1001", position: "主石位", positionSnapshot: null,
      defectNote: "", batchId: "PC-09", removalId: null,
    },
    {
      id: "g2", code: "ST-2049", kind: "蓝宝石", shape: "椭圆", carat: 0.52, mm: 5.1,
      clarity: "VS", color: "矢车菊", cut: "椭圆明亮切", status: "已镶嵌",
      orderId: "DD-1001", position: "左副石位", positionSnapshot: null,
      defectNote: "", batchId: "PC-09", removalId: null,
    },
    {
      id: "g3", code: "ST-2050", kind: "蓝宝石", shape: "椭圆", carat: 0.49, mm: 4.9,
      clarity: "SI", color: "矢车菊", cut: "椭圆明亮切", status: "已镶嵌",
      orderId: "DD-1001", position: "右副石位", positionSnapshot: null,
      defectNote: "亭部轻微色带", batchId: "PC-09", removalId: null,
    },
    {
      id: "g4", code: "ST-2061", kind: "钻石", shape: "圆形", carat: 0.08, mm: 2.8,
      clarity: "VVS", color: "D", cut: "圆钻", status: "已镶嵌",
      orderId: "DD-1002", position: "围石A组", positionSnapshot: null,
      defectNote: "", batchId: "PC-09", removalId: null,
    },
    {
      id: "g5", code: "ST-2062", kind: "钻石", shape: "圆形", carat: 0.07, mm: 2.7,
      clarity: "VVS", color: "E", cut: "圆钻", status: "已镶嵌",
      orderId: "DD-1002", position: "围石B组", positionSnapshot: null,
      defectNote: "", batchId: "PC-09", removalId: null,
    },
    {
      id: "g6", code: "ST-2073", kind: "钻石", shape: "梨形", carat: 0.72, mm: 6.8,
      clarity: "VS1", color: "F", cut: "梨形混合切", status: "待镶",
      orderId: "DD-1004", position: "待安排镶位", positionSnapshot: null,
      defectNote: "", batchId: "PC-10", removalId: null,
    },
    {
      id: "g7", code: "ST-2080", kind: "钻石", shape: "圆形", carat: 0.35, mm: 4.5,
      clarity: "VS2", color: "G", cut: "圆钻", status: "待镶",
      orderId: null, position: "待配镶位", positionSnapshot: null,
      defectNote: "", batchId: "PC-10", removalId: null,
    },
    {
      id: "g8", code: "ST-2099", kind: "祖母绿", shape: "祖母绿切", carat: 0.91, mm: 6.4,
      clarity: "SI", color: "木佐绿", cut: "祖母绿阶梯切", status: "已交付",
      orderId: "DD-1003", position: "主石位", positionSnapshot: null,
      defectNote: "内含物明显，已客户确认", batchId: "PC-09", removalId: null,
    },
    {
      id: "g9", code: "ST-2105", kind: "钻石", shape: "圆形", carat: 0.12, mm: 3.2,
      clarity: "VS", color: "F", cut: "圆钻", status: "待镶",
      orderId: null, position: "待配镶位", positionSnapshot: null,
      defectNote: "", batchId: "PC-10", removalId: null,
    },
    {
      id: "g10", code: "ST-2110", kind: "红宝石", shape: "椭圆", carat: 0.6, mm: 5.6,
      clarity: "SI", color: "鸽血红", cut: "椭圆混合切", status: "待镶",
      orderId: null, position: "待配镶位", positionSnapshot: null,
      defectNote: "台面有细小点状包裹体", batchId: "PC-10", removalId: null,
    },
  ];

  return { stones, orders, batches, removals: [], seq: { removal: 0 } };
}
