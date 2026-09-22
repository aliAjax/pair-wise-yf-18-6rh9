// 珠宝分拣 · 客户改款拆镶闭环 —— 业务规则层
// 只放领域类型、常量与纯函数，不依赖 React，也不读写浏览器存储。

export const STORAGE_KEY = "jewelry-dismount-v1";
export const FILTER_KEY = "jewelry-dismount-filter-v1";

/* ------------------------------------------------------------------ */
/* 领域模型                                                            */
/* ------------------------------------------------------------------ */

// 宝石分拣状态机：
// 待镶 -> 已镶嵌 -> 拆镶中（冻结）-> 无损伤恢复「待镶」 / 有损伤转「待修」
// 已镶嵌 -> 已交付（终态，不可拆镶）
export type StoneStatus = "待镶" | "已镶嵌" | "拆镶中" | "待修" | "已交付";

export const STONE_STATUS_FLOW: Record<StoneStatus, string> = {
  待镶: "已分拣入池，等待配石镶嵌",
  已镶嵌: "已镶入首饰，订单未交付",
  拆镶中: "客户改款拆镶冻结：禁止配石、禁止改镶嵌位",
  待修: "复检发现损伤，转待修，档案只读",
  已交付: "已随首饰交付客户，不可再拆镶",
};

export const SHAPES = ["圆形", "椭圆", "梨形", "祖母绿切"] as const;
export const FINDINGS = ["爪痕", "崩边", "磨损", "沁色"] as const;
export const MOUNT_POSITIONS = ["主石位", "围石A组", "围石B组"] as const;

export type Finding = (typeof FINDINGS)[number];

export interface Stone {
  id: string; // 宝石编号
  kind: string; // 种类
  shape: string; // 形状
  carat: number; // 克拉重量
  size: string; // 尺寸，如 6.0×4.0mm
  clarity: string; // 净度
  color: string; // 颜色
  cut: string; // 切工
  batchId: string; // 分拣批次
  orderId: string | null; // 所属客户订单
  mountPosition: string | null; // 当前镶嵌位
  status: StoneStatus;
  defectNote: string; // 缺陷备注
}

export interface CustomerOrder {
  id: string;
  customer: string;
  title: string; // 改款需求
  delivered: boolean;
  createdAt: string;
}

export interface SortBatch {
  id: string;
  name: string;
  createdAt: string;
}

export interface Inspection {
  done: boolean; // 是否已登记复检结论
  damaged: boolean; // true=有损伤（转待修），false=无损伤（恢复待镶）
  findings: Finding[]; // 爪痕 / 崩边 / 磨损 / 沁色
  note: string;
  inspectedAt: string | null;
}

export interface DismountLine {
  stoneId: string;
  inspection: Inspection;
}

export type DismountStatus = "未结" | "已结";

export interface DismountOrder {
  id: string; // 拆镶单号 CX-YYYYMMDD-NNN
  orderId: string; // 关联的客户改款订单
  reason: string; // 改款原因
  createdAt: string;
  status: DismountStatus;
  closedAt: string | null;
  lines: DismountLine[];
}

export interface AppData {
  stones: Stone[];
  orders: CustomerOrder[];
  batches: SortBatch[];
  dismounts: DismountOrder[];
  seq: { dismount: number };
}

export interface StoneFilter {
  shapes: string[]; // 形状筛选（订单清单与分拣批次共用）
  sizeKeyword: string; // 尺寸关键字，如 6 / 2.0mm
}

export const emptyFilter: StoneFilter = { shapes: [], sizeKeyword: "" };

/* ------------------------------------------------------------------ */
/* 返回结构                                                            */
/* ------------------------------------------------------------------ */

export interface RejectItem {
  stoneId: string;
  reason: string;
}

export type SubmitResult =
  | { ok: true; data: AppData; dismountId: string; message: string }
  | { ok: false; reasons: RejectItem[] };

export type ActionResult =
  | { ok: true; data: AppData; message: string }
  | { ok: false; message: string };

/* ------------------------------------------------------------------ */
/* 基础查询（纯函数）                                                   */
/* ------------------------------------------------------------------ */

export function emptyInspection(): Inspection {
  return { done: false, damaged: false, findings: [], note: "", inspectedAt: null };
}

/** 该宝石是否存在未结拆镶单（冻结依据） */
export function findOpenDismount(
  dismounts: DismountOrder[],
  stoneId: string
): DismountOrder | undefined {
  return dismounts.find(
    (d) => d.status === "未结" && d.lines.some((l) => l.stoneId === stoneId)
  );
}

export function isFrozen(data: AppData, stoneId: string): boolean {
  return Boolean(findOpenDismount(data.dismounts, stoneId));
}

