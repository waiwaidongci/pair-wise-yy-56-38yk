import { createReducer, on } from '@ngrx/store'
import type { AuditEvent, InspectionPlan, MaterialGroup, MaterialRequisition, SignatureSnapshot, WeldingMaterial, Weld } from '../types'
import * as A from './weld.actions'

/** 材料组别 → 检测比例（%）。批号不合格、未开工计划失效后按此重算 */
export const GROUP_REQUIRED_RATIO: Record<MaterialGroup, number> = {
  'Fe-1 碳钢': 20,
  'Fe-3 低合金钢': 50,
  'Fe-8 不锈钢': 100,
}

export interface ConflictInfo {
  batchNo: string
  actor: string
  expectedVersion: number
  actualVersion: number
  time: string
}

export interface WeldState {
  welds: Weld[]
  plans: InspectionPlan[]
  materials: WeldingMaterial[]
  requisitions: MaterialRequisition[]
  snapshots: SignatureSnapshot[]
  conflict: ConflictInfo | null
  selectedId: string
  statusFilter: string
  locked: boolean
  version: number
  audit: AuditEvent[]
}

const now = () => new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
const auditId = () => `AE-${Date.now()}-${Math.floor(Math.random() * 1000)}`

const audit: AuditEvent[] = [
  { id: 'AE-1', time: '16:38', actor: '赵岚', action: '提交复检', target: 'W-104', detail: '返修后 UT 复检合格，等待审核签字' },
  { id: 'AE-2', time: '15:12', actor: '陈锋', action: '录入缺陷', target: 'W-107', detail: '翼缘板端部夹渣，长度 12mm，Ⅱ级' },
  { id: 'AE-3', time: '14:20', actor: '系统', action: '资质预警', target: 'W-109', detail: '焊工证书 2026-10-01 到期，不得列入后续检测计划' },
]

/** 焊材入库台账：H08A-2026-0511 复验结论待出，是反向追溯的触发点 */
const materials: WeldingMaterial[] = [
  { id: 'M-01', batchNo: 'J422-2026-0315', name: 'J422 焊条', group: 'Fe-1 碳钢', spec: 'Φ4.0', quantity: 1200, unit: 'kg', regNo: 'DJ-2026-0315-01', regTime: '2026-03-15 09:20', keeper: '周敏', status: '在库', conclusion: '合格', version: 1 },
  { id: 'M-02', batchNo: 'J507-2026-0420', name: 'J507 焊条', group: 'Fe-3 低合金钢', spec: 'Φ3.2', quantity: 800, unit: 'kg', regNo: 'DJ-2026-0420-02', regTime: '2026-04-20 10:05', keeper: '周敏', status: '在库', conclusion: '合格', version: 1 },
  { id: 'M-03', batchNo: 'H08A-2026-0511', name: 'H08A 埋弧焊丝', group: 'Fe-1 碳钢', spec: 'Φ4.0', quantity: 600, unit: 'kg', regNo: 'DJ-2026-0511-03', regTime: '2026-05-11 14:40', keeper: '吴芳', status: '在库', conclusion: '待复验', version: 1 },
  { id: 'M-04', batchNo: 'J422-2026-0718', name: 'J422 焊条', group: 'Fe-1 碳钢', spec: 'Φ4.0', quantity: 500, unit: 'kg', regNo: 'DJ-2026-0718-04', regTime: '2026-07-18 08:55', keeper: '吴芳', status: '在库', conclusion: '合格', version: 1 },
  { id: 'M-05', batchNo: 'ER308-2026-0602', name: 'ER308 不锈钢焊丝', group: 'Fe-8 不锈钢', spec: 'Φ2.5', quantity: 300, unit: 'kg', regNo: 'DJ-2026-0602-05', regTime: '2026-06-02 11:30', keeper: '周敏', status: '在库', conclusion: '合格', version: 1 },
]

