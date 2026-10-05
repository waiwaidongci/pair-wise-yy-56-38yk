/* 反向追溯级联规则验证（node 运行，esbuild 转译） */
import { applyRegistration, migrateCompatibility, weldsUsingBatch, type TraceSlice } from '../src/app/store/cascade'
import type { ConsumableBatch, ConsumableIssue, InspectionPlan, SignedSnapshot, Weld } from '../src/app/types'

let pass = 0, fail = 0
function check(name: string, cond: boolean, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.error(`  ✗ ${name} ${extra}`) }
}

const batches: ConsumableBatch[] = [
  { id: 'B1', type: '焊条', spec: '3.2', supplier: '甲', materialGroup: 'Ⅰ类', receivedDate: '2026-09-01', quantity: 100, unit: 'kg', verdict: '未复验', stopped: false },
  { id: 'B2', type: '焊丝', spec: '1.2', supplier: '乙', materialGroup: 'Ⅱ类', receivedDate: '2026-09-02', quantity: 100, unit: 'kg', verdict: '未复验', stopped: false },
]
const mkWeld = (id: string, group: Weld['group'], batchIds: string[], reportNo?: string): Weld => ({
  id, drawing: 'd', component: id, joint: 'j', method: 'GMAW', welder: 'w', qualification: 'q', qualificationValid: true,
  inspectionRatio: 20, requiredRatio: 20, status: '待检测', x: 0, y: 0, repairs: 0, defects: [], batchIds, group,
  reportNo, reportConclusion: reportNo ? '合格' : undefined, traceState: '正常',
})
const issues: ConsumableIssue[] = [
  { id: 'L1', date: '2026-09-10', batchId: 'B1', welder: 'w', workOrder: 'o', quantity: 10, unit: 'kg', weldIds: ['W1', 'W2', 'W3'] },
]
// W1 已出报告；W2 未报告在待执行计划；W3 未报告不在计划；W4 不涉及批号在待执行计划（应随组带回）
const welds: Weld[] = [
  mkWeld('W1', 'Ⅰ类', ['B1'], 'RPT-1'),
  mkWeld('W2', 'Ⅰ类', ['B1']),
  mkWeld('W3', 'Ⅱ类', ['B1']),
  mkWeld('W4', 'Ⅰ类', ['B2']),
  mkWeld('W5', 'Ⅲ类', []),
]
const plans: InspectionPlan[] = [
  { id: 'P-OPEN', date: '2026-10-08', method: 'UT', weldIds: ['W2', 'W4'], inspector: '陈', state: '待执行' },
  { id: 'P-RUN', date: '2026-10-05', method: 'UT', weldIds: ['W2'], inspector: '赵', state: '执行中' },
]
const snapshots: SignedSnapshot[] = [
  { id: 'S1', batchId: 'B1', versionLabel: 'v1', signedAt: 't', signer: '林', scope: 'x', weldIds: ['W1', 'W2'], revisions: [] },
]
function base(): TraceSlice {
  return JSON.parse(JSON.stringify({ batches, issues, welds: migrateCompatibility(welds), plans, snapshots, journal: [], cascades: [] }))
}

console.log('场景0 兼容迁移')
const mig = migrateCompatibility(welds)
check('缺批号焊缝 W5 标为待补录', mig.find((w) => w.id === 'W5')!.traceState === '待补录')
check('有批号焊缝不受影响', mig.find((w) => w.id === 'W1')!.traceState === '正常')

console.log('场景1 批号不合格：先停发')
let s = base()
const r1 = applyRegistration(s, { regNo: 'REG-1', time: '2026-10-05 09:00', keeper: '周敏', batchId: 'B1', verdict: '不合格', retestNo: 'RT-1' }, false)
check('登记成功', r1.ok)
check('B1 已停发', r1.batches.find((b) => b.id === 'B1')!.stopped === true)
check('结论写为不合格', r1.batches.find((b) => b.id === 'B1')!.verdict === '不合格')
check('台账一条已生效', r1.journal.length === 1 && r1.journal[0].status === '已生效' && r1.journal[0].appliedAt === '2026-10-05 09:00')

console.log('场景2 用过 B1 的焊缝：报告保留待复核')
const w1 = r1.welds.find((w) => w.id === 'W1')!
check('W1 标待复核', w1.traceState === '待复核')
check('W1 原报告结论保留', w1.reportNo === 'RPT-1' && w1.reportConclusion === '合格')
check('W1 原焊缝状态未改', w1.status === '待检测')
const w2 = r1.welds.find((w) => w.id === 'W2')!
check('未报告 W2 不打待复核', w2.traceState === '正常')
check('反向汇聚三条焊缝', weldsUsingBatch(s.issues, 'B1').join() === 'W1,W2,W3')

