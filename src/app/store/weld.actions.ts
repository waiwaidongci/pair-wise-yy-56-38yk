import { createAction, props } from '@ngrx/store'
import type {
  AuditEvent, CascadeRecord, ConsumableBatch, ConsumableIssue, InspectionPlan,
  JournalEntry, Notice, SignedSnapshot, Weld, WeldStatus,
} from '../types'

export const loadWelds = createAction('[Weld] Load')
export const loadWeldsSuccess = createAction(
  '[Weld API] Load Success',
  props<{ welds: Weld[]; plans: InspectionPlan[]; batches: ConsumableBatch[]; issues: ConsumableIssue[]; snapshots: SignedSnapshot[]; journal: JournalEntry[] }>(),
)
export const selectWeld = createAction('[Weld] Select', props<{ id: string }>())
export const filterStatus = createAction('[Weld] Filter Status', props<{ status: string }>())
export const advanceWeld = createAction('[Weld] Advance', props<{ id: string; status: WeldStatus }>())
export const createPlan = createAction('[Inspection] Create Plan', props<{ plan: InspectionPlan }>())
export const lockBaseline = createAction('[Approval] Lock Baseline')

/** 库管登记批号复验结论（先到生效；失败条目可凭登记号重放） */
export const registerVerdict = createAction(
  '[Consumable] Register Verdict',
  props<{ regNo: string; time: string; keeper: string; batchId: string; verdict: '合格' | '不合格'; retestNo: string; fail?: boolean }>(),
)
/** 按登记号恢复并重放失败的登记（幂等：不重复追加级联） */
export const replayRegistration = createAction('[Consumable] Replay Registration', props<{ regNo: string; time: string }>())
/** 选择批号查看反向追溯链 */
export const selectBatch = createAction('[Consumable] Select Batch', props<{ batchId: string }>())
export const dismissNotice = createAction('[UI] Dismiss Notice', props<{ id: string }>())
export const appendAudit = createAction('[System] Append Audit', props<{ event: AuditEvent }>())
export const markCascadeReplayed = createAction('[System] Mark Cascade Replayed', props<{ regNo: string; cascade: CascadeRecord }>())
export const pushNotice = createAction('[UI] Push Notice', props<{ notice: Notice }>())
