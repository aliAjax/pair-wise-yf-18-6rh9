// 珠宝分拣 · 客户改款拆镶闭环 —— 共享数据层
// 订单清单、分拣批次与尺寸筛选共用同一份数据；只存浏览器（localStorage），
// 刷新保留，不接任何后端。

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  addStone,
  assignStone,
  changeMountPosition,
  closeDismount,
  FILTER_KEY,
  registerInspection,
  saveDefectNote,
  STORAGE_KEY,
  submitDismount,
  type ActionResult,
  type AppData,
  type DismountDraft,
  type InspectionInput,
  type NewStoneInput,
  type StoneFilter,
  type SubmitResult,
  emptyFilter,
} from "../domain/rules";

/* ------------------------------------------------------------------ */
/* 种子数据：覆盖 待镶 / 已镶嵌 / 拆镶中 / 待修 / 已交付 全状态          */
/* ------------------------------------------------------------------ */

function seedData(): AppData {
  const batches = [
    { id: "B-0912", name: "9月12日分拣批", createdAt: "2026-09-12T09:20:00.000Z" },
    { id: "B-0918", name: "9月18日分拣批", createdAt: "2026-09-18T09:05:00.000Z" },
  ];

  const orders = [
    {
      id: "OD-3301",
      customer: "陈女士",
      title: "旧款戒指改款为围镶吊坠",
      delivered: false,
      createdAt: "2026-09-15T03:10:00.000Z",
    },
    {
      id: "OD-3302",
      customer: "林先生",
      title: "蓝宝石手链改戒指",
      delivered: false,
      createdAt: "2026-09-16T06:40:00.000Z",
    },
    {
      id: "OD-3280",
      customer: "周女士",
      title: "原爪镶改包镶（已交付）",
      delivered: true,
      createdAt: "2026-08-28T02:00:00.000Z",
    },
  ];

  const stones: AppData["stones"] = [
    {
      id: "ST-2048", kind: "蓝宝石", shape: "椭圆", carat: 1.21, size: "6.0×4.0mm",
      clarity: "VS", color: "皇家蓝", cut: "椭圆刻面", batchId: "B-0912",
      orderId: "OD-3301", mountPosition: "主石位", status: "已镶嵌",
      defectNote: "亭部轻微色带",
    },
    {
      id: "ST-2061", kind: "钻石", shape: "圆形", carat: 0.08, size: "2.0mm",
      clarity: "VVS1", color: "D", cut: "明亮式", batchId: "B-0912",
      orderId: "OD-3301", mountPosition: "围石A组", status: "已镶嵌",
      defectNote: "",
    },
    {
      id: "ST-2062", kind: "钻石", shape: "圆形", carat: 0.08, size: "2.0mm",
      clarity: "VVS2", color: "E", cut: "明亮式", batchId: "B-0912",
      orderId: "OD-3301", mountPosition: "围石A组", status: "已镶嵌",
      defectNote: "",
    },
    {
      id: "ST-2070", kind: "红宝石", shape: "椭圆", carat: 0.62, size: "5.0×3.5mm",
      clarity: "SI", color: "鸽血红", cut: "椭圆刻面", batchId: "B-0912",
      orderId: "OD-3302", mountPosition: "主石位", status: "已镶嵌",
      defectNote: "台面有一处棉絮",
    },
    {
      id: "ST-2071", kind: "钻石", shape: "圆形", carat: 0.05, size: "1.5mm",
      clarity: "VS2", color: "F", cut: "明亮式", batchId: "B-0912",
      orderId: "OD-3302", mountPosition: "围石B组", status: "已镶嵌",
      defectNote: "",
    },
    {
      id: "ST-2080", kind: "祖母绿", shape: "祖母绿切", carat: 0.91, size: "6.5×4.5mm",
      clarity: "SI1", color: "Muzo绿", cut: "祖母绿式", batchId: "B-0918",
      orderId: null, mountPosition: null, status: "待镶",
      defectNote: "内含物明显，已与客户确认",
    },
    {
      id: "ST-2081", kind: "钻石", shape: "圆形", carat: 0.12, size: "3.0mm",
      clarity: "VS1", color: "G", cut: "明亮式", batchId: "B-0918",
      orderId: null, mountPosition: null, status: "待镶", defectNote: "",
    },
    {
      id: "ST-2082", kind: "蓝宝石", shape: "梨形", carat: 0.44, size: "5.0×3.0mm",
      clarity: "VS2", color: "矢车菊蓝", cut: "梨形刻面", batchId: "B-0918",
      orderId: null, mountPosition: null, status: "待镶",
      defectNote: "尖端需加厚镶口",
    },
    {
      id: "ST-2083", kind: "钻石", shape: "圆形", carat: 0.08, size: "2.0mm",
      clarity: "SI1", color: "H", cut: "明亮式", batchId: "B-0918",
      orderId: null, mountPosition: null, status: "待镶", defectNote: "",
    },
    // 拆镶冻结中：未结拆镶单 CX-20260920-001
    {
      id: "ST-2055", kind: "蓝宝石", shape: "椭圆", carat: 1.05, size: "5.8×3.9mm",
      clarity: "VS2", color: "矢车菊蓝", cut: "椭圆刻面", batchId: "B-0912",
      orderId: "OD-3301", mountPosition: "围石B组", status: "拆镶中",
      defectNote: "",
    },
    // 已结拆镶单里复检有损伤 -> 待修，只读留档
    {
      id: "ST-2099", kind: "祖母绿", shape: "祖母绿切", carat: 0.78, size: "6.0×4.0mm",
      clarity: "SI2", color: "翠绿", cut: "祖母绿式", batchId: "B-0912",
      orderId: "OD-3301", mountPosition: null, status: "待修",
      defectNote: "拆镶复检发现崩边（CX-20260916-000），转待修",
    },
    // 已交付：终态，拆镶单不可选
    {
      id: "ST-2010", kind: "钻石", shape: "圆形", carat: 0.3, size: "4.2mm",
      clarity: "VVS2", color: "E", cut: "明亮式", batchId: "B-0912",
      orderId: "OD-3280", mountPosition: "主石位", status: "已交付",
      defectNote: "",
    },
  ];

  const dismounts: AppData["dismounts"] = [
    {
      id: "CX-20260920-001",
      orderId: "OD-3301",
      reason: "客户改款：围镶改吊坠，围石B组需拆",
      createdAt: "2026-09-20T02:30:00.000Z",
      status: "未结",
      closedAt: null,
      lines: [
        {
          stoneId: "ST-2055",
          inspection: {
            done: false, damaged: false, findings: [], note: "", inspectedAt: null,
          },
        },
      ],
    },
    {
      id: "CX-20260916-000",
      orderId: "OD-3301",
      reason: "旧托过宽，祖母绿改位",
      createdAt: "2026-09-16T07:10:00.000Z",
      status: "已结",
      closedAt: "2026-09-16T09:40:00.000Z",
      lines: [
        {
          stoneId: "ST-2099",
          inspection: {
            done: true,
            damaged: true,
            findings: ["崩边"],
            note: "右下亭棱崩边约 0.3mm，转待修，维修方案待客户确认",
            inspectedAt: "2026-09-16T09:12:00.000Z",
          },
        },
      ],
    },
  ];

  return { stones, orders, batches, dismounts, seq: { dismount: 1 } };
}

