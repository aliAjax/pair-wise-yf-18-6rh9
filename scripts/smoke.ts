// 拆镶闭环规则冒烟测试（不入主应用构建，脚本执行完即可删）
import {
  addStone,
  assignStone,
  changeMountPosition,
  closeDismount,
  registerInspection,
  saveDefectNote,
  submitDismount,
  type AppData,
} from "../src/domain/rules";

let pass = 0;
let fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error("✗ " + msg);
  }
}

function fresh(): AppData {
  return {
    batches: [{ id: "B1", name: "批1", createdAt: "2026-09-01T00:00:00.000Z" }],
    orders: [
      { id: "O1", customer: "甲", title: "改款", delivered: false, createdAt: "" },
      { id: "O2", customer: "乙", title: "已交付", delivered: true, createdAt: "" },
    ],
    stones: [
      {
        id: "S1", kind: "蓝宝", shape: "椭圆", carat: 1, size: "6x4",
        clarity: "VS", color: "蓝", cut: "刻面", batchId: "B1",
        orderId: "O1", mountPosition: "主石位", status: "已镶嵌", defectNote: "",
      },
      {
        id: "S2", kind: "钻石", shape: "圆形", carat: 0.1, size: "2mm",
        clarity: "VVS", color: "D", cut: "明亮", batchId: "B1",
        orderId: "O1", mountPosition: "围石A组", status: "已镶嵌", defectNote: "",
      },
      {
        id: "S3", kind: "钻石", shape: "圆形", carat: 0.1, size: "2mm",
        clarity: "VVS", color: "D", cut: "明亮", batchId: "B1",
        orderId: null, mountPosition: null, status: "待镶", defectNote: "",
      },
      {
        id: "S4", kind: "钻石", shape: "圆形", carat: 0.2, size: "3mm",
        clarity: "VS", color: "E", cut: "明亮", batchId: "B1",
        orderId: "O2", mountPosition: "主石位", status: "已镶嵌", defectNote: "",
      },
    ],
    dismounts: [],
    seq: { dismount: 0 },
  };
}

// 1. 已交付订单的石头不可拆：整次拒绝，且数据不变
{
  const d0 = fresh();
  const snap = JSON.stringify(d0);
  const r = submitDismount(d0, { orderId: "O2", reason: "x", stoneIds: ["S4"] });
  assert(!r.ok, "已交付订单石头应拒绝");
  assert(JSON.stringify(d0) === snap, "拒绝时原数据不变");
}

// 2. 混合提交（一颗合格 + 一颗待镶）整次拒绝
{
  const d0 = fresh();
  const snap = JSON.stringify(d0);
  const r = submitDismount(d0, { orderId: "O1", reason: "x", stoneIds: ["S1", "S3"] });
  assert(!r.ok, "待镶石头混入应整次拒绝");
  if (!r.ok) assert(r.reasons.some((x) => x.stoneId === "S3"), "拒绝原因应指向 S3");
  assert(JSON.stringify(d0) === snap, "整次拒绝时原单与分拣状态不变");
}