/**
 * 拆镶选石资格校验。返回 null 表示可拆镶，否则返回不可拆原因。
 * 规则：仅「已镶嵌」且「订单未交付」、且无未结拆镶单的宝石可拆。
 */
export function eligibilityReason(
  stone: Stone,
  order: CustomerOrder | undefined,
  dismounts: DismountOrder[]
): string | null {
  const blocker = findOpenDismount(dismounts, stone.id);
  if (blocker) return `已有未结拆镶单 ${blocker.id}，拆镶冻结中`;
  if (!order) return "改款订单不存在";
  if (order.delivered) return `订单 ${order.id} 已交付`;
  if (stone.status === "已交付") return "宝石已交付";
  if (stone.status === "拆镶中") return "宝石拆镶冻结中";
  if (stone.status === "待修") return "宝石待修中，只读留档";
  if (stone.status !== "已镶嵌") return `当前状态「${stone.status}」，仅已镶嵌宝石可拆镶`;
  if (stone.orderId !== order.id)
    return `不属于本单（现挂 ${stone.orderId ?? "未配单"}）`;
  return null;
}

export interface DismountDraft {
  orderId: string;
  reason: string;
  stoneIds: string[];
}

/**
 * 提交前整单校验：任一宝石不合规即「整次拒绝」，
 * 由调用方保证不写入任何变更（原单与分拣状态不变）。
 */
export function validateSubmission(
  data: AppData,
  draft: DismountDraft
): RejectItem[] {
  const reasons: RejectItem[] = [];
  const order = data.orders.find((o) => o.id === draft.orderId);

  if (!draft.orderId) reasons.push({ stoneId: "—", reason: "未选择改款订单" });
  else if (!order) reasons.push({ stoneId: "—", reason: "改款订单不存在" });
  else if (order.delivered)
    reasons.push({ stoneId: "—", reason: `订单 ${order.id} 已交付，不可发起拆镶` });

  if (draft.stoneIds.length === 0)
    reasons.push({ stoneId: "—", reason: "未选择任何宝石" });

  for (const stoneId of new Set(draft.stoneIds)) {
    const stone = data.stones.find((s) => s.id === stoneId);
    if (!stone) {
      reasons.push({ stoneId, reason: "宝石记录不存在" });
      continue;
    }
    const reason = eligibilityReason(stone, order, data.dismounts);
    if (reason) reasons.push({ stoneId, reason });
  }
  return reasons;
}

/* ------------------------------------------------------------------ */
/* 拆镶闭环状态流转                                                    */
/* ------------------------------------------------------------------ */

function yyyymmdd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

/** 提交拆镶单：校验通过才落单，并把涉事宝石置为「拆镶中」冻结。 */
export function submitDismount(
  data: AppData,
  draft: DismountDraft,
  now: Date = new Date()
): SubmitResult {
  const reasons = validateSubmission(data, draft);
  if (reasons.length > 0) return { ok: false, reasons };

  const seq = data.seq.dismount + 1;
  const id = `CX-${yyyymmdd(now)}-${String(seq).padStart(3, "0")}`;
  const dismount: DismountOrder = {
    id,
    orderId: draft.orderId,
    reason: draft.reason.trim() || "客户改款",
    createdAt: now.toISOString(),
    status: "未结",
    closedAt: null,
    lines: draft.stoneIds.map((stoneId) => ({
      stoneId,
      inspection: emptyInspection(),
    })),
  };

  const idSet = new Set(draft.stoneIds);
  const next: AppData = {
    ...data,
    seq: { dismount: seq },
    dismounts: [dismount, ...data.dismounts],
    stones: data.stones.map((s) =>
      idSet.has(s.id) ? { ...s, status: "拆镶中" as StoneStatus } : s
    ),
  };
  return {
    ok: true,
    data: next,
    dismountId: id,
    message: `拆镶单 ${id} 已开立，${draft.stoneIds.length} 颗宝石拆镶期间冻结`,
  };
}

export interface InspectionInput {
  damaged: boolean;
  findings: Finding[];
  note: string;
}

/** 登记拆镶后复检结论（爪痕、崩边等）。未结单才允许登记/修改。 */
export function registerInspection(
  data: AppData,
  dismountId: string,
  stoneId: string,
  input: InspectionInput,
  now: Date = new Date()
): ActionResult {
  const d = data.dismounts.find((x) => x.id === dismountId);
  if (!d) return { ok: false, message: "拆镶单不存在" };
  if (d.status !== "未结") return { ok: false, message: "拆镶单已结，复检记录只读" };
  const line = d.lines.find((l) => l.stoneId === stoneId);
  if (!line) return { ok: false, message: "该宝石不在此拆镶单内" };

  const findings = input.damaged ? input.findings : [];
  const inspection: Inspection = {
    done: true,
    damaged: input.damaged,
    findings,
    note: input.note.trim(),
    inspectedAt: now.toISOString(),
  };
  const next: AppData = {
    ...data,
    dismounts: data.dismounts.map((x) =>
      x.id !== dismountId
        ? x
        : {
            ...x,
            lines: x.lines.map((l) =>
              l.stoneId === stoneId ? { ...l, inspection } : l
            ),
          }
    ),
  };
  return {
    ok: true,
    data: next,
    message: `${stoneId} 复检结论已登记：${input.damaged ? "有损伤，结单后转待修" : "无损伤，结单后恢复待镶"}`,
  };
}