/* ------------------------------------------------------------------ */
/* localStorage 读写：只存浏览器，刷新保留                              */
/* ------------------------------------------------------------------ */

function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppData;
      if (parsed.stones && parsed.orders && parsed.batches && parsed.dismounts)
        return parsed;
    }
  } catch {
    /* 数据损坏时回退到种子数据 */
  }
  return seedData();
}

function loadFilter(): StoneFilter {
  try {
    const raw = localStorage.getItem(FILTER_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoneFilter>;
      return {
        shapes: Array.isArray(parsed.shapes) ? parsed.shapes : [],
        sizeKeyword: typeof parsed.sizeKeyword === "string" ? parsed.sizeKeyword : "",
      };
    }
  } catch {
    /* ignore */
  }
  return emptyFilter;
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

export interface Notice {
  type: "success" | "error";
  text: string;
  key: number;
}

interface StoreValue {
  data: AppData;
  filter: StoneFilter;
  notice: Notice | null;
  setFilter: (patch: Partial<StoneFilter>) => void;
  resetData: () => void;
  submit: (draft: DismountDraft) => SubmitResult;
  inspect: (dismountId: string, stoneId: string, input: InspectionInput) => void;
  close: (dismountId: string) => void;
  assign: (stoneId: string, orderId: string, position: string) => void;
  move: (stoneId: string, position: string) => void;
  saveNote: (stoneId: string, note: string) => void;
  createStone: (input: NewStoneInput) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(loadData);
  const [filter, setFilterState] = useState<StoneFilter>(loadFilter);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* 存储满或被禁用时静默 */
    }
  }, [data]);

  useEffect(() => {
    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify(filter));
    } catch {
      /* ignore */
    }
  }, [filter]);

  const flash = useCallback((result: ActionResult | SubmitResult) => {
    setNotice({
      type: result.ok ? "success" : "error",
      text: result.ok
        ? "message" in result
          ? result.message
          : ""
        : "reasons" in result
        ? result.reasons.map((r) => `${r.stoneId}：${r.reason}`).join("；")
        : result.message,
      key: Date.now(),
    });
  }, []);

  const setFilter = useCallback((patch: Partial<StoneFilter>) => {
    setFilterState((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetData = useCallback(() => {
    setData(seedData());
    setFilterState(emptyFilter);
    setNotice({
      type: "success",
      text: "已恢复内置演示数据，浏览器存储已重置",
      key: Date.now(),
    });
  }, []);

  const submit = useCallback(
    (draft: DismountDraft): SubmitResult => {
      const result = submitDismount(data, draft);
      if (result.ok) setData(result.data);
      flash(result);
      return result;
    },
    [data, flash]
  );

  const runAction = useCallback(
    (result: ActionResult) => {
      if (result.ok) setData(result.data);
      flash(result);
    },
    [flash]
  );

  const inspect = useCallback(
    (dismountId: string, stoneId: string, input: InspectionInput) =>
      runAction(registerInspection(data, dismountId, stoneId, input)),
    [data, runAction]
  );

  const close = useCallback(
    (dismountId: string) => runAction(closeDismount(data, dismountId)),
    [data, runAction]
  );

  const assign = useCallback(
    (stoneId: string, orderId: string, position: string) =>
      runAction(assignStone(data, stoneId, orderId, position)),
    [data, runAction]
  );

  const move = useCallback(
    (stoneId: string, position: string) =>
      runAction(changeMountPosition(data, stoneId, position)),
    [data, runAction]
  );

  const saveNote = useCallback(
    (stoneId: string, note: string) => runAction(saveDefectNote(data, stoneId, note)),
    [data, runAction]
  );

  const createStone = useCallback(
    (input: NewStoneInput) => runAction(addStone(data, input)),
    [data, runAction]
  );

  const value = useMemo<StoreValue>(
    () => ({
      data,
      filter,
      notice,
      setFilter,
      resetData,
      submit,
      inspect,
      close,
      assign,
      move,
      saveNote,
      createStone,
    }),
    [
      data,
      filter,
      notice,
      setFilter,
      resetData,
      submit,
      inspect,
      close,
      assign,
      move,
      saveNote,
      createStone,
    ]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore 必须在 StoreProvider 内使用");
  return ctx;
}
