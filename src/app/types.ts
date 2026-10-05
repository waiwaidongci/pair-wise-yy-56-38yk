export type WeldStatus = '待检测' | '合格' | '返修中' | '待复检' | '已关闭'
export type DefectLevel = 'Ⅰ级' | 'Ⅱ级' | 'Ⅲ级' | 'Ⅳ级'

/** 材料组别（按 NB/T 47014 常用组别简化） */
export type MaterialGroup = 'Fe-1 碳钢' | 'Fe-3 低合金钢' | 'Fe-8 不锈钢'

/** 焊材复验结论 */
export type BatchConclusion = '合格' | '不合格' | '待复验'

/** 焊材库存状态：复验不合格先停发 */
export type BatchStatus = '在库' | '停发'

/** 焊缝复核状态：正常 / 待复核（批号追溯命中） / 待补录（存量数据缺批号） */
export type ReviewStatus = '正常' | '待复核' | '待补录'

export interface Defect {
  id: string
  position: number
  type: string
  length: number
  level: DefectLevel
  method: string
  report: string
}

export interface Weld {
  id: string
  drawing: string
  component: string
  joint: string
  method: string
  welder: string
  qualification: string
  qualificationValid: boolean
  inspectionRatio: number
  requiredRatio: number
  /** 材料组别，检测比例按组别重算 */
  materialGroup: MaterialGroup
  /** 该焊缝领用的焊材批号（多对多） */
  batchNos: string[]
  /** 批号追溯 / 存量补录状态 */
  reviewStatus: ReviewStatus
  status: WeldStatus
  x: number
  y: number
  repairs: number
  defects: Defect[]
}

export interface InspectionPlan {
  id: string
  date: string
  method: string
  weldIds: string[]
  inspector: string
  state: '待执行' | '执行中' | '已完成' | '已失效'
  /** 失效原因，如批号复验不合格 */
  invalidReason?: string
}

export interface AuditEvent {
  id: string
  time: string
  actor: string
  action: string
  target: string
  detail: string
}

/** 焊材入库台账（按批号管理） */
export interface WeldingMaterial {
  id: string
  /** 批号，如 H08A-2026-0511 */
  batchNo: string
  /** 焊材名称型号，如 H08A 焊丝 */
  name: string
  group: MaterialGroup
  spec: string
  quantity: number
  unit: string
  /** 入库登记号，用于失败恢复与幂等重放 */
  regNo: string
  regTime: string
  keeper: string
  status: BatchStatus
  conclusion: BatchConclusion
  /** 乐观锁版本号：两名库管同时提交同一批号结论时先到生效 */
  version: number
}

/** 焊材领用单：一个批号可落在多条焊缝上，一条焊缝可领用多个批号 */
export interface MaterialRequisition {
  id: string
  batchNo: string
  weldId: string
  quantity: number
  actor: string
  time: string
}

/** 签字快照：锁定后不可改原快照，批号追溯只派生待复核修订 */
export interface SignatureSnapshot {
  id: string
  version: number
  type: '原始锁定' | '待复核修订'
  lockedAt: string
  actor: string
  /** 派生来源（待复核修订指向原始锁定快照） */
  derivedFrom?: string
  reason?: string
  summary: string
}
