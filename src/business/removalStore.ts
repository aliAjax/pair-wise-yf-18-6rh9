/**
 * 业务文件 2/3：客户改款拆镶闭环 —— 状态
 * 订单清单、分拣批次、尺寸筛选与拆镶单共用同一份数据；
 * 只存浏览器 localStorage，刷新保留，不接后端。
 */

import { useSyncExternalStore } from "react";
import {
  type AppState,
  type InspectionFinding,
  type RuleResult,
  assignStone as assignStoneRule,
  confirmRemoved as confirmRemovedRule,
  createRemoval as createRemovalRule,
  deliverOrder as deliverOrderRule,
  repositionStone as repositionStoneRule,
  seedState,
  submitInspection as submitInspectionRule,
} from "./removalRules";

const STORAGE_KEY = "gem-sorting-workbench-v1";

let state: AppState = loadState();
const listeners = new Set<() => void>();

function loadState(): AppState {
  if (typeof localStorage === "undefined") return seedState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = seedState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw) as AppState;
    // 基本形状校验，损坏数据回退到种子
    if (!parsed || !Array.isArray(parsed.stones) || !Array.isArray(parsed.removals)) {
      return seedState();
    }
    return parsed;
  } catch {
    return seedState();
  }
}

function persist(next: AppState) {
  state = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 存储已满或被禁用：内存中仍可用
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): AppState {
  return state;
}

/** 读取当前状态（非 Hook 场景） */
export function getState(): AppState {
  return state;
}

/** React 订阅入口：任何组件拿到的都是同一份数据 */
export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** 恢复演示数据 */
export function resetState(): void {
  persist(seedState());
}

/** 清空全部业务数据（保留空结构） */
export function clearState(): void {
  persist({ stones: [], orders: [], batches: [], removals: [], seq: { removal: 0 } });
}

/* ------------------------------- 动作封装 ------------------------------- */

function apply(result: RuleResult<AppState>): boolean {
  if (!result.ok || !result.data) return false;
  persist(result.data);
  return true;
}

export const actions = {
  createRemoval(orderId: string, reason: string, stoneIds: string[]): RuleResult {
    const r = createRemovalRule(state, { orderId, reason, stoneIds });
    if (r.ok && r.data) persist(r.data.state);
    return { ok: r.ok, message: r.message, conflicts: r.conflicts };
  },

  confirmRemoved(removalId: string): RuleResult {
    const r = confirmRemovedRule(state, removalId);
    apply(r);
    return r;
  },

  submitInspection(
    removalId: string,
    stoneId: string,
    findings: InspectionFinding[],
    inspectNote: string,
  ): RuleResult {
    const r = submitInspectionRule(state, removalId, { stoneId, findings, inspectNote });
    apply(r);
    return r;
  },

  assignStone(stoneId: string, orderId: string): RuleResult {
    const r = assignStoneRule(state, stoneId, orderId);
    apply(r);
    return r;
  },

  repositionStone(stoneId: string, position: string): RuleResult {
    const r = repositionStoneRule(state, stoneId, position);
    apply(r);
    return r;
  },

  deliverOrder(orderId: string): RuleResult {
    const r = deliverOrderRule(state, orderId);
    apply(r);
    return r;
  },
};
