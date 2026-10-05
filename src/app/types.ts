export type WeldStatus = '待检测' | '合格' | '返修中' | '待复检' | '已关闭'
export type DefectLevel = 'Ⅰ级' | 'Ⅱ级' | 'Ⅲ级' | 'Ⅳ级'
/** 材料组别（按受力重要性分级，决定常规与提级检测比例） */
export type MaterialGroup = 'Ⅰ类' | 'Ⅱ类' | 'Ⅲ类'
/** 批号复验结论 */
export type BatchVerdict = '未复验' | '合格' | '不合格'
/** 焊缝反向追溯状态：正常 / 已出报告待复核 / 历史数据缺批号待补录 */
export type TraceState = '正常' | '待复核' | '待补录'

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
  status: WeldStatus
  x: number
  y: number
  repairs: number
  defects: Defect[]
  /** 焊材批号（可能多条，历史数据为空 → 待补录） */
  batchIds: string[]
  /** 材料组别 */
  group: MaterialGroup
  /** 已出具检测报告号（含缺陷报告即视为已出报告） */
  reportNo?: string
  /** 报告原始结论，批号不合格时保留不抹除 */
  reportConclusion?: '合格' | '不合格'
  traceState: TraceState
}

export interface InspectionPlan {
  id: string
  date: string
  method: string
  weldIds: string[]
  inspector: string
  state: '待执行' | '执行中' | '已完成' | '已失效'
  /** 失效/重算相关 */
  group?: MaterialGroup
  ratio?: number
  recalculated?: boolean
  invalidReason?: string
  replacedBy?: string
}

/** 焊材入库批号台账 */
export interface ConsumableBatch {
  id: string
  type: string
  spec: string
  supplier: string
  materialGroup: MaterialGroup
  receivedDate: string
  quantity: number
  unit: string
  verdict: BatchVerdict
  retestNo?: string
  conclusionAt?: string
  /** 停发标记：复验不合格立即置真 */
  stopped: boolean
  stoppedAt?: string
}

/** 焊材领用（发放）单：批号 → 焊缝的桥 */
export interface ConsumableIssue {
  id: string
  date: string
  batchId: string
  welder: string
  workOrder: string
  quantity: number
  unit: string
  weldIds: string[]
}

export interface SnapshotRevision {
  id: string
  regNo: string
  derivedAt: string
  reason: string
  status: '待复核'
}

/** 已签字锁定的批次快照，只读，不合格时只派生修订 */
export interface SignedSnapshot {
  id: string
  batchId: string
  versionLabel: string
  signedAt: string
  signer: string
  scope: string
  weldIds: string[]
  revisions: SnapshotRevision[]
}

export type JournalStatus = '已生效' | '登记失败'
export type FailureKind = '网络超时' | '结论冲突'

/** 复验结论登记台账（登记号幂据） */
export interface JournalEntry {
  regNo: string
  time: string
  appliedAt?: string
  keeper: string
  batchId: string
  verdict: '合格' | '不合格'
  retestNo: string
  status: JournalStatus
  failureKind?: FailureKind
  failureReason?: string
}

export interface CascadeRatio {
  group: MaterialGroup
  from: number
  to: number
}

/** 一次批号不合格触发的反向处置级联记录 */
export interface CascadeRecord {
  id: string
  regNo: string
  batchId: string
  time: string
  affectedWeldIds: string[]
  reportedWeldIds: string[]
  replannedWeldIds: string[]
  invalidPlanIds: string[]
  replacementPlanIds: string[]
  revisedSnapshotIds: string[]
  ratios: CascadeRatio[]
}

export type NoticeKind = '登记成功' | '冲突' | '登记失败' | '重放生效' | '停发拦截' | '提示'

export interface Notice {
  id: string
  kind: NoticeKind
  title: string
  detail: string
  time: string
}

export interface AuditEvent {
  id: string
  time: string
  actor: string
  action: string
  target: string
  detail: string
}
