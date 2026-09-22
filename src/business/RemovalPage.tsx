/**
 * 业务文件 3/3：客户改款拆镶闭环 —— 页面
 * 订单清单 / 分拣批次 / 拆镶闭环三个页签共用同一份筛选与数据。
 */

import { useMemo, useState } from "react";
import {
  type Gemstone,
  type InspectionFinding,
  type RemovalOrder,
  type StoneFilter,
  INSPECTION_FINDINGS,
  SHAPES,
  SIZE_BUCKETS,
  eligibleForRemoval,
  filterStones,
  hasOpenRemoval,
  isStoneFrozen,
} from "./removalRules";
import { actions, resetState, useAppState } from "./removalStore";

type TabKey = "orders" | "batches" | "removal";

const STATUS_CLASS: Record<string, string> = {
  待镶: "tag tag-wait",
  已镶嵌: "tag tag-set",
  待复检: "tag tag-check",
  待修: "tag tag-repair",
  已交付: "tag tag-done",
};

const REMOVAL_STATUS_CLASS: Record<string, string> = {
  待拆镶: "tag tag-check",
  待复检: "tag tag-warn",
  已完成: "tag tag-done",
};

function Workbench() {
  const s = useAppState();
  const [tab, setTab] = useState<TabKey>("orders");
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [filter, setFilter] = useState<StoneFilter>({
    shape: "全部",
    sizeLabel: "全部",
    keyword: "",
  });

  const filtered = useMemo(() => filterStones(s.stones, filter), [s.stones, filter]);
  const openRemovalCount = s.removals.filter((r) => r.status !== "已完成").length;
  const frozenCount = s.stones.filter((g) => isStoneFrozen(g, s)).length;
  const totalCarat = filtered.reduce((sum, g) => sum + g.carat, 0);
  const defectCount = filtered.filter((g) => g.defectNote.trim() !== "").length;

  const notify = (ok: boolean, message: string) => {
    setToast({ ok, text: message });
    window.setTimeout(() => setToast(null), 4200);
  };

  return (
    <section className="panel workbench-panel">
      <div className="heading">
        <div>
          <p>分拣工作台</p>
          <h2>订单清单 · 分拣批次 · 改款拆镶</h2>
        </div>
        <div className="heading-actions">
          <button onClick={() => resetState()} title="清空浏览器内数据并恢复演示数据">
            恢复演示数据
          </button>
        </div>
      </div>

      {/* 指标 */}
      <div className="metrics metrics-inline">
        <article>
          <small>分拣批次</small>
          <strong>{s.batches.length}</strong>
        </article>
        <article>
          <small>待镶嵌</small>
          <strong>{s.stones.filter((g) => g.status === "待镶").length}</strong>
        </article>
        <article>
          <small>拆镶冻结</small>
          <strong>{frozenCount}</strong>
        </article>
        <article>
          <small>缺陷备注 / 总克拉（当前筛选）</small>
          <strong>
            {defectCount} · {totalCarat.toFixed(2)}ct
          </strong>
        </article>
      </div>

      {/* 共用筛选：订单清单、分拣批次、尺寸筛选共用同一份数据 */}
      <SharedFilter filter={filter} onChange={setFilter} />

      {/* 页签 */}
      <nav className="tabs">
        <button className={tab === "orders" ? "active" : ""} onClick={() => setTab("orders")}>
          订单清单
        </button>
        <button className={tab === "batches" ? "active" : ""} onClick={() => setTab("batches")}>
          分拣批次
        </button>
        <button className={tab === "removal" ? "active" : ""} onClick={() => setTab("removal")}>
          改款拆镶{openRemovalCount > 0 ? `（${openRemovalCount} 单未结）` : ""}
        </button>
      </nav>

      {tab === "orders" && <OrdersTab stones={filtered} notify={notify} />}
      {tab === "batches" && <BatchesTab stones={filtered} />}
      {tab === "removal" && <RemovalTab notify={notify} />}

      {toast && (
        <div className={`toast ${toast.ok ? "toast-ok" : "toast-err"}`} onClick={() => setToast(null)}>
          {toast.ok ? "✓ " : "✕ "}
          {toast.text}
        </div>
      )}
      <p className="store-note">数据仅保存在本浏览器 localStorage，刷新保留，不连接后端。</p>
    </section>
  );
}

