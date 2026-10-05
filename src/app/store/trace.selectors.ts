import type { ConsumableBatch, ConsumableIssue, InspectionPlan, SignedSnapshot, Weld } from '../types'
import { weldsUsingBatch } from './cascade'

/** 批号反向追溯链：入库批号 → 领用单 → 焊缝 → 检测计划 → 签字快照 */
export interface BatchTraceChain {
  batch: ConsumableBatch
  issues: ConsumableIssue[]
  welds: Weld[]
  plans: InspectionPlan[]
  snapshots: SignedSnapshot[]
}

export function traceChainFor(
  batchId: string,
  batches: ConsumableBatch[],
  issues: ConsumableIssue[],
  welds: Weld[],
  plans: InspectionPlan[],
  snapshots: SignedSnapshot[],
): BatchTraceChain | undefined {
  const batch = batches.find((b) => b.id === batchId)
  if (!batch) return undefined
  const weldIds = weldsUsingBatch(issues, batchId)
  const weldSet = new Set(weldIds)
  return {
    batch,
    issues: issues.filter((i) => i.batchId === batchId),
    welds: welds.filter((w) => weldSet.has(w.id)),
    plans: plans.filter((p) => p.weldIds.some((id) => weldSet.has(id))),
    snapshots: snapshots.filter((s) => s.weldIds.some((id) => weldSet.has(id))),
  }
}

export const traceTagSeverity = (s: Weld['traceState']) => s === '待复核' ? 'danger' : s === '待补录' ? 'warn' : 'success'
export const verdictSeverity = (v: ConsumableBatch['verdict']) => v === '不合格' ? 'danger' : v === '合格' ? 'success' : 'secondary'