/**
 * 结单：逐颗落地复检结论。
 * 有损伤 -> 待修（保留只读记录，仍挂原改款单）；
 * 无损伤 -> 恢复待镶（回分拣池，可被任意订单配石）。
 * 两种情况都拆除镶嵌位。
 */
export function closeDismount(
  data: AppData,
  dismountId: string,
  now: Date = new Date()
): ActionResult {
  const d = data.dismounts.find((x) => x.id === dismountId);
  if (!d) return { ok: false, message: "拆镶单不存在" };
  if (d.status !== "未结") return { ok: false, message: "拆镶单已结，记录只读" };
  const pending = d.lines.filter((l) => !l.inspection.done);
  if (pending.length > 0)
    return {
      ok: false,
      message: `尚有 ${pending.length} 颗宝石未登记复检结论，不能结单`,
    };

  const damagedIds = new Set(
    d.lines.filter((l) => l.inspection.damaged).map((l) => l.stoneId)
  );
  const lineIds = new Set(d.lines.map((l) => l.stoneId));

  const next: AppData = {
    ...data,
    stones: data.stones.map((s) => {
      if (!lineIds.has(s.id)) return s;
      const damaged = damagedIds.has(s.id);
      return {
        ...s,
        status: (damaged ? "待修" : "待镶") as StoneStatus,
        mountPosition: null,
        orderId: damaged ? s.orderId : null,
        defectNote:
          damaged && !s.defectNote
            ? `拆镶复检损伤（${dismountId}），转待修`
            : s.defectNote,
      };
    }),
    dismounts: data.dismounts.map((x) =>
      x.id === dismountId
        ? { ...x, status: "已结" as DismountStatus, closedAt: now.toISOString() }
        : x
    ),
  };

  const damaged = damagedIds.size;
  const safe = d.lines.length - damaged;
  return {
    ok: true,
    data: next,
    message: `拆镶单 ${dismountId} 已结：${damaged} 颗有损伤转待修（只读留档），${safe} 颗无损伤恢复待镶`,
  };
}

/* ------------------------------------------------------------------ */
/* 冻结期互斥：配石 / 改镶嵌位 / 缺陷备注                               */
/* ------------------------------------------------------------------ */

/** 待镶池配石到订单镶嵌位。冻结中、非待镶、已交付订单一律拒绝。 */
export function assignStone(
  data: AppData,
  stoneId: string,
  orderId: string,
  position: string,
  now: Date = new Date()
): ActionResult {
  void now;
  const stone = data.stones.find((s) => s.id === stoneId);
  if (!stone) return { ok: false, message: "宝石不存在" };
  const blocker = findOpenDismount(data.dismounts, stoneId);
  if (blocker)
    return { ok: false, message: `${stoneId} 拆镶冻结中（${blocker.id}），不能配石` };
  if (stone.status !== "待镶")
    return { ok: false, message: `${stoneId} 当前「${stone.status}」，仅待镶宝石可配石` };
  const order = data.orders.find((o) => o.id === orderId);
  if (!order) return { ok: false, message: "目标订单不存在" };
  if (order.delivered) return { ok: false, message: `订单 ${orderId} 已交付` };
  if (!position) return { ok: false, message: "未指定镶嵌位" };

  const next: AppData = {
    ...data,
    stones: data.stones.map((s) =>
      s.id === stoneId
        ? { ...s, status: "已镶嵌" as StoneStatus, orderId, mountPosition: position }
        : s
    ),
  };
  return { ok: true, data: next, message: `${stoneId} 已配至订单 ${orderId} · ${position}` };
}

/** 改镶嵌位：拆镶冻结期禁止。 */
export function changeMountPosition(
  data: AppData,
  stoneId: string,
  position: string
): ActionResult {
  const stone = data.stones.find((s) => s.id === stoneId);
  if (!stone) return { ok: false, message: "宝石不存在" };
  const blocker = findOpenDismount(data.dismounts, stoneId);
  if (blocker)
    return {
      ok: false,
      message: `${stoneId} 拆镶冻结中（${blocker.id}），禁止改镶嵌位`,
    };
  if (stone.status !== "已镶嵌")
    return { ok: false, message: `${stoneId} 非已镶嵌状态，不可改镶嵌位` };
  if (!position) return { ok: false, message: "镶嵌位不能为空" };

  const next: AppData = {
    ...data,
    stones: data.stones.map((s) =>
      s.id === stoneId ? { ...s, mountPosition: position } : s
    ),
  };
  return { ok: true, data: next, message: `${stoneId} 镶嵌位已改为 ${position}` };
}