/* -------------------------------- 共用筛选 -------------------------------- */

function SharedFilter({
  filter,
  onChange,
}: {
  filter: StoneFilter;
  onChange: (f: StoneFilter) => void;
}) {
  return (
    <div className="shared-filter">
      <div className="chips">
        {(["全部", ...SHAPES] as const).map((shape) => (
          <button
            key={shape}
            className={filter.shape === shape ? "chip-on" : ""}
            onClick={() => onChange({ ...filter, shape })}
          >
            {shape}
          </button>
        ))}
      </div>
      <select
        value={filter.sizeLabel}
        onChange={(e) => onChange({ ...filter, sizeLabel: e.target.value })}
      >
        <option value="全部">全部尺寸</option>
        {SIZE_BUCKETS.map((b) => (
          <option key={b.label} value={b.label}>
            {b.label}
          </option>
        ))}
      </select>
      <input
        placeholder="搜宝石编号 / 种类 / 订单号 / 镶位"
        value={filter.keyword}
        onChange={(e) => onChange({ ...filter, keyword: e.target.value })}
      />
    </div>
  );
}

/* -------------------------------- 宝石行 -------------------------------- */

function StoneRow({
  stone,
  notify,
  compact,
}: {
  stone: Gemstone;
  notify: (ok: boolean, msg: string) => void;
  compact?: boolean;
}) {
  const s = useAppState();
  const frozen = isStoneFrozen(stone, s);
  const order = s.orders.find((o) => o.id === stone.orderId) ?? null;
  const deliveredOrder = order?.delivered ?? false;

  const assign = () => {
    const undelivered = s.orders.filter((o) => !o.delivered);
    const list = undelivered.map((o, i) => `${i + 1}. ${o.id} ${o.customer} ${o.item}`).join("\n");
    const answer = window.prompt(`配石到订单（输入序号）：\n${list}`, "1");
    if (answer === null) return;
    const idx = Number(answer.trim()) - 1;
    const target = undelivered[idx];
    if (!target) {
      notify(false, "未选择有效订单");
      return;
    }
    const r = actions.assignStone(stone.id, target.id);
    notify(r.ok, r.message);
  };

  const reposition = () => {
    const answer = window.prompt(`修改 ${stone.code} 的镶嵌位：`, stone.position);
    if (answer === null) return;
    const r = actions.repositionStone(stone.id, answer);
    notify(r.ok, r.message);
  };

  const lockReason =
    stone.status === "待修"
      ? "待修留档只读，不可操作"
      : stone.removalId && hasOpenRemoval(s, stone.id)
        ? `拆镶冻结中（${stone.removalId}），不得配石或改镶嵌位`
        : "";

  return (
    <div className={`stone-row ${compact ? "compact" : ""}`}>
      <div className="stone-main">
        <b>{stone.code}</b>
        <span className="stone-sub">
          {stone.kind} · {stone.shape} · {stone.carat}ct · {stone.mm}mm
        </span>
        {stone.defectNote && <span className="defect">⚠ {stone.defectNote}</span>}
      </div>
      <span className={STATUS_CLASS[stone.status]}>{stone.status}</span>
      <span className="stone-order">
        {stone.orderId ? `${stone.orderId}${order ? ` · ${order.customer}` : ""}` : "未配订单"}
      </span>
      <span className="stone-pos" title={stone.positionSnapshot ? `原镶位：${stone.positionSnapshot}` : undefined}>
        {stone.position}
      </span>
      <span className="stone-actions">
        {stone.status === "待镶" && (
          <button disabled={frozen} title={frozen ? lockReason : "配石到未交付订单"} onClick={assign}>
            配石
          </button>
        )}
        {stone.status === "已镶嵌" && (
          <button
            disabled={frozen || deliveredOrder}
            title={frozen ? lockReason : deliveredOrder ? "订单已交付" : "修改镶嵌位置"}
            onClick={reposition}
          >
            改镶嵌位
          </button>
        )}
        {(frozen || stone.status === "待复检" || stone.status === "待修") && (
          <span className="lock-hint">🔒 {stone.status === "待修" ? "待修只读" : "拆镶冻结"}</span>
        )}
      </span>
    </div>
  );
}

