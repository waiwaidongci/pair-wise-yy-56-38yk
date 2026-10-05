import type {
  AuditEvent, CascadeRecord, ConsumableBatch, ConsumableIssue, InspectionPlan, JournalEntry,
  MaterialGroup, Notice, SignedSnapshot, SnapshotRevision, Weld,
} from '../types'

/** 批号不合格后，按材料组别提级重算的最低检测比例 */
const ESCALATED_RATIO: Record<MaterialGroup, number> = { 'Ⅰ类': 100, 'Ⅱ类': 50, 'Ⅲ类': 30 }

export interface TraceSlice {
  batches: ConsumableBatch[]
  issues: ConsumableIssue[]
  welds: Weld[]
  plans: InspectionPlan[]
  snapshots: SignedSnapshot[]
  journal: JournalEntry[]
  cascades: CascadeRecord[]
}

export interface PendingRegistration {
  regNo: string
  time: string
  keeper: string
  batchId: string
  verdict: '合格' | '不合格'
  retestNo: string
}

interface DraftNotice { kind: Notice['kind']; title: string; detail: string }
interface DraftAudit { actor: string; action: string; target: string; detail: string }

export interface ApplyResult {
  ok: boolean
  reason?: 'conflict' | 'already-applied' | 'batch-missing' | 'not-found'
  entry?: JournalEntry
  batches: ConsumableBatch[]
  welds: Weld[]
  plans: InspectionPlan[]
  snapshots: SignedSnapshot[]
  cascades: CascadeRecord[]
  journal: JournalEntry[]
  audits: DraftAudit[]
  notices: DraftNotice[]
}

const empty = (s: TraceSlice, audits: DraftAudit[] = [], notices: DraftNotice[] = []): ApplyResult => ({
  ok: false, batches: s.batches, welds: s.welds, plans: s.plans, snapshots: s.snapshots,
  cascades: s.cascades, journal: s.journal, audits, notices,
})

/** 历史数据兼容迁移：缺焊材批号的焊缝标成待补录（不阻断现有业务） */
export function migrateCompatibility(welds: Weld[]): Weld[] {
  return welds.map((w) => w.batchIds.length === 0 && w.traceState !== '待复核'
    ? { ...w, traceState: '待补录' as const }
    : w)
}

/** 反向追溯：批号 → 用过它的焊缝（经领用单汇聚，一个批号可落多条焊缝） */
export function weldsUsingBatch(issues: ConsumableIssue[], batchId: string): string[] {
  return [...new Set(issues.filter((i) => i.batchId === batchId).flatMap((i) => i.weldIds))]
}

const hasReport = (w: Weld) => Boolean(w.reportNo)

/**
 * 应用一条复验结论登记。纯函数，便于对“先到生效 / 冲突 / 失败重放 / 幂等”逐一测试。
 */