console.log('场景3 未开工计划失效，执行中不动')
const pOpen = r1.plans.find((p) => p.id === 'P-OPEN')!
const pRun = r1.plans.find((p) => p.id === 'P-RUN')!
check('待执行计划已失效', pOpen.state === '已失效' && !!pOpen.invalidReason)
check('执行中计划保持执行中', pRun.state === '执行中')
check('失效记录含1个计划', r1.cascades[0].invalidPlanIds.length === 1)

console.log('场景4 按材料组别重算比例并派生替代计划')
const replI = r1.plans.find((p) => p.id === 'IP-RC-B1-Ⅰ')!
const replII = r1.plans.find((p) => p.id === 'IP-RC-B1-Ⅱ')!
check('Ⅰ类重算计划生成', !!replI && replI.recalculated && replI.ratio === 100)
check('Ⅰ类含受影响 W2 并带回同组 W4', replI && replI.weldIds.includes('W2') && replI.weldIds.includes('W4'))
check('Ⅰ类不含已报告 W1', replI && !replI.weldIds.includes('W1'))
check('Ⅱ类重算计划含 W3', replII && replII.weldIds.includes('W3') && replII.ratio! >= 50)
check('失效计划指向替代计划', pOpen.replacedBy === 'IP-RC-B1-Ⅰ')

console.log('场景5 已签字快照不改原件，只派生待复核修订')
const snap = r1.snapshots.find((x) => x.id === 'S1')!
check('原快照签字信息不变', snap.signer === '林' && snap.versionLabel === 'v1')
check('派生一条待复核修订', snap.revisions.length === 1 && snap.revisions[0].status === '待复核' && snap.revisions[0].regNo === 'REG-1')

console.log('场景6 并发：后到看到冲突')
const s2: TraceSlice = { ...r1, batches: r1.batches, welds: r1.welds, plans: r1.plans, snapshots: r1.snapshots, cascades: r1.cascades, journal: r1.journal, issues }
const r2 = applyRegistration(s2, { regNo: 'REG-2', time: '2026-10-05 09:00:30', keeper: '吴琼', batchId: 'B1', verdict: '合格', retestNo: 'RT-1' }, false)
check('后到登记被判失败/冲突', !r2.ok && r2.reason === 'conflict')
check('冲突条目登记为失败(结论冲突)', r2.journal.find((e) => e.regNo === 'REG-2')!.failureKind === '结论冲突')
check('原处置不变：仍停发', r2.batches.find((b) => b.id === 'B1')!.stopped === true)
check('不重复追加级联（仍1条）', r2.cascades.length === 1)

console.log('场景7 登记失败（网络超时）：不生效，凭登记号重放幂等')
let s3 = base()
const f1 = applyRegistration(s3, { regNo: 'REG-F', time: 't1', keeper: '周敏', batchId: 'B1', verdict: '不合格', retestNo: 'RT-9' }, true)
check('网络失败 ok=false', !f1.ok)
check('失败台账保留原因', f1.journal[0].status === '登记失败' && f1.journal[0].failureKind === '网络超时')
check('失败未停发', f1.batches.find((b) => b.id === 'B1')!.stopped === false)
check('失败不产生级联', f1.cascades.length === 0)
// 模拟 reducer 重放：用失败条目重新 applyRegistration(fail=false)
s3 = { ...s3, journal: f1.journal, batches: f1.batches }
const rp1 = applyRegistration(s3, { regNo: 'REG-F', time: 't2', keeper: '周敏', batchId: 'B1', verdict: '不合格', retestNo: 'RT-9' }, false)
check('重放生效并停发', rp1.ok && rp1.batches.find((b) => b.id === 'B1')!.stopped === true)
check('重放后台账仅一条（按登记号 upsert）', rp1.journal.filter((e) => e.regNo === 'REG-F').length === 1)
check('重放产生1条级联', rp1.cascades.length === 1)
// 再次重放：已生效登记号必须被忽略
const s4: TraceSlice = { ...s3, journal: rp1.journal, batches: rp1.batches, welds: rp1.welds, plans: rp1.plans, snapshots: rp1.snapshots, cascades: rp1.cascades }
const rp2 = applyRegistration(s4, { regNo: 'REG-F', time: 't3', keeper: '周敏', batchId: 'B1', verdict: '不合格', retestNo: 'RT-9' }, false)
check('重复重放不重复追加（级联仍1条）', rp2.cascades.length === 1 && rp2.reason === 'already-applied')

console.log('场景8 合格结论不停发、无级联')
const s5 = base()
const ok1 = applyRegistration(s5, { regNo: 'REG-G', time: 't', keeper: '周敏', batchId: 'B2', verdict: '合格', retestNo: 'RT-G' }, false)
check('合格登记成功', ok1.ok && ok1.batches.find((b) => b.id === 'B2')!.stopped === false)
check('合格无级联记录', ok1.cascades.length === 0)

console.log(`\n结果：${pass} 通过，${fail} 失败`)
if (fail) process.exit(1)