/** 缺陷备注：冻结中 / 待修只读 / 已交付 锁定。 */
export function saveDefectNote(
  data: AppData,
  stoneId: string,
  note: string
): ActionResult {
  const stone = data.stones.find((s) => s.id === stoneId);
  if (!stone) return { ok: false, message: "宝石不存在" };
  const blocker = findOpenDismount(data.dismounts, stoneId);
  if (blocker)
    return { ok: false, message: `${stoneId} 拆镶冻结中，缺陷备注暂不可改` };
  if (stone.status === "待修")
    return { ok: false, message: `${stoneId} 已转待修，记录只读` };
  if (stone.status === "已交付")
    return { ok: false, message: `${stoneId} 已交付，记录锁定` };

  const next: AppData = {
    ...data,
    stones: data.stones.map((s) =>
      s.id === stoneId ? { ...s, defectNote: note.trim() } : s
    ),
  };
  return { ok: true, data: next, message: `${stoneId} 缺陷备注已保存` };
}

/* ------------------------------------------------------------------ */
/* 分拣：新增宝石入批（默认待镶）                                       */
/* ------------------------------------------------------------------ */

export interface NewStoneInput {
  id: string;
  kind: string;
  shape: string;
  carat: number;
  size: string;
  clarity: string;
  color: string;
  cut: string;
  batchId: string;
  defectNote: string;
}

export function addStone(data: AppData, input: NewStoneInput): ActionResult {
  if (!input.id.trim()) return { ok: false, message: "宝石编号必填" };
  if (!input.kind.trim()) return { ok: false, message: "种类必填" };
  if (!input.size.trim()) return { ok: false, message: "尺寸必填" };
  if (!(input.carat > 0)) return { ok: false, message: "克拉重量需大于 0" };
  if (!data.batches.some((b) => b.id === input.batchId))
    return { ok: false, message: "分拣批次不存在" };
  if (data.stones.some((s) => s.id === input.id.trim()))
    return { ok: false, message: `编号 ${input.id} 已存在` };

  const stone: Stone = {
    id: input.id.trim(),
    kind: input.kind.trim(),
    shape: input.shape,
    carat: input.carat,
    size: input.size.trim(),
    clarity: input.clarity.trim() || "未定级",
    color: input.color.trim() || "未分级",
    cut: input.cut.trim() || "未注明",
    batchId: input.batchId,
    orderId: null,
    mountPosition: null,
    status: "待镶",
    defectNote: input.defectNote.trim(),
  };
  return {
    ok: true,
    data: { ...data, stones: [...data.stones, stone] },
    message: `${stone.id} 已入批 ${input.batchId}，状态待镶`,
  };
}

/* ------------------------------------------------------------------ */
/* 共用筛选与指标                                                      */
/* ------------------------------------------------------------------ */

/** 订单清单、分拣批次与尺寸筛选共用同一份宝石数据。 */
export function filterStones(stones: Stone[], f: StoneFilter): Stone[] {
  const kw = f.sizeKeyword.trim().toLowerCase();
  return stones.filter((s) => {
    if (f.shapes.length > 0 && !f.shapes.includes(s.shape)) return false;
    if (kw && !`${s.id} ${s.size} ${s.kind}`.toLowerCase().includes(kw))
      return false;
    return true;
  });
}

export interface Metrics {
  batches: number;
  pending: number; // 待镶嵌
  frozen: number; // 拆镶冻结
  repair: number; // 待修
  defects: number; // 缺陷备注
  carats: number; // 总克拉
  eligible: number; // 可拆镶（已镶嵌且订单未交付且未冻结）
}

export function getMetrics(data: AppData): Metrics {
  return {
    batches: data.batches.length,
    pending: data.stones.filter((s) => s.status === "待镶").length,
    frozen: data.stones.filter((s) => s.status === "拆镶中").length,
    repair: data.stones.filter((s) => s.status === "待修").length,
    defects: data.stones.filter((s) => s.defectNote.trim() !== "").length,
    carats: Math.round(data.stones.reduce((sum, s) => sum + s.carat, 0) * 100) / 100,
    eligible: data.stones.filter((s) => {
      const order = data.orders.find((o) => o.id === s.orderId);
      return eligibilityReason(s, order, data.dismounts) === null;
    }).length,
  };
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(
    d.getHours()
  )}:${p(d.getMinutes())}`;
}