export function applyRegistration(s: TraceSlice, p: PendingRegistration, networkFail: boolean): ApplyResult {
  const byReg = s.journal.find((e) => e.regNo === p.regNo)
  const audits: DraftAudit[] = []
  const notices: DraftNotice[] = []

  // 幂等：同一登记号已生效，重放不重复追加任何级联
  if (byReg?.status === '已生效') {
    notices.push({ kind: '重放生效', title: `登记号 ${p.regNo} 已生效`, detail: '重放被忽略，未重复追加处置级联。' })
    return { ...empty(s, audits, notices), ok: false, reason: 'already-applied', entry: byReg }
  }

  const batch = s.batches.find((b) => b.id === p.batchId)
  if (!batch) {
    notices.push({ kind: '登记失败', title: '批号不存在', detail: `登记号 ${p.regNo} 指向的批号 ${p.batchId} 不存在。` })
    return { ...empty(s, audits, notices), ok: false, reason: 'batch-missing' }
  }

  // 模拟登记失败（网络超时）：只留失败台账，不动业务数据，等待按登记号恢复
  if (networkFail) {
    const entry: JournalEntry = byReg
      ? { ...byReg, status: '登记失败', failureKind: '网络超时', failureReason: '提交时网络超时，结论未生效' }
      : { ...p, status: '登记失败', failureKind: '网络超时', failureReason: '提交时网络超时，结论未生效' }
    const journal = upsert(s.journal, entry, (e) => e.regNo === p.regNo)
    notices.push({ kind: '登记失败', title: `登记失败 · ${p.batchId}`, detail: `登记号 ${p.regNo} 因网络超时未落库，可凭该登记号恢复重放。` })
    audits.push({ actor: p.keeper, action: '登记失败', target: p.batchId, detail: `复验号 ${p.retestNo} 结论“${p.verdict}”网络超时，待恢复` })
    return { ...empty(s, audits, notices), ok: false, journal, entry }
  }

  // 并发：同一批号同一复验号的结论只认先到的一条，后到看到冲突
  const winner = s.journal.find((e) => e.status === '已生效' && e.batchId === p.batchId && e.retestNo === p.retestNo)
  if (winner) {
    const entry: JournalEntry = { ...p, time: p.time, status: '登记失败', failureKind: '结论冲突', failureReason: `库管 ${winner.keeper} 已于 ${winner.appliedAt} 先生效（${winner.verdict}）` }
    const journal = [...s.journal, entry]
    notices.push({ kind: '冲突', title: `结论冲突 · ${p.batchId}`, detail: `库管 ${winner.keeper} 的“${winner.verdict}”结论已于 ${winner.appliedAt} 先到生效；库管 ${p.keeper} 的提交被驳回，原处置不变。` })
    audits.push({ actor: p.keeper, action: '结论冲突被驳回', target: p.batchId, detail: `复验号 ${p.retestNo} 与先生效登记 ${winner.regNo} 冲突` })
    return { ...empty(s, audits, notices), ok: false, reason: 'conflict', journal, entry }
  }

  const entry: JournalEntry = { ...p, status: '已生效', appliedAt: p.time }
  const journal = upsert(s.journal, entry, (e) => e.regNo === p.regNo)
  audits.push({ actor: p.keeper, action: '复验结论生效', target: p.batchId, detail: `复验号 ${p.retestNo} 结论为${p.verdict}` })

  const batches = s.batches.map((b) => b.id === p.batchId
    ? { ...b, verdict: p.verdict, retestNo: p.retestNo, conclusionAt: p.time, stopped: p.verdict === '不合格' ? true : b.stopped, stoppedAt: p.verdict === '不合格' ? p.time : b.stoppedAt }
    : b)

  if (p.verdict === '合格') {
    notices.push({ kind: '登记成功', title: `结论生效 · ${p.batchId}`, detail: '复验合格已登记，发放状态不变。' })
    return { ok: true, entry, batches, welds: s.welds, plans: s.plans, snapshots: s.snapshots, cascades: s.cascades, journal, audits, notices }
  }

  // —— 不合格：先停发，再沿 领用单 → 焊缝 → 检测计划 → 签字快照 反向处置 ——
  notices.push({ kind: '停发拦截', title: `已停发 · ${p.batchId}`, detail: '批号复验不合格，发放通道立即关闭，新领用单一律拦截。' })
  audits.push({ actor: '系统', action: '批号停发', target: p.batchId, detail: `复验号 ${p.retestNo} 不合格，登记号 ${p.regNo} 触发自动停发` })

  const affectedIds = weldsUsingBatch(s.issues, p.batchId)
  const affected = s.welds.filter((w) => affectedIds.includes(w.id))
  const reported = affected.filter(hasReport)
  const unreported = affected.filter((w) => !hasReport(w))
  const unreportedIds = new Set(unreported.map((w) => w.id))

  // 已出报告：保留原结论，只标待复核
  const reportedIds = new Set(reported.map((w) => w.id))
  const welds = s.welds.map((w) => reportedIds.has(w.id) ? { ...w, traceState: '待复核' as const } : w)
  if (reported.length) {
    audits.push({ actor: '系统', action: '报告标记待复核', target: reported.map((w) => w.id).join('、'), detail: '保留原检测结论与报告，等待材料复核后再确认' })
  }

  // 未开工（待执行）且含未报告受影响焊缝的计划立即失效；执行中/已完成不动
  const invalidPlans = s.plans.filter((plan) => plan.state === '待执行' && plan.weldIds.some((id) => unreportedIds.has(id)))
  const invalidIds = new Set(invalidPlans.map((plan) => plan.id))
  const strandedFromInvalid = [...new Set(invalidPlans.flatMap((plan) => plan.weldIds))].filter((id) => !unreportedIds.has(id))

  // 按材料组别重算比例：受影响未报告焊缝全数重排，原失效计划里的同组焊缝带回，比例对组内总数重算并提级
  const groups: MaterialGroup[] = ['Ⅰ类', 'Ⅱ类', 'Ⅲ类']
  const replacements: InspectionPlan[] = []
  const ratioLog = groups.map((group) => {
    const affectedInGroup = unreported.filter((w) => w.group === group).map((w) => w.id)
    if (!affectedInGroup.length) return null
    const strandedInGroup = s.welds
      .filter((w) => w.group === group && strandedFromInvalid.includes(w.id) && !w.reportNo)
      .map((w) => w.id)
    const memberIds = [...new Set([...affectedInGroup, ...strandedInGroup])]
    const groupTotal = s.welds.filter((w) => w.group === group).length
    const ratio = Math.min(100, Math.max(ESCALATED_RATIO[group], Math.ceil((memberIds.length / Math.max(1, groupTotal)) * 100)))
    const planId = `IP-RC-${p.batchId.replace(/[^A-Z0-9]/gi, '')}-${group.replace('类', '')}`
    replacements.push({
      id: planId, date: p.time.slice(0, 10), method: group === 'Ⅰ类' ? 'UT + MT' : 'UT',
      weldIds: memberIds, inspector: '系统按批号重算', state: '待执行', group, ratio, recalculated: true,
      invalidReason: `源批号 ${p.batchId} 复验不合格，${group}比例提级重算为 ${ratio}%`,
    })
    return { group, from: Math.round((memberIds.length / Math.max(1, groupTotal)) * 100), to: ratio }
  }).filter((r): r is { group: MaterialGroup; from: number; to: number } => r !== null)

  const replacementIds = new Set(replacements.map((p2) => p2.id))
  const plans = [
    ...replacements,
    ...s.plans.map((plan) => invalidIds.has(plan.id)
      ? { ...plan, state: '已失效' as const, invalidReason: `含不合格批号 ${p.batchId} 的未检焊缝，登记号 ${p.regNo} 触发失效`, replacedBy: pickReplacement(replacements, s.welds, plan) }
      : plan),
  ]
  if (invalidPlans.length) {
    audits.push({ actor: '系统', action: '检测计划失效并重算', target: [...invalidIds, ...replacementIds].join('、'), detail: `未开工计划立即失效，按材料组别重算：${ratioLog.map((r) => `${r.group} ${r.from}%→${r.to}%`).join('；')}` })
  }

  // 已签字锁定的批次不改原快照，只派生待复核修订
  const revisedSnapshotIds: string[] = []
  const snapshots = s.snapshots.map((snap) => {
    if (!snap.weldIds.some((id) => affectedIds.includes(id))) return snap
    if (snap.revisions.some((r) => r.regNo === p.regNo)) return snap
    const revision: SnapshotRevision = { id: `${snap.id}-R${snap.revisions.length + 1}`, regNo: p.regNo, derivedAt: p.time, reason: `批号 ${p.batchId} 复验不合格，原快照保留不动`, status: '待复核' }
    revisedSnapshotIds.push(snap.id)
    return { ...snap, revisions: [...snap.revisions, revision] }
  })
  if (revisedSnapshotIds.length) {
    audits.push({ actor: '系统', action: '派生快照修订', target: revisedSnapshotIds.join('、'), detail: '原签字快照保持只读，已派生“待复核”修订，不覆盖签字记录' })
  }

  const cascade: CascadeRecord = {
    id: `CAS-${p.regNo}`, regNo: p.regNo, batchId: p.batchId, time: p.time,
    affectedWeldIds: affectedIds,
    reportedWeldIds: reported.map((w) => w.id),
    replannedWeldIds: unreported.map((w) => w.id),
    invalidPlanIds: [...invalidIds],
    replacementPlanIds: replacements.map((plan) => plan.id),
    revisedSnapshotIds,
    ratios: ratioLog,
  }
  const cascades = [...s.cascades.filter((c) => c.regNo !== p.regNo), cascade]

  notices.push({
    kind: '登记成功', title: `反向处置完成 · ${p.batchId}`,
    detail: `涉及焊缝 ${affectedIds.length} 条：已出报告 ${reported.length} 条保留结论标待复核；未开工计划 ${invalidPlans.length} 个失效并重算 ${replacements.length} 个；派生快照修订 ${revisedSnapshotIds.length} 份。`,
  })

  return { ok: true, entry, batches, welds, plans, snapshots, cascades, journal, audits, notices }
}

function pickReplacement(replacements: InspectionPlan[], welds: Weld[], invalid: InspectionPlan): string | undefined {
  const groupsOfInvalid = [...new Set(invalid.weldIds.map((id) => welds.find((w) => w.id === id)?.group).filter((g): g is MaterialGroup => Boolean(g)))]
  return replacements.find((r) => r.group && groupsOfInvalid.includes(r.group))?.id
}

function upsert<T>(list: T[], item: T, key: (x: T) => boolean): T[] {
  const i = list.findIndex(key)
  if (i < 0) return [...list, item]
  return list.map((x) => key(x) ? item : x)
}

let seq = 0
export function materializeAudit(d: DraftAudit): AuditEvent {
  seq += 1
  return { id: `AE-${Date.now()}-${seq}`, time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }), ...d }
}
let nseq = 0
export function materializeNotice(d: DraftNotice, time: string): Notice {
  nseq += 1
  return { id: `N-${Date.now()}-${nseq}`, time, ...d }
}