/* -------------------------------- 订单清单 -------------------------------- */

function OrdersTab({
  stones,
  notify,
}: {
  stones: Gemstone[];
  notify: (ok: boolean, msg: string) => void;
}) {
  const s = useAppState();
  const groups = useMemo(() => {
    const map = new Map<string, Gemstone[]>();
    for (const g of stones) {
      const key = g.orderId ?? "__none__";
      const arr = map.get(key) ?? [];
      arr.push(g);
      map.set(key, arr);
    }
    const ordered = s.orders
      .filter((o) => map.has(o.id))
      .sort((a, b) => Number(a.delivered) - Number(b.delivered));
    return { ordered, map, none: map.get("__none__") ?? [] };
  }, [stones, s.orders]);

  return (
    <div className="tab-body">
      {groups.ordered.map((order) => {
        const openRemoval = s.removals.some((r) => r.orderId === order.id && r.status !== "已完成");
        return (
          <article key={order.id} className="order-card">
            <div className="order-head">
              <div>
                <h3>
                  {order.id} · {order.customer}
                  <span className="order-item">{order.item}</span>
                </h3>
              </div>
              <div className="order-head-right">
                {openRemoval && <span className="tag tag-warn">有未结拆镶单</span>}
                {order.delivered ? (
                  <span className="tag tag-done">已交付</span>
                ) : (
                  <button
                    disabled={openRemoval}
                    title={openRemoval ? "有未结拆镶单，不能交付" : "整单交付"}
                    onClick={() => {
                      const r = actions.deliverOrder(order.id);
                      notify(r.ok, r.message);
                    }}
                  >
                    交付订单
                  </button>
                )}
              </div>
            </div>
            <div className="stone-list">
              {groups.map.get(order.id)!.map((g) => (
                <StoneRow key={g.id} stone={g} notify={notify} />
              ))}
            </div>
          </article>
        );
      })}
      {groups.none.length > 0 && (
        <article className="order-card stock-card">
          <div className="order-head">
            <h3>待配石库存</h3>
          </div>
          <div className="stone-list">
            {groups.none.map((g) => (
              <StoneRow key={g.id} stone={g} notify={notify} />
            ))}
          </div>
        </article>
      )}
      {stones.length === 0 && <p className="empty">当前筛选条件下没有宝石。</p>}
    </div>
  );
}

/* -------------------------------- 分拣批次 -------------------------------- */

function BatchesTab({ stones }: { stones: Gemstone[] }) {
  const s = useAppState();
  return (
    <div className="tab-body">
      {s.batches.map((batch) => {
        const list = stones.filter((g) => g.batchId === batch.id);
        const carat = list.reduce((sum, g) => sum + g.carat, 0);
        return (
          <article key={batch.id} className="batch-card">
            <div className="order-head">
              <div>
                <h3>
                  {batch.id} · {batch.name}
                </h3>
                <span className="stone-sub">建批 {batch.createdAt}</span>
              </div>
              <span className="batch-stat">
                {list.length} 颗 · {carat.toFixed(2)}ct
              </span>
            </div>
            <div className="stone-list">
              {list.map((g) => (
                <div key={g.id} className="stone-row compact">
                  <div className="stone-main">
                    <b>{g.code}</b>
                    <span className="stone-sub">
                      {g.kind} · {g.shape} · {g.carat}ct · {g.mm}mm
                    </span>
                  </div>
                  <span className={STATUS_CLASS[g.status]}>{g.status}</span>
                  <span className="stone-order">{g.orderId ?? "未配订单"}</span>
                  <span className="stone-pos">{g.position}</span>
                  <span className="stone-actions">
                    {isStoneFrozen(g, s) && <span className="lock-hint">🔒 冻结</span>}
                  </span>
                </div>
              ))}
              {list.length === 0 && <span className="empty">该批次在当前筛选下无宝石。</span>}
            </div>
          </article>
        );
      })}
    </div>
  );
}