/** 领用单：批号 → 焊缝（多对多）。H08A 同时落在 W-104、W-109 两条焊缝上 */
const requisitions: MaterialRequisition[] = [
  { id: 'LY-001', batchNo: 'J422-2026-0315', weldId: 'W-101', quantity: 180, actor: '王凯', time: '2026-03-20 08:30' },
  { id: 'LY-002', batchNo: 'J507-2026-0420', weldId: 'W-107', quantity: 90, actor: '赵明', time: '2026-04-22 09:15' },
  { id: 'LY-003', batchNo: 'H08A-2026-0511', weldId: 'W-104', quantity: 120, actor: '刘强', time: '2026-05-12 10:20' },
  { id: 'LY-004', batchNo: 'H08A-2026-0511', weldId: 'W-109', quantity: 60, actor: '孙鹏', time: '2026-05-13 15:05' },
  { id: 'LY-005', batchNo: 'J422-2026-0718', weldId: 'W-101', quantity: 40, actor: '王凯', time: '2026-07-19 08:10' },
]

const snapshots: SignatureSnapshot[] = []

export const initialState: WeldState = {
  welds: [],
  plans: [],
  materials,
  requisitions,
  snapshots,
  conflict: null,
  selectedId: '',
  statusFilter: '全部',
  locked: false,
  version: 12,
  audit,
}

/** 兼容规则：存量焊缝缺焊材批号的，标成待补录；缺组别信息的按碳钢兜底 */
function compatWeld(w: Weld): Weld {
  const batchNos = w.batchNos ?? []
  return {
    ...w,
    materialGroup: w.materialGroup ?? 'Fe-1 碳钢',
    batchNos,
    reviewStatus: batchNos.length === 0 ? '待补录' : (w.reviewStatus ?? '正常'),
  }
}

/** 焊缝是否已出检测报告（有缺陷/报告记录，或已合格关闭） */
function hasReport(w: Weld): boolean {
  return w.defects.length > 0 || w.status === '合格' || w.status === '已关闭'
}

