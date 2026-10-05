import { createReducer, on } from '@ngrx/store'
import type {
  AuditEvent, CascadeRecord, ConsumableBatch, ConsumableIssue, InspectionPlan,
  JournalEntry, Notice, SignedSnapshot, Weld,
} from '../types'
import * as A from './weld.actions'
import { applyRegistration, materializeAudit, materializeNotice, migrateCompatibility, type TraceSlice } from './cascade'

export interface WeldState extends TraceSlice {
  selectedId: string
  selectedBatchId: string
  statusFilter: string
  locked: boolean
  version: number
  audit: AuditEvent[]
  notices: Notice[]
  hydrated: boolean
}

const audit: AuditEvent[] = [
  { id: 'AE-1', time: '16:38', actor: '赵岚', action: '提交复检', target: 'W-104', detail: '返修后 UT 复检合格，等待审核签字' },
  { id: 'AE-2', time: '15:12', actor: '陈锋', action: '录入缺陷', target: 'W-107', detail: '翼缘板端部夹渣，长度 12mm，Ⅱ级' },
  { id: 'AE-3', time: '14:20', actor: '系统', action: '资质预警', target: 'W-109', detail: '焊工证书 2026-10-01 到期，不得列入后续检测计划' },
]

export const initialState: WeldState = {
  welds: [], plans: [], batches: [], issues: [], snapshots: [], journal: [], cascades: [],
  selectedId: '', selectedBatchId: '', statusFilter: '全部', locked: false, version: 12, audit, notices: [], hydrated: false,
}

function withResult(state: WeldState, r: ReturnType<typeof applyRegistration>, time: string): WeldState {
  const base: WeldState = {
    ...state,
    batches: r.batches,
    welds: r.welds,
    plans: r.plans,
    snapshots: r.snapshots,
    cascades: r.cascades,
    journal: r.journal,
    notices: [...r.notices.map((n) => materializeNotice(n, time)), ...state.notices].slice(0, 30),
    audit: [...r.audits.map(materializeAudit), ...state.audit].slice(0, 60),
  }
  return base
}

export const weldReducer = createReducer(
  initialState,
  on(A.loadWeldsSuccess, (state, { welds, plans, batches, issues, snapshots, journal }) => {
    if (state.hydrated) return state
    return {
      ...state,
      hydrated: true,
      welds: migrateCompatibility(welds),
      plans,
      batches,
      issues,
      snapshots,
      journal,
      selectedId: state.selectedId || welds[0]?.id || '',
      selectedBatchId: state.selectedBatchId || batches[0]?.id || '',
    }
  }),
  on(A.selectWeld, (state, { id }) => ({ ...state, selectedId: id })),
  on(A.filterStatus, (state, { status }) => ({ ...state, statusFilter: status })),
  on(A.advanceWeld, (state, { id, status }) => ({ ...state, version: state.version + 1, welds: state.welds.map((weld) => weld.id === id ? { ...weld, status } : weld), audit: [{ id: `AE-${Date.now()}`, time: new Date().toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit', hour12:false }), actor:'当前审核人', action:'状态流转', target:id, detail:`状态变更为 ${status}` }, ...state.audit] })),
  on(A.createPlan, (state, { plan }) => ({ ...state, plans: [plan, ...state.plans], version: state.version + 1 })),
  on(A.lockBaseline, (state) => ({ ...state, locked: true, audit: [{ id: `AE-${Date.now()}`, time: '刚刚', actor: '质量负责人', action: '签字锁定', target: '检测批次', detail: '焊工资质、检测比例与批号追溯已确认' }, ...state.audit] })),
  on(A.selectBatch, (state, { batchId }) => ({ ...state, selectedBatchId: batchId })),
  on(A.dismissNotice, (state, { id }) => ({ ...state, notices: state.notices.filter((n) => n.id !== id) })),
  on(A.pushNotice, (state, { notice }) => ({ ...state, notices: [notice, ...state.notices].slice(0, 30) })),
  on(A.registerVerdict, (state, { regNo, time, keeper, batchId, verdict, retestNo, fail }) => {
    const r = applyRegistration(state, { regNo, time, keeper, batchId, verdict, retestNo }, Boolean(fail))
    return { ...withResult(state, r, time), version: state.version + 1 }
  }),
  on(A.replayRegistration, (state, { regNo, time }) => {
    const failed: JournalEntry | undefined = state.journal.find((e) => e.regNo === regNo && e.status === '登记失败' && e.failureKind === '网络超时')
    if (!failed) {
      return { ...state, notices: [materializeNotice({ kind: '提示', title: '无可恢复登记', detail: `登记号 ${regNo} 没有“登记失败（网络超时）”记录。` }, time), ...state.notices].slice(0, 30) }
    }
    // 重放：恢复时不再模拟失败，按登记号幂等执行，不重复追加
    const r = applyRegistration(state, {
      regNo: failed.regNo, time, keeper: failed.keeper, batchId: failed.batchId,
      verdict: failed.verdict, retestNo: failed.retestNo,
    }, false)
    return { ...withResult(state, r, time), version: state.version + 1 }
  }),
)
