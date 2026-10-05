import { createAction, props } from '@ngrx/store'
import type { BatchConclusion, InspectionPlan, WeldingMaterial, Weld, WeldStatus } from '../types'

export const loadWelds = createAction('[Weld] Load')
export const loadWeldsSuccess = createAction('[Weld API] Load Success', props<{ welds: Weld[]; plans: InspectionPlan[] }>())
export const selectWeld = createAction('[Weld] Select', props<{ id: string }>())
export const filterStatus = createAction('[Weld] Filter Status', props<{ status: string }>())
export const advanceWeld = createAction('[Weld] Advance', props<{ id: string; status: WeldStatus }>())
export const createPlan = createAction('[Inspection] Create Plan', props<{ plan: InspectionPlan }>())
export const lockBaseline = createAction('[Approval] Lock Baseline')

/** 焊材入库登记（按登记号幂等，重放不重复追加） */
export const registerMaterial = createAction('[Material] Register', props<{ material: WeldingMaterial }>())
/** 焊材领用：批号停发时拦截 */
export const requisitionMaterial = createAction('[Material] Requisition', props<{ batchNo: string; weldId: string; quantity: number; actor: string }>())
/** 存量焊缝缺批号时补录领用记录 */
export const backfillMaterial = createAction('[Material] Backfill', props<{ batchNo: string; weldId: string; actor: string }>())
/** 提交批号复验结论（乐观锁：expectedVersion 为提交时读到的版本） */
export const submitReinspection = createAction('[Material] Submit Reinspection', props<{ batchNo: string; conclusion: BatchConclusion; actor: string; expectedVersion: number }>())
/** 并发冲突提示已读 */
export const clearConflict = createAction('[Material] Clear Conflict')