export const weldReducer = createReducer(
  initialState,
  on(A.loadWeldsSuccess, (state, { welds, plans }) => ({
    ...state,
    welds: welds.map(compatWeld),
    plans,
    selectedId: state.selectedId || welds[0]?.id || '',
  })),
  on(A.selectWeld, (state, { id }) => ({ ...state, selectedId: id })),
  on(A.filterStatus, (state, { status }) => ({ ...state, statusFilter: status })),
  on(A.advanceWeld, (state, { id, status }) => ({
    ...state,
    version: state.version + 1,
    welds: state.welds.map((weld) => weld.id === id ? { ...weld, status } : weld),
    audit: [{ id: auditId(), time: now(), actor: '当前审核人', action: '状态流转', target: id, detail: `状态变更为 ${status}` }, ...state.audit],
  })),
  on(A.createPlan, (state, { plan }) => ({ ...state, plans: [plan, ...state.plans], version: state.version + 1 })),

  // —— 焊材入库：按登记号幂等，重放不重复追加 ——
  on(A.registerMaterial, (state, { material }) => {
    const exists = state.materials.some((m) => m.regNo === material.regNo)
    if (exists) {
      return {
        ...state,
        audit: [{ id: auditId(), time: now(), actor: material.keeper, action: '登记恢复', target: material.batchNo, detail: `登记号 ${material.regNo} 已存在，按登记号恢复，重放未重复追加` }, ...state.audit],
      }
    }
    return {
      ...state,
      version: state.version + 1,
      materials: [material, ...state.materials],
      audit: [{ id: auditId(), time: now(), actor: material.keeper, action: '焊材入库', target: material.batchNo, detail: `${material.name} ${material.spec} 入库 ${material.quantity}${material.unit}，登记号 ${material.regNo}` }, ...state.audit],
    }
  }),

  // —— 焊材领用：停发批号先拦截；领用后焊缝挂上批号 ——
  on(A.requisitionMaterial, (state, { batchNo, weldId, quantity, actor }) => {
    const mat = state.materials.find((m) => m.batchNo === batchNo)
    if (!mat) {
      return { ...state, audit: [{ id: auditId(), time: now(), actor, action: '领用失败', target: batchNo, detail: '批号不存在' }, ...state.audit] }
    }
    if (mat.status === '停发') {
      return { ...state, audit: [{ id: auditId(), time: now(), actor, action: '停发拦截', target: batchNo, detail: `批号 ${batchNo} 已停发，禁止领用（焊缝 ${weldId}）` }, ...state.audit] }
    }
    const rec: MaterialRequisition = { id: `LY-${Date.now()}`, batchNo, weldId, quantity, actor, time: now() }
    return {
      ...state,
      version: state.version + 1,
      requisitions: [rec, ...state.requisitions],
      welds: state.welds.map((w) => w.id === weldId ? { ...w, batchNos: Array.from(new Set([...w.batchNos, batchNo])), reviewStatus: w.reviewStatus === '待补录' ? '正常' : w.reviewStatus } : w),
      audit: [{ id: auditId(), time: now(), actor, action: '焊材领用', target: weldId, detail: `领用 ${batchNo} ${quantity}${mat.unit}，记入焊缝 ${weldId}` }, ...state.audit],
    }
  }),

  // —— 存量焊缝补录批号（兼容规则：待补录 → 正常） ——
  on(A.backfillMaterial, (state, { batchNo, weldId, actor }) => {
    const mat = state.materials.find((m) => m.batchNo === batchNo)
    if (!mat || mat.status === '停发') {
      return { ...state, audit: [{ id: auditId(), time: now(), actor, action: '补录失败', target: weldId, detail: mat ? `批号 ${batchNo} 已停发` : '批号不存在' }, ...state.audit] }
    }
    const rec: MaterialRequisition = { id: `LY-${Date.now()}`, batchNo, weldId, quantity: 0, actor, time: now() }
    return {
      ...state,
      version: state.version + 1,
      requisitions: [rec, ...state.requisitions],
      welds: state.welds.map((w) => w.id === weldId ? { ...w, batchNos: Array.from(new Set([...w.batchNos, batchNo])), reviewStatus: w.reviewStatus === '待补录' ? '正常' : w.reviewStatus } : w),
      audit: [{ id: auditId(), time: now(), actor, action: '批号补录', target: weldId, detail: `存量焊缝补录焊材批号 ${batchNo}，由待补录转为正常` }, ...state.audit],
    }
  }),

  // —— 提交复验结论：乐观锁，先到生效、后到见冲突；不合格先停发再反向追溯 ——
  on(A.submitReinspection, (state, { batchNo, conclusion, actor, expectedVersion }) => {
    const mat = state.materials.find((m) => m.batchNo === batchNo)
    if (!mat) {
      return { ...state, audit: [{ id: auditId(), time: now(), actor, action: '复验提交失败', target: batchNo, detail: '批号不存在' }, ...state.audit] }
    }
    // 乐观锁：后到的提交基于过期版本，不生效
    if (mat.version !== expectedVersion) {
      return {
        ...state,
        conflict: { batchNo, actor, expectedVersion, actualVersion: mat.version, time: now() },
        audit: [{ id: auditId(), time: now(), actor, action: '复验冲突', target: batchNo, detail: `库管员 ${actor} 的提交基于过期版本 v${expectedVersion}，当前 v${mat.version} 已由他人先行提交，本次未生效` }, ...state.audit],
      }
    }

    const affectedWeldIds = Array.from(new Set(state.requisitions.filter((r) => r.batchNo === batchNo).map((r) => r.weldId)))
    const failed = conclusion === '不合格'

    // 1) 先停发
    const materials = state.materials.map((m) => m.batchNo === batchNo
      ? { ...m, conclusion, version: m.version + 1, status: failed ? '停发' as const : m.status }
      : m)

    // 2) 再列出用过它的焊缝：已出报告的保留结论标待复核；未出报告的按组别重算比例、待重新排计划
    const welds = state.welds.map((w) => {
      if (!affectedWeldIds.includes(w.id)) return w
      if (hasReport(w)) return { ...w, reviewStatus: '待复核' as const }
      return { ...w, reviewStatus: '待复核' as const, inspectionRatio: 0, requiredRatio: GROUP_REQUIRED_RATIO[w.materialGroup] ?? w.requiredRatio }
    })

    // 3) 未开工（待执行）的检测计划立即失效
    const plans = state.plans.map((p) => {
      if (p.state !== '待执行' || !p.weldIds.some((id) => affectedWeldIds.includes(id))) return p
      return { ...p, state: '已失效' as const, invalidReason: `批号 ${batchNo} 复验不合格，未开工计划立即失效` }
    })

    // 4) 已签字锁定：不改原快照，只派生待复核修订
    let snapshots = state.snapshots
    if (failed && state.locked) {
      const orig = state.snapshots.find((s) => s.type === '原始锁定')
      const rev: SignatureSnapshot = {
        id: `SS-${Date.now()}-R`,
        version: state.version + 1,
        type: '待复核修订',
        lockedAt: now(),
        actor,
        derivedFrom: orig?.id,
        reason: `批号 ${batchNo} 复验不合格反向追溯`,
        summary: `派生自 ${orig?.id ?? '原始锁定快照'}：受影响焊缝 ${affectedWeldIds.length} 条，原快照内容不修改`,
      }
      snapshots = [rev, ...state.snapshots]
    }

    const traceDetail = affectedWeldIds.length
      ? `反向追溯到 ${affectedWeldIds.length} 条焊缝：${affectedWeldIds.join('、')}`
      : '暂无焊缝领用记录'
    const newAudit: AuditEvent[] = [
      { id: auditId(), time: now(), actor, action: failed ? '批号停发' : '复验结论', target: batchNo, detail: failed ? `复验结论不合格，批号 ${batchNo} 立即停发，禁止新发料` : `复验结论 ${conclusion}` },
      { id: auditId(), time: now(), actor, action: '反向追溯', target: batchNo, detail: traceDetail },
    ]
    if (failed) {
      const invalidated = plans.filter((p) => p.state === '已失效' && p.invalidReason?.includes(batchNo))
      if (invalidated.length) newAudit.push({ id: auditId(), time: now(), actor, action: '计划失效', target: batchNo, detail: `${invalidated.length} 个未开工检测计划立即失效，按材料组别重算检测比例` })
      const reviewCount = welds.filter((w) => affectedWeldIds.includes(w.id) && w.reviewStatus === '待复核').length
      if (reviewCount) newAudit.push({ id: auditId(), time: now(), actor, action: '待复核', target: batchNo, detail: `${reviewCount} 条焊缝标待复核：已出报告的保留结论，未出报告的重算比例后重新排计划` })
      if (state.locked) newAudit.push({ id: auditId(), time: now(), actor, action: '派生修订', target: batchNo, detail: '检测批次已签字锁定，原快照不修改，仅派生待复核修订' })
    }

    return {
      ...state,
      materials,
      welds,
      plans,
      snapshots,
      conflict: null,
      version: state.version + 1,
      audit: [...newAudit, ...state.audit],
    }
  }),

  on(A.clearConflict, (state) => ({ ...state, conflict: null })),

  on(A.lockBaseline, (state) => {
    if (state.locked) return state
    const snap: SignatureSnapshot = {
      id: `SS-${Date.now()}`,
      version: state.version + 1,
      type: '原始锁定',
      lockedAt: now(),
      actor: '质量负责人',
      summary: `${state.welds.length} 条焊缝 · ${state.plans.length} 个检测计划 · ${state.materials.length} 个在库批号`,
    }
    return {
      ...state,
      locked: true,
      version: state.version + 1,
      snapshots: [snap, ...state.snapshots],
      audit: [{ id: auditId(), time: now(), actor: '质量负责人', action: '签字锁定', target: '检测批次', detail: '生成原始版本快照，焊工资质、检测比例、返修闭环与焊材批号台账已确认' }, ...state.audit],
    }
  }),
)