/* ------------------------------- 改款拆镶闭环 ------------------------------- */

function RemovalTab({ notify }: { notify: (ok: boolean, msg: string) => void }) {
  return (
    <div className="tab-body">
      <NewRemovalForm notify={notify} />
      <div className="removal-list">
        <h3>拆镶单流水</h3>
        <RemovalList notify={notify} />
      </div>
    </div>
  );
}

function NewRemovalForm({ notify }: { notify: (ok: boolean, msg: string) => void }) {
  const s = useAppState();
  const undelivered = s.orders.filter((o) => !o.delivered);
  const [orderId, setOrderId] = useState(undelivered[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const candidates = s.stones.filter((g) => g.orderId === orderId);
  const eligible = candidates.filter((g) => eligibleForRemoval(g, s));

  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  const submit = () => {
    const ids = eligible.filter((g) => picked.has(g.id)).map((g) => g.id);
    const r = actions.createRemoval(orderId, reason, ids);
    notify(r.ok, r.message);
    if (r.ok) {
      setPicked(new Set());
      setReason("");
    }
    // r.ok === false 即整次拒绝：原单与分拣状态不变，选择保留以便调整
  };

  return (
    <article className="removal-form card-pad">
      <h3>登记客户改款拆镶</h3>
      <p className="rule-note">
        只能选「已镶嵌且订单未交付」的宝石；同颗宝石已有未结拆镶单时整次拒绝。拆镶期间该石冻结，不得配石或改镶嵌位。
      </p>
      <div className="form-row">
        <label>
          <span>改款订单</span>
          <select
            value={orderId}
            onChange={(e) => {
              setOrderId(e.target.value);
              setPicked(new Set());
            }}
          >
            {undelivered.map((o) => (
              <option key={o.id} value={o.id}>
                {o.id} · {o.customer} · {o.item}
              </option>
            ))}
          </select>
        </label>
        <label className="reason-field">
          <span>改款说明</span>
          <input
            placeholder="如：主石改款为牛头镶"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
      </div>
      <div className="pick-list">
        {candidates.length === 0 && <span className="empty">该订单下没有宝石。</span>}
        {candidates.map((g) => {
          const can = eligibleForRemoval(g, s);
          const why = !can
            ? g.status !== "已镶嵌"
              ? `非已镶嵌（${g.status}）`
              : isStoneFrozen(g, s)
                ? `拆镶冻结中（${g.removalId ?? "待修"}）`
                : "不可拆镶"
            : "";
          return (
            <label key={g.id} className={`pick-item ${can ? "" : "pick-disabled"}`}>
              <input
                type="checkbox"
                disabled={!can}
                checked={picked.has(g.id)}
                onChange={() => toggle(g.id)}
              />
              <b>{g.code}</b>
              <span className="stone-sub">
                {g.kind} · {g.shape} · {g.carat}ct · {g.position}
              </span>
              {!can && <em className="pick-reason">{why}</em>}
            </label>
          );
        })}
      </div>
      <button
        className="primary"
        disabled={!orderId || picked.size === 0}
        onClick={submit}
      >
        提交拆镶单{eligible.length ? "" : "（无可选宝石）"}
      </button>
    </article>
  );
}

function RemovalList({ notify }: { notify: (ok: boolean, msg: string) => void }) {
  const s = useAppState();
  if (s.removals.length === 0) {
    return <p className="empty">尚无拆镶单。</p>;
  }
  return (
    <div className="removal-cards">
      {s.removals.map((r) => (
        <RemovalCard key={r.id} removal={r} notify={notify} />
      ))}
    </div>
  );
}

function RemovalCard({
  removal,
  notify,
}: {
  removal: RemovalOrder;
  notify: (ok: boolean, msg: string) => void;
}) {
  const s = useAppState();
  const inspectedCount = removal.items.filter((i) => i.inspected).length;

  return (
    <article className="removal-card card-pad">
      <div className="order-head">
        <div>
          <h3>
            {removal.id} · {removal.orderId} · {removal.customer}
          </h3>
          <span className="stone-sub">
            {new Date(removal.createdAt).toLocaleString("zh-CN")} · 改款：{removal.reason}
          </span>
        </div>
        <div className="order-head-right">
          <span className={REMOVAL_STATUS_CLASS[removal.status]}>
            {removal.status}
            {removal.status === "待复检" ? ` ${inspectedCount}/${removal.items.length}` : ""}
          </span>
          {removal.status === "待拆镶" && (
            <button
              className="primary"
              onClick={() => {
                const r = actions.confirmRemoved(removal.id);
                notify(r.ok, r.message);
              }}
            >
              确认拆下
            </button>
          )}
        </div>
      </div>

      <div className="removal-items">
        {removal.items.map((item) => {
          const stone = s.stones.find((g) => g.id === item.stoneId);
          return (
            <div key={item.stoneId} className="removal-item">
              <div className="removal-item-head">
                <b>{stone?.code ?? item.stoneId}</b>
                <span className="stone-sub">
                  {stone ? `${stone.kind} · ${stone.carat}ct · ` : ""}原镶位：{item.positionSnapshot}
                </span>
                {stone && <span className={STATUS_CLASS[stone.status]}>{stone.status}</span>}
              </div>
              {removal.status === "待复检" && !item.inspected && (
                <InspectionForm
                  findings={[]}
                  note=""
                  onSubmit={(findings, note) => {
                    const r = actions.submitInspection(removal.id, item.stoneId, findings, note);
                    notify(r.ok, r.message);
                  }}
                />
              )}
              {item.inspected && (
                <div className="inspect-result readonly">
                  <span>复检结论：{item.findings.join("、")}</span>
                  {item.inspectNote && <span>备注：{item.inspectNote}</span>}
                  <em>只读记录，不可修改</em>
                </div>
              )}
              {removal.status === "待拆镶" && (
                <div className="inspect-result">
                  <span>等待物理拆下，拆镶期间冻结配石与镶嵌位变更。</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </article>
  );
}

function InspectionForm({
  findings,
  note,
  onSubmit,
}: {
  findings: InspectionFinding[];
  note: string;
  onSubmit: (findings: InspectionFinding[], note: string) => void;
}) {
  const [picked, setPicked] = useState<Set<InspectionFinding>>(new Set(findings));
  const [text, setText] = useState(note);

  const toggle = (f: InspectionFinding) => {
    const next = new Set(picked);
    if (f === "无损伤") {
      // 无损伤与损伤项互斥
      setPicked(new Set(next.has("无损伤") ? [] : ["无损伤"]));
      return;
    }
    next.delete("无损伤");
    if (next.has(f)) next.delete(f);
    else next.add(f);
    setPicked(next);
  };

  const damaged = [...picked].some((f) => f !== "无损伤");
  const canSubmit = picked.size > 0;

  return (
    <div className="inspect-form">
      <div className="chips">
        {INSPECTION_FINDINGS.map((f) => (
          <button
            key={f}
            type="button"
            className={picked.has(f) ? "chip-on" : ""}
            onClick={() => toggle(f)}
          >
            {f}
          </button>
        ))}
      </div>
      <input
        placeholder="复检备注（可选）"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button
        className="primary"
        disabled={!canSubmit}
        title={canSubmit ? "" : "请选择复检结论"}
        onClick={() => onSubmit([...picked], text)}
      >
        登记结论：{damaged ? "有损伤→待修留档" : "无损伤→恢复待镶"}
      </button>
    </div>
  );
}

export default function App() {
  return <Workbench />;
}
