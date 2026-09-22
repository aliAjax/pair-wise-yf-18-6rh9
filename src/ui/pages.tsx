// 珠宝分拣 · 客户改款拆镶闭环 —— 页面层
// 四个页签：工作台 / 订单清单 / 分拣批次 / 拆镶管理

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useStore } from "../state/store";
import {
  eligibilityReason,
  filterStones,
  findOpenDismount,
  formatDateTime,
  getMetrics,
  MOUNT_POSITIONS,
  SHAPES,
  FINDINGS,
  type Finding,
  type Stone,
} from "../domain/rules";

/* ------------------------------------------------------------------ */
/* 通用组件                                                            */
/* ------------------------------------------------------------------ */

const STATUS_COLOR: Record<Stone["status"], string> = {
  待镶: "#0f766e",
  已镶嵌: "#be123c",
  拆镶中: "#a855f7",
  待修: "#b45309",
  已交付: "#475569",
};

function StatusPill({ status }: { status: Stone["status"] }) {
  return (
    <span className="pill" style={{ background: `${STATUS_COLOR[status]}1a`, color: STATUS_COLOR[status] }}>
      {status}
    </span>
  );
}

function NoticeBar() {
  const { notice } = useStore();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!notice) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 5200);
    return () => clearTimeout(t);
  }, [notice]);

  if (!notice || !visible) return null;
  return (
    <div className={`notice ${notice.type}`} key={notice.key} role="status">
      <span>{notice.type === "success" ? "✓" : "!"}</span>
      <p>{notice.text}</p>
      <button className="notice-close" onClick={() => setVisible(false)} aria-label="关闭提示">
        ×
      </button>
    </div>
  );
}

/** 形状 + 尺寸筛选：订单清单与分拣批次共用。 */
function FilterBar({ total, shown }: { total: number; shown: number }) {
  const { filter, setFilter } = useStore();
  return (
    <div className="filter-bar">
      <div className="chips">
        {SHAPES.map((shape) => {
          const active = filter.shapes.includes(shape);
          return (
            <button
              key={shape}
              className={active ? "chip on" : "chip"}
              onClick={() =>
                setFilter({
                  shapes: active
                    ? filter.shapes.filter((s) => s !== shape)
                    : [...filter.shapes, shape],
                })
              }
            >
              {shape}
            </button>
          );
        })}
      </div>
      <input
        className="size-input"
        placeholder="尺寸关键字，如 6.0 或 2.0mm（订单清单 / 分拣批次共用）"
        value={filter.sizeKeyword}
        onChange={(e) => setFilter({ sizeKeyword: e.target.value })}
      />
      <small>
        命中 {shown} / {total} 颗
      </small>
      {(filter.shapes.length > 0 || filter.sizeKeyword.trim() !== "") && (
        <button className="link-btn" onClick={() => setFilter({ shapes: [], sizeKeyword: "" })}>
          清除筛选
        </button>
      )}
    </div>
  );
}

function LockTag({ data, stone }: { data: ReturnType<typeof useStore>["data"]; stone: Stone }) {
  const blocker = findOpenDismount(data.dismounts, stone.id);
  if (blocker)
    return (
      <span className="lock-tag" title={`拆镶冻结：${blocker.id}`}>
        🔒 {blocker.id} 冻结
      </span>
    );
  return null;
}

/* ------------------------------------------------------------------ */
/* 工作台                                                              */
/* ------------------------------------------------------------------ */