// 3. 正常开立：状态冻结；重复开立同颗被拒绝
{
  let d0 = fresh();
  const r = submitDismount(d0, { orderId: "O1", reason: "客户改款", stoneIds: ["S1", "S2"] });
  assert(r.ok, "合格提交应成功");
  if (r.ok) {
    d0 = r.data;
    assert(/^CX-\d{8}-001$/.test(d0.dismounts[0].id), "单号格式: " + d0.dismounts[0].id);
    assert(d0.stones.find((s) => s.id === "S1")!.status === "拆镶中", "S1 应冻结");
    assert(d0.stones.find((s) => s.id === "S2")!.status === "拆镶中", "S2 应冻结");

    // 同颗已有未结单 -> 整次拒绝
    const r2 = submitDismount(d0, { orderId: "O1", reason: "again", stoneIds: ["S1"] });
    assert(!r2.ok, "同颗未结拆镶单应拒绝");

    // 冻结期不能配石（S1 已镶所以也不是待镶；用 S3 配到其他单不受影响，先测冻结石本身）
    const mv = changeMountPosition(d0, "S1", "围石B组");
    assert(!mv.ok, "冻结中禁止改镶嵌位");

    // 待镶石 S3 配到 O1 可以（未冻结）
    const as = assignStone(d0, "S3", "O1", "围石B组");
    assert(as.ok, "非冻结待镶石可配石");
    if (as.ok) d0 = as.data;
  }

  // 4. 未全部复检不能结单
  const cr = closeDismount(d0, d0.dismounts[0].id);
  assert(!cr.ok, "未复检完不能结单");

  // 5. S1 有损伤(爪痕+崩边) -> 待修；S2 无损伤 -> 待镶
  const i1 = registerInspection(d0, d0.dismounts[0].id, "S1", {
    damaged: true, findings: ["爪痕", "崩边"], note: "爪痕崩边",
  });
  assert(i1.ok, "登记 S1 复检");
  if (i1.ok) d0 = i1.data;
  const i2 = registerInspection(d0, d0.dismounts[0].id, "S2", {
    damaged: false, findings: [], note: "完好",
  });
  assert(i2.ok, "登记 S2 复检");
  if (i2.ok) d0 = i2.data;

  // 已结后复检只读
  const cc = closeDismount(d0, d0.dismounts[0].id);
  assert(cc.ok, "全部复检后可结单");
  if (cc.ok) d0 = cc.data;
  const s1 = d0.stones.find((s) => s.id === "S1")!;
  const s2 = d0.stones.find((s) => s.id === "S2")!;
  assert(s1.status === "待修", "有损伤转待修");
  assert(s1.mountPosition === null && s1.orderId === "O1", "待修石拆位但仍挂原单");
  assert(s2.status === "待镶", "无损伤恢复待镶");
  assert(s2.orderId === null && s2.mountPosition === null, "恢复待镶石回池拆单拆位");
  assert(s1.defectNote.includes("CX-"), "待修石自动留缺陷记录");

  // 结单后记录只读
  const ri = registerInspection(d0, d0.dismounts[0].id, "S1", {
    damaged: false, findings: [], note: "x",
  });
  assert(!ri.ok, "已结单复检只读");
  const dn = saveDefectNote(d0, "S1", "篡改");
  assert(!dn.ok, "待修石缺陷备注只读");

  // 6. 闭环后 S2 可重新配石
  const as2 = assignStone(d0, "S2", "O1", "主石位");
  assert(as2.ok, "恢复待镶后可重新配石");

  // 7. 待修石也能再发新拆镶单吗？不能
  const r3 = submitDismount(d0, { orderId: "O1", reason: "x", stoneIds: ["S1"] });
  assert(!r3.ok, "待修石不可再拆镶");
}

// 8. 入批校验
{
  const d0 = fresh();
  assert(!addStone(d0, {
    id: "", kind: "k", shape: "圆形", carat: 1, size: "2mm",
    clarity: "", color: "", cut: "", batchId: "B1", defectNote: "",
  }).ok, "编号必填");
  const ok = addStone(d0, {
    id: "S9", kind: "钻", shape: "圆形", carat: 0.3, size: "4mm",
    clarity: "VS", color: "G", cut: "明亮", batchId: "B1", defectNote: "",
  });
  assert(ok.ok, "合法入批");
  if (ok.ok) {
    assert(ok.data.stones.at(-1)!.status === "待镶", "新石默认待镶");
    const dup = addStone(ok.data, {
      id: "S9", kind: "钻", shape: "圆形", carat: 0.3, size: "4mm",
      clarity: "VS", color: "G", cut: "明亮", batchId: "B1", defectNote: "",
    });
    assert(!dup.ok, "编号重复拒绝");
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