function Dashboard({ onTab }: { onTab: (t: string) => void }) {
  const { data, resetData } = useStore();
  const m = getMetrics(data);

  const cards: { label: string; value: number | string; hint: string }[] = [
    { label: "分拣批次", value: m.batches, hint: "在册批次总数" },
    { label: "待镶嵌", value: m.pending, hint: "分拣入池待配石" },
    { label: "拆镶冻结", value: m.frozen, hint: "未结拆镶单占用" },
    { label: "待修", value: m.repair, hint: "复检有损伤只读留档" },
    { label: "缺陷备注", value: m.defects, hint: "含缺陷/复检记录" },
    { label: "总克拉", value: m.carats, hint: "全部在册宝石合计" },
  ];

  const openDismounts = data.dismounts.filter((d) => d.status === "未结");

  return (
    <div className="page">
      <div className="metrics six">
        {cards.map((c) => (
          <article key={c.label}>
            <small>{c.label}</small>
            <strong>{c.value}</strong>
            <em>{c.hint}</em>
          </article>
        ))}
      </div>

      <section className="panel">
        <div className="heading">
          <div>
            <p>客户改款</p>
            <h2>拆镶闭环规则</h2>
          </div>
          <button className="link-btn danger" onClick={resetData}>
            恢复演示数据
          </button>
        </div>
        <ol className="rule-flow">
          <li>
            <b>① 发起拆镶</b>
            <span>仅「已镶嵌 + 订单未交付」的宝石可选；同颗已有未结拆镶单时整次拒绝，原单与分拣状态不变。</span>
          </li>
          <li>
            <b>② 拆镶冻结</b>
            <span>拆镶期间该石冻结，不能被其他订单配石，也不能改镶嵌位。</span>
          </li>
          <li>
            <b>③ 拆后复检</b>
            <span>逐颗登记爪痕、崩边、磨损、沁色等结论，全部复检完成才允许结单。</span>
          </li>
          <li>
            <b>④ 结单流转</b>
            <span>有损伤 → 转「待修」并保留只读记录；无损伤 → 恢复「待镶」回分拣池。</span>
          </li>
        </ol>
        <div className="dashboard-actions">
          <button className="primary" onClick={() => onTab("dismount")}>
            进入拆镶管理（{openDismounts.length} 单未结）
          </button>
          <button onClick={() => onTab("orders")}>查看订单清单</button>
          <button onClick={() => onTab("batches")}>查看分拣批次</button>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 镶嵌位置示意图                                                      */
/* ------------------------------------------------------------------ */

const RING_A = 78;
const RING_B = 126;

function ringDots(count: number, radius: number, startDeg: number) {
  return Array.from({ length: count }, (_, i) => {
    const deg = startDeg + (360 / count) * i;
    const rad = (deg * Math.PI) / 180;
    return { x: 150 + radius * Math.sin(rad), y: 150 - radius * Math.cos(rad) };
  });
}

function MountDiagram({ stones }: { stones: Stone[] }) {
  const center = stones.filter((s) => s.mountPosition === "主石位");
  const ringA = stones.filter((s) => s.mountPosition === "围石A组");
  const ringB = stones.filter((s) => s.mountPosition === "围石B组");
  const dotsA = ringDots(6, RING_A, 0);
  const dotsB = ringDots(8, RING_B, 22.5);

  const slot = (s: Stone | undefined) =>
    s ? { fill: STATUS_COLOR[s.status], title: `${s.id} · ${s.kind}` } : { fill: "#e2e8f0", title: "空位" };

  return (
    <div className="diagram">
      <svg viewBox="0 0 300 300" role="img" aria-label="镶嵌位置示意图">
        <circle cx="150" cy="150" r={RING_B + 16} fill="none" stroke="#d9e2ef" strokeDasharray="4 5" />
        <circle cx="150" cy="150" r={RING_A} fill="none" stroke="#d9e2ef" />
        {dotsB.map((p, i) => {
          const d = slot(ringB[i]);
          return <circle key={`b${i}`} cx={p.x} cy={p.y} r={9} fill={d.fill}><title>{d.title}</title></circle>;
        })}
        {dotsA.map((p, i) => {
          const d = slot(ringA[i]);
          return <circle key={`a${i}`} cx={p.x} cy={p.y} r={10} fill={d.fill}><title>{d.title}</title></circle>;
        })}
        <circle cx="150" cy="150" r="30" fill={slot(center[0]).fill} />
        <text x="150" y="147" textAnchor="middle" fontSize="11" fill="#64748b">主石位</text>
        <text x="150" y="160" textAnchor="middle" fontSize="10" fill="#94a3b8">{center[0]?.id ?? "空位"}</text>
      </svg>
      <div className="legend">
        <span><i style={{ background: STATUS_COLOR["已镶嵌"] }} />已镶嵌</span>
        <span><i style={{ background: STATUS_COLOR["拆镶中"] }} />拆镶冻结</span>
        <span><i style={{ background: STATUS_COLOR["已交付"] }} />已交付</span>
        <span><i style={{ background: "#e2e8f0" }} />空位</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 订单清单：按订单查看宝石 + 配石 + 改镶嵌位                           */
/* ------------------------------------------------------------------ */

function StoneRow({
  stone,
  extra,
  children,
}: {
  stone: Stone;
  extra?: ReactNode;
  children?: ReactNode;
}) {
  const { data } = useStore();
  const blocker = findOpenDismount(data.dismounts, stone.id);
  return (
    <div className={`stone-row ${blocker ? "frozen" : ""}`}>
      <div className="stone-main">
        <b>{stone.id}</b>
        <StatusPill status={stone.status} />
        <LockTag data={data} stone={stone} />
        <span className="stone-meta">
          {stone.kind} · {stone.shape} · {stone.size} · {stone.carat}ct
          {stone.mountPosition ? ` · ${stone.mountPosition}` : ""}
        </span>
        {stone.defectNote && <em className="defect">缺陷：{stone.defectNote}</em>}
        {extra}
      </div>
      {children && <div className="stone-actions">{children}</div>}
    </div>
  );
}

function OrdersPage() {
  const { data, filter, assign, move } = useStore();
  const [orderId, setOrderId] = useState(data.orders[0]?.id ?? "");
  const [assignStoneId, setAssignStoneId] = useState("");
  const [assignPos, setAssignPos] = useState<string>(MOUNT_POSITIONS[0]);

  useEffect(() => {
    if (!data.orders.some((o) => o.id === orderId)) setOrderId(data.orders[0]?.id ?? "");
  }, [data.orders, orderId]);

  const order = data.orders.find((o) => o.id === orderId);
  const filtered = useMemo(() => filterStones(data.stones, filter), [data.stones, filter]);

  const orderStones = filtered.filter((s) => s.orderId === orderId);
  const pool = data.stones.filter((s) => s.status === "待镶" && !findOpenDismount(data.dismounts, s.id));

  return (
    <div className="page two-col">
      <div className="panel">
        <div className="heading">
          <div>
            <p>按订单查看</p>
            <h2>订单清单</h2>
          </div>
        </div>
        <FilterBar total={data.stones.length} shown={filtered.length} />

        <div className="order-tabs">
          {data.orders.map((o) => (
            <button
              key={o.id}
              className={o.id === orderId ? "order-tab on" : "order-tab"}
              onClick={() => setOrderId(o.id)}
            >
              <b>{o.id}</b>
              <span>{o.customer} · {o.title}</span>
              {o.delivered && <em className="delivered">已交付</em>}
            </button>
          ))}
        </div>

        {order && (
          <>
            <div className="diagram-wrap">
              <MountDiagram stones={data.stones.filter((s) => s.orderId === order.id)} />
            </div>
            {order.delivered ? (
              <p className="muted">该订单已交付，宝石不可再拆镶或改镶嵌位。</p>
            ) : (
              <div className="assign-box">
                <h3>待镶池配石到本单</h3>
                <p className="muted small">拆镶冻结中的宝石不会出现在待镶池，无法配石。</p>
                <div className="assign-form">
                  <select value={assignStoneId} onChange={(e) => setAssignStoneId(e.target.value)}>
                    <option value="">选择待镶宝石（{pool.length} 颗）</option>
                    {pool.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.id} · {s.kind} · {s.shape} · {s.size} · {s.carat}ct
                      </option>
                    ))}
                  </select>
                  <select value={assignPos} onChange={(e) => setAssignPos(e.target.value)}>
                    {MOUNT_POSITIONS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  <button
                    className="primary"
                    disabled={!assignStoneId}
                    onClick={() => {
                      assign(assignStoneId, order.id, assignPos);
                      setAssignStoneId("");
                    }}
                  >
                    配石
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="panel">
        <div className="heading">
          <div>
            <p>{order?.id}</p>
            <h2>本单宝石（{orderStones.length}）</h2>
          </div>
        </div>
        <div className="stone-list">
          {orderStones.length === 0 && <p className="muted">当前筛选下本单暂无宝石。</p>}
          {orderStones.map((s) => {
            const blocker = findOpenDismount(data.dismounts, s.id);
            const canMove = s.status === "已镶嵌" && !blocker && !order?.delivered;
            return (
              <StoneRow key={s.id} stone={s}>
                {canMove && (
                  <select
                    title="改镶嵌位"
                    value={s.mountPosition ?? ""}
                    onChange={(e) => move(s.id, e.target.value)}
                  >
                    {MOUNT_POSITIONS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                )}
                {blocker && <span className="frozen-note">冻结：禁配石 / 禁改位</span>}
                {(s.status === "待修") && <span className="ro-note">待修：只读</span>}
                {s.status === "已交付" && <span className="ro-note">已交付：锁定</span>}
              </StoneRow>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 分拣批次：批次分组 + 新增宝石 + 缺陷备注                             */
/* ------------------------------------------------------------------ */

const EMPTY_FORM = {
  id: "", kind: "", shape: SHAPES[0], carat: "", size: "",
  clarity: "", color: "", cut: "", defectNote: "",
};

function BatchesPage() {
  const { data, filter, createStone, saveNote } = useStore();
  const [batchId, setBatchId] = useState(data.batches[0]?.id ?? "");
  const [form, setForm] = useState({ ...EMPTY_FORM, batchId });
  const [notes, setNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    if (data.batches.length && !data.batches.some((b) => b.id === batchId))
      setBatchId(data.batches[0].id);
  }, [data.batches, batchId]);

  const filtered = useMemo(() => filterStones(data.stones, filter), [data.stones, filter]);
  const activeBatch = data.batches.find((b) => b.id === batchId);
  const batchStones = filtered.filter((s) => s.batchId === batchId);

  const set = (k: keyof typeof EMPTY_FORM, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    const carat = parseFloat(form.carat);
    createStone({
      id: form.id, kind: form.kind, shape: form.shape,
      carat: Number.isNaN(carat) ? 0 : carat, size: form.size,
      clarity: form.clarity, color: form.color, cut: form.cut,
      batchId: activeBatch?.id ?? "", defectNote: form.defectNote,
    });
    setForm((f) => ({ ...EMPTY_FORM, shape: f.shape, batchId: f.batchId }));
  };

  return (
    <div className="page two-col">
      <div className="panel">
        <div className="heading">
          <div>
            <p>分拣批次</p>
            <h2>批次宝石</h2>
          </div>
        </div>
        <FilterBar total={data.stones.length} shown={filtered.length} />

        <div className="order-tabs">
          {data.batches.map((b) => (
            <button
              key={b.id}
              className={b.id === batchId ? "order-tab on" : "order-tab"}
              onClick={() => setBatchId(b.id)}
            >
              <b>{b.id}</b>
              <span>{b.name} · {formatDateTime(b.createdAt)}</span>
            </button>
          ))}
        </div>

        <div className="stone-list">
          {batchStones.length === 0 && <p className="muted">当前筛选下该批次暂无宝石。</p>}
          {batchStones.map((s) => {
            const blocker = findOpenDismount(data.dismounts, s.id);
            const locked = Boolean(blocker) || s.status === "待修" || s.status === "已交付";
            const draft = notes[s.id] ?? s.defectNote;
            return (
              <StoneRow key={s.id} stone={s}>
                <input
                  className="note-input"
                  value={draft}
                  disabled={locked}
                  placeholder={
                    blocker ? "拆镶冻结，备注暂不可改"
                    : s.status === "待修" ? "待修宝石，记录只读"
                    : s.status === "已交付" ? "已交付，记录锁定"
                    : "填写缺陷备注"
                  }
                  onChange={(e) => setNotes((n) => ({ ...n, [s.id]: e.target.value }))}
                />
                {!locked && (
                  <button
                    disabled={draft.trim() === s.defectNote}
                    onClick={() => saveNote(s.id, draft)}
                  >
                    保存备注
                  </button>
                )}
              </StoneRow>
            );
          })}
        </div>
      </div>

      <div className="panel">
        <div className="heading">
          <div>
            <p>新增分拣记录</p>
            <h2>宝石入批（默认待镶）</h2>
          </div>
        </div>
        <div className="field-grid">
          <label>
            <span>宝石编号</span>
            <input value={form.id} onChange={(e) => set("id", e.target.value)} placeholder="如 ST-2100" />
          </label>
          <label>
            <span>种类</span>
            <input value={form.kind} onChange={(e) => set("kind", e.target.value)} placeholder="如 蓝宝石" />
          </label>
          <label>
            <span>形状</span>
            <select value={form.shape} onChange={(e) => set("shape", e.target.value)}>
              {SHAPES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label>
            <span>克拉重量</span>
            <input value={form.carat} inputMode="decimal" onChange={(e) => set("carat", e.target.value)} placeholder="如 0.82" />
          </label>
          <label>
            <span>尺寸</span>
            <input value={form.size} onChange={(e) => set("size", e.target.value)} placeholder="如 5.5×4.0mm" />
          </label>
          <label>
            <span>净度</span>
            <input value={form.clarity} onChange={(e) => set("clarity", e.target.value)} placeholder="如 VS1" />
          </label>
          <label>
            <span>颜色</span>
            <input value={form.color} onChange={(e) => set("color", e.target.value)} placeholder="如 皇家蓝" />
          </label>
          <label>
            <span>切工</span>
            <input value={form.cut} onChange={(e) => set("cut", e.target.value)} placeholder="如 椭圆刻面" />
          </label>
          <label className="full">
            <span>缺陷备注</span>
            <input value={form.defectNote} onChange={(e) => set("defectNote", e.target.value)} placeholder="入批时可留空" />
          </label>
        </div>
        <button className="primary wide" onClick={submit}>
          入批 {activeBatch?.id} · 状态：待镶
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 拆镶管理                                                            */
/* ------------------------------------------------------------------ */

function InspectionForm({
  dismountId,
  stone,
  damaged,
  findings,
  note,
}: {
  dismountId: string;
  stone: Stone;
  damaged: boolean;
  findings: Finding[];
  note: string;
}) {
  const { inspect } = useStore();
  const [isDamaged, setIsDamaged] = useState(damaged);
  const [picked, setPicked] = useState<Finding[]>(findings);
  const [text, setText] = useState(note);

  const toggle = (f: Finding) =>
    setPicked((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));

  return (
    <div className="inspect-box">
      <div className="radio-row">
        <span>复检结论：</span>
        <label className="inline">
          <input type="radio" name={`dmg-${dismountId}-${stone.id}`} checked={!isDamaged} onChange={() => setIsDamaged(false)} />
          无损伤（恢复待镶）
        </label>
        <label className="inline">
          <input type="radio" name={`dmg-${dismountId}-${stone.id}`} checked={isDamaged} onChange={() => setIsDamaged(true)} />
          有损伤（转待修，只读留档）
        </label>
      </div>
      {isDamaged && (
        <div className="chips findings">
          {FINDINGS.map((f) => (
            <button
              key={f}
              className={picked.includes(f) ? "chip on danger" : "chip"}
              onClick={(e) => { e.preventDefault(); toggle(f); }}
            >
              {f}
            </button>
          ))}
        </div>
      )}
      <textarea
        rows={2}
        value={text}
        placeholder="复检描述：如右下亭棱崩边约 0.3mm"
        onChange={(e) => setText(e.target.value)}
      />
      <button
        className="primary"
        onClick={() => inspect(dismountId, stone.id, { damaged: isDamaged, findings: picked, note: text })}
      >
        登记复检结论
      </button>
    </div>
  );
}

function OpenDismountCard({ dismountId }: { dismountId: string }) {
  const { data, close } = useStore();
  const d = data.dismounts.find((x) => x.id === dismountId);
  if (!d) return null;
  const order = data.orders.find((o) => o.id === d.orderId);
  const pending = d.lines.filter((l) => !l.inspection.done).length;

  return (
    <article className="dismount-card open">
      <div className="dismount-head">
        <div>
          <b>{d.id}</b>
          <StatusPill status="拆镶中" />
        </div>
        <small>开立 {formatDateTime(d.createdAt)}</small>
      </div>
      <p className="muted">
        {order?.id} · {order?.customer} · {order?.title}
      </p>
      <p className="reason">改款原因：{d.reason}</p>

      <div className="dismount-lines">
        {d.lines.map((line) => {
          const s = data.stones.find((x) => x.id === line.stoneId);
          if (!s) return null;
          const ins = line.inspection;
          return (
            <div key={line.stoneId} className="dismount-line">
              <div className="line-summary">
                <b>{s.id}</b>
                <span>{s.kind} · {s.shape} · {s.size} · {s.carat}ct · 原{s.mountPosition ?? "镶嵌位"}</span>
                {ins.done ? (
                  <span className={ins.damaged ? "verdict bad" : "verdict ok"}>
                    已复检：{ins.damaged ? `有损伤（${ins.findings.join("、") || "未勾选类型"}）→ 待修` : "无损伤 → 恢复待镶"}
                  </span>
                ) : (
                  <span className="verdict pending">待复检</span>
                )}
              </div>
              <InspectionForm
                dismountId={d.id}
                stone={s}
                damaged={ins.damaged}
                findings={ins.findings}
                note={ins.note}
              />
            </div>
          );
        })}
      </div>

      <div className="close-row">
        <small>
          {pending > 0 ? `还有 ${pending} 颗未登记复检结论，结单按钮锁定` : "全部复检完成，可以结单"}
        </small>
        <button className="primary" disabled={pending > 0} onClick={() => close(d.id)}>
          结单并流转状态
        </button>
      </div>
    </article>
  );
}

function ClosedDismountCard({ dismountId }: { dismountId: string }) {
  const { data } = useStore();
  const d = data.dismounts.find((x) => x.id === dismountId);
  if (!d) return null;
  const order = data.orders.find((o) => o.id === d.orderId);

  return (
    <article className="dismount-card closed">
      <div className="dismount-head">
        <div>
          <b>{d.id}</b>
          <span className="pill gray">已结 · 只读</span>
        </div>
        <small>结单 {formatDateTime(d.closedAt)}</small>
      </div>
      <p className="muted">
        {order?.id} · {order?.customer} · {d.reason}
      </p>
      <div className="dismount-lines">
        {d.lines.map((line) => {
          const s = data.stones.find((x) => x.id === line.stoneId);
          const ins = line.inspection;
          return (
            <div key={line.stoneId} className="dismount-line readonly">
              <div className="line-summary">
                <b>{line.stoneId}</b>
                {s && <StatusPill status={s.status} />}
                <span className={ins.damaged ? "verdict bad" : "verdict ok"}>
                  {ins.damaged ? `有损伤：${ins.findings.join("、")}` : "无损伤"}
                </span>
                <small>复检于 {formatDateTime(ins.inspectedAt)}</small>
              </div>
              <p className="inspection-note">{ins.note || "（无备注）"}</p>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function NewDismountPanel() {
  const { data, submit } = useStore();
  const openOrders = data.orders.filter((o) => !o.delivered);
  const [orderId, setOrderId] = useState(openOrders[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [rejected, setRejected] = useState<{ stoneId: string; reason: string }[] | null>(null);

  const order = data.orders.find((o) => o.id === orderId);
  const candidates = data.stones.filter((s) => s.orderId === orderId);

  const toggle = (id: string) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const doSubmit = () => {
    // 整次拒绝由规则层判定：任一宝石不合规，不写入任何数据。
    const result = submit({ orderId, reason, stoneIds: picked });
    if (!result.ok) {
      setRejected(result.reasons);
    } else {
      setRejected(null);
      setPicked([]);
      setReason("");
    }
  };

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>客户改款</p>
          <h2>发起拆镶</h2>
        </div>
      </div>

      <div className="new-dismount-form">
        <label>
          <span>改款订单（已交付订单不可发起）</span>
          <select value={orderId} onChange={(e) => { setOrderId(e.target.value); setPicked([]); setRejected(null); }}>
            {data.orders.map((o) => (
              <option key={o.id} value={o.id} disabled={o.delivered}>
                {o.id} · {o.customer} · {o.title}{o.delivered ? "（已交付）" : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>改款原因</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="如 围镶改吊坠，需拆主石及围石" />
        </label>
      </div>

      <h3>选择拆镶宝石</h3>
      <p className="muted small">
        规则：仅「已镶嵌且未交付」可拆；同颗已有未结拆镶单时整次拒绝，原单与分拣状态不变。
        拆镶期间该石冻结，不能配石、不能改镶嵌位。
      </p>

      <div className="candidate-list">
        {candidates.length === 0 && <p className="muted">该订单下暂无挂单宝石。</p>}
        {candidates.map((s) => {
          const why = eligibilityReason(s, order, data.dismounts);
          const checked = picked.includes(s.id);
          return (
            <label key={s.id} className={`candidate ${why ? "ineligible" : ""} ${checked ? "picked" : ""}`}>
              <input type="checkbox" checked={checked} onChange={() => toggle(s.id)} />
              <b>{s.id}</b>
              <StatusPill status={s.status} />
              <LockTag data={data} stone={s} />
              <span className="stone-meta">
                {s.kind} · {s.shape} · {s.size} · {s.carat}ct
                {s.mountPosition ? ` · ${s.mountPosition}` : ""}
              </span>
              {why ? <em className="deny-reason">{why}</em> : <em className="ok-reason">可拆镶</em>}
            </label>
          );
        })}
      </div>

      <div className="submit-row">
        <small>已选 {picked.length} 颗</small>
        <button className="primary" disabled={picked.length === 0} onClick={doSubmit}>
          提交拆镶单
        </button>
      </div>

      {rejected && (
        <div className="reject-box" role="alert">
          <h4>整次拒绝：未开立拆镶单，原单与分拣状态均未改变</h4>
          <ul>
            {rejected.map((r, i) => (
              <li key={`${r.stoneId}-${i}`}><b>{r.stoneId}</b>：{r.reason}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function DismountPage() {
  const { data } = useStore();
  const open = data.dismounts.filter((d) => d.status === "未结");
  const closed = data.dismounts.filter((d) => d.status === "已结");

  return (
    <div className="page dismount-page">
      <NewDismountPanel />

      <section className="panel">
        <div className="heading">
          <div>
            <p>冻结复检</p>
            <h2>未结拆镶单（{open.length}）</h2>
          </div>
        </div>
        {open.length === 0 && <p className="muted">当前没有未结拆镶单。</p>}
        <div className="dismount-grid">
          {open.map((d) => <OpenDismountCard key={d.id} dismountId={d.id} />)}
        </div>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>闭环留档</p>
            <h2>已结拆镶单（{closed.length} · 只读）</h2>
          </div>
        </div>
        <div className="dismount-grid">
          {closed.map((d) => <ClosedDismountCard key={d.id} dismountId={d.id} />)}
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 外壳与页签                                                          */
/* ------------------------------------------------------------------ */

const TABS = [
  { key: "dashboard", label: "工作台" },
  { key: "orders", label: "订单清单" },
  { key: "batches", label: "分拣批次" },
  { key: "dismount", label: "拆镶管理" },
];

function Shell() {
  const [tab, setTab] = useState("dashboard");

  return (
    <main className="app">
      <NoticeBar />
      <section className="hero">
        <p>hxyfront-62006 · 珠宝镶嵌工作室 · 数据仅存浏览器</p>
        <h1>珠宝镶嵌宝石分拣 · 客户改款拆镶闭环</h1>
        <span>
          已镶嵌且未交付方可拆镶；同颗已有未结拆镶单整次拒绝；拆镶期冻结禁配石禁改位；
          拆后复检：有损伤转待修只读留档，无损伤恢复待镶。订单清单、分拣批次与尺寸筛选共用数据，刷新保留，不接后端。
        </span>
      </section>

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? "tab on" : "tab"} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "dashboard" && <Dashboard onTab={setTab} />}
      {tab === "orders" && <OrdersPage />}
      {tab === "batches" && <BatchesPage />}
      {tab === "dismount" && <DismountPage />}
    </main>
  );
}

export default function Pages() {
  return <Shell />;
}
