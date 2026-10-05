import { Component, inject } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { Store } from '@ngrx/store'
import { TableModule } from 'primeng/table'
import { TagModule } from 'primeng/tag'
import { ButtonModule } from 'primeng/button'
import { DialogModule } from 'primeng/dialog'
import { InputTextModule } from 'primeng/inputtext'
import { SelectModule } from 'primeng/select'
import { MessageModule } from 'primeng/message'
import { WeldState } from '../store/weld.reducer'
import * as A from '../store/weld.actions'
import type { BatchConclusion, MaterialGroup, WeldingMaterial, Weld } from '../types'

const GROUPS: MaterialGroup[] = ['Fe-1 碳钢', 'Fe-3 低合金钢', 'Fe-8 不锈钢']
const CONCLUSIONS: BatchConclusion[] = ['合格', '不合格', '待复验']

@Component({
  selector: 'app-materials', standalone: true,
  imports: [CommonModule, FormsModule, TableModule, TagModule, ButtonModule, DialogModule, InputTextModule, SelectModule, MessageModule],
  template: `
    <main class="page">
      <div class="page-head">
        <div>
          <p class="eyebrow">焊材入库、领用与批号反向追溯</p>
          <h1>焊材追溯与复验结论</h1>
          <p>焊材按批号入库发放，一个批号可落在多条焊缝上。复验结论不合格时先停发，再反向列出用过它的焊缝。</p>
        </div>
        <div class="head-actions">
          <p-button label="入库登记" icon="pi pi-plus" (onClick)="openRegister()" />
          <p-button label="领用登记" icon="pi pi-sign-out" severity="secondary" (onClick)="openRequisition()" />
        </div>
      </div>

      <p-message *ngIf="state.conflict" severity="error" styleClass="conflict-msg"
        [text]="'批号 ' + state.conflict.batchNo + ' 复验结论冲突：库管员 ' + state.conflict.actor + ' 基于过期版本 v' + state.conflict.expectedVersion + ' 提交，当前 v' + state.conflict.actualVersion + ' 已生效（先到生效），本次提交未生效。'" />

      <div class="grid-4">
        <article class="card metric"><span>在库批号</span><strong>{{ inStockCount }}</strong><small>可正常发放</small></article>
        <article class="card metric"><span>停发批号</span><strong class="danger">{{ stoppedCount }}</strong><small>复验不合格 · 禁止领用</small></article>
        <article class="card metric"><span>待复核焊缝</span><strong class="warning">{{ reviewCount }}</strong><small>批号追溯命中 · 结论保留</small></article>
        <article class="card metric"><span>待补录焊缝</span><strong class="danger">{{ backfillCount }}</strong><small>存量数据缺焊材批号</small></article>
      </div>

      <div class="grid-2">
        <section class="card">
          <h2 class="panel-title">焊材入库台账（按批号）</h2>
          <p-table [value]="state.materials" [paginator]="true" [rows]="6">
            <ng-template #header><tr><th>批号</th><th>名称 / 规格</th><th>材料组别</th><th>登记号</th><th>库管员</th><th>数量</th><th>复验结论</th><th>状态 / 版本</th><th>操作</th></tr></ng-template>
            <ng-template #body let-m>
              <tr [class.stopped]="m.status === '停发'">
                <td><b>{{ m.batchNo }}</b></td>
                <td>{{ m.name }}<small class="block">{{ m.spec }}</small></td>
                <td>{{ m.group }}</td>
                <td><small>{{ m.regNo }}</small></td>
                <td>{{ m.keeper }}</td>
                <td>{{ m.quantity }} {{ m.unit }}</td>
                <td><p-tag [value]="m.conclusion" [severity]="m.conclusion === '合格' ? 'success' : m.conclusion === '不合格' ? 'danger' : 'warn'" /></td>
                <td><p-tag [value]="m.status" [severity]="m.status === '停发' ? 'danger' : 'info'" /> <small class="block">v{{ m.version }}</small></td>
                <td class="ops">
                  <p-button label="领用" size="small" [disabled]="m.status === '停发'" (onClick)="openRequisition(m.batchNo)" />
                  <p-button label="复验" size="small" severity="secondary" (onClick)="openReinspection(m.batchNo)" />
                  <p-button label="库管A/B 同时提交" size="small" severity="contrast" [disabled]="m.status === '停发'" (onClick)="concurrentSubmit(m.batchNo)" />
                </td>
              </tr>
            </ng-template>
          </p-table>
        </section>

        <aside class="card">
          <h2 class="panel-title">批号反向追溯</h2>
          <p-select [options]="batchOptions" [(ngModel)]="traceBatch" placeholder="选择批号" styleClass="w-full" />
          <p class="trace-hint">领用记录 {{ traceWelds.length }} 条焊缝使用该批号</p>
          <div class="trace-list" *ngIf="traceWelds.length; else noTrace">
            <div class="trace-item" *ngFor="let w of traceWelds">
              <div><b>{{ w.id }}</b> · {{ w.component }}<small class="block">{{ w.materialGroup }} · {{ w.method }} · {{ w.welder }}</small></div>
              <p-tag [value]="disposition(w)" [severity]="w.reviewStatus === '待复核' ? 'warn' : 'info'" />
            </div>
          </div>
          <ng-template #noTrace><p class="muted">该批号暂无焊缝领用记录。</p></ng-template>
        </aside>
      </div>

      <p-table [value]="state.requisitions" [paginator]="true" [rows]="6">
        <ng-template #header><tr><th>领用单号</th><th>批号</th><th>焊缝</th><th>数量</th><th>领用人</th><th>时间</th></tr></ng-template>
        <ng-template #body let-r>
          <tr [class.stopped]="isStopped(r.batchNo)">
            <td>{{ r.id }}</td>
            <td><b>{{ r.batchNo }}</b> <p-tag *ngIf="isStopped(r.batchNo)" value="停发" severity="danger" /></td>
            <td>{{ r.weldId }}</td>
            <td>{{ r.quantity }}</td>
            <td>{{ r.actor }}</td>
            <td><small>{{ r.time }}</small></td>
          </tr>
        </ng-template>
      </p-table>

      <div class="grid-2">
        <section class="card">
          <h2 class="panel-title">存量待补录焊缝（兼容规则）</h2>
          <p class="muted">已有数据中缺焊材批号的焊缝，按兼容规则标记待补录，补录后才允许列入检测计划。</p>
          <div class="trace-list" *ngIf="backfillWelds.length; else allFilled">
            <div class="trace-item" *ngFor="let w of backfillWelds">
              <div><b>{{ w.id }}</b> · {{ w.component }}<small class="block">{{ w.materialGroup }} · {{ w.status }}</small></div>
              <p-button label="补录批号" size="small" (onClick)="openBackfill(w.id)" />
            </div>
          </div>
          <ng-template #allFilled><p class="muted">存量焊缝批号已补录完整。</p></ng-template>
        </section>

        <aside class="card">
          <h2 class="panel-title">签字快照与待复核修订</h2>
          <div class="snap" *ngFor="let s of state.snapshots">
            <div>
              <b>{{ s.id }}</b>
              <p-tag [value]="s.type" [severity]="s.type === '原始锁定' ? 'success' : 'warn'" />
              <small class="block">v{{ s.version }} · {{ s.lockedAt }} · {{ s.actor }}</small>
              <small class="block muted" *ngIf="s.derivedFrom">派生自 {{ s.derivedFrom }} · {{ s.reason }}</small>
              <small class="block">{{ s.summary }}</small>
            </div>
          </div>
          <p class="muted" *ngIf="!state.snapshots.length">尚未签字锁定。锁定后提交不合格结论，原快照不修改，只派生待复核修订。</p>
        </aside>
      </div>

      <div class="grid-2">
        <section class="card">
          <h2 class="panel-title">登记号恢复与幂等重放</h2>
          <p class="muted">入库登记失败后按登记号恢复；同一登记号重放不重复追加库存。</p>
          <div class="replay-row">
            <input pInputText [(ngModel)]="replayRegNo" placeholder="登记号，如 DJ-2026-0511-03" />
            <p-button label="按登记号重放" icon="pi pi-replay" (onClick)="replay()" />
          </div>
          <p-message *ngIf="replayMsg" [severity]="replayMsg.indexOf('未重复') >= 0 ? 'success' : 'info'" [text]="replayMsg" />
        </section>

        <aside class="card">
          <h2 class="panel-title">最近追溯动态</h2>
          <div class="audit-line" *ngFor="let e of state.audit.slice(0, 8)">
            <span class="muted">{{ e.time }}</span><b>{{ e.actor }} · {{ e.action }}</b><span>{{ e.target }}</span><p>{{ e.detail }}</p>
          </div>
        </aside>
      </div>

      <p-dialog header="焊材入库登记" [(visible)]="regDialog" [modal]="true" [style]="{ width: '560px' }">
        <div class="form">
          <label>批号</label><input pInputText [(ngModel)]="regForm.batchNo" placeholder="如 H08A-2026-0928" />
          <label>名称型号</label><input pInputText [(ngModel)]="regForm.name" placeholder="如 H08A 埋弧焊丝" />
          <label>材料组别</label>
          <p-select [options]="groupOptions" [(ngModel)]="regForm.group" styleClass="w-full" />
          <label>规格</label><input pInputText [(ngModel)]="regForm.spec" placeholder="如 Φ4.0" />
          <label>数量</label><input pInputText type="number" [(ngModel)]="regForm.quantity" />
          <label>库管员</label><input pInputText [(ngModel)]="regForm.keeper" />
        </div>
        <ng-template #footer>
          <p-button label="取消" severity="secondary" (onClick)="regDialog = false" />
          <p-button label="提交登记" (onClick)="submitRegister()" />
        </ng-template>
      </p-dialog>

      <p-dialog header="焊材领用登记" [(visible)]="reqDialog" [modal]="true" [style]="{ width: '560px' }">
        <div class="form">
          <label>焊材批号</label>
          <p-select [options]="batchOptions" [(ngModel)]="reqForm.batchNo" placeholder="选择批号（停发批号不可选）" styleClass="w-full" />
          <label>领用焊缝</label>
          <p-select [options]="weldOptions" [(ngModel)]="reqForm.weldId" placeholder="选择焊缝" styleClass="w-full" />
          <label>数量 (kg)</label><input pInputText type="number" [(ngModel)]="reqForm.quantity" />
          <label>领用人</label><input pInputText [(ngModel)]="reqForm.actor" />
        </div>
        <ng-template #footer>
          <p-button label="取消" severity="secondary" (onClick)="reqDialog = false" />
          <p-button label="确认领用" (onClick)="submitRequisition()" />
        </ng-template>
      </p-dialog>

      <p-dialog header="提交复验结论" [(visible)]="reinDialog" [modal]="true" [style]="{ width: '520px' }">
        <div class="form">
          <label>批号</label><input pInputText [(ngModel)]="reinForm.batchNo" readonly />
          <label>复验结论</label>
          <p-select [options]="conclusionOptions" [(ngModel)]="reinForm.conclusion" styleClass="w-full" />
          <label>提交库管员</label><input pInputText [(ngModel)]="reinForm.actor" />
          <p class="muted">提交时携带当前版本号；若另一名库管员已先行提交，后到的提交将被判定冲突、不生效。</p>
        </div>
        <ng-template #footer>
          <p-button label="取消" severity="secondary" (onClick)="reinDialog = false" />
          <p-button label="提交结论" severity="danger" (onClick)="submitReinspection()" />
        </ng-template>
      </p-dialog>

      <p-dialog header="存量焊缝补录批号" [(visible)]="backfillDialog" [modal]="true" [style]="{ width: '520px' }">
        <div class="form">
          <label>焊缝</label><input pInputText [(ngModel)]="backfillForm.weldId" readonly />
          <label>补录焊材批号</label>
          <p-select [options]="batchOptions" [(ngModel)]="backfillForm.batchNo" placeholder="选择在库批号" styleClass="w-full" />
        </div>
        <ng-template #footer>
          <p-button label="取消" severity="secondary" (onClick)="backfillDialog = false" />
          <p-button label="确认补录" (onClick)="submitBackfill()" />
        </ng-template>
      </p-dialog>
    </main>
  `,
  styles: [`
    .head-actions { display: flex; gap: 8px; }
    .conflict-msg { margin-bottom: 12px; }
    .block { display: block; color: #7a8798; margin-top: 3px; }
    .stopped { background: #fff1f2; }
    .ops { white-space: nowrap; }
    .ops .p-button { margin-right: 4px; }
    .trace-hint { color: #7a8798; font-size: 13px; margin: 10px 0 6px; }
    .trace-list { display: grid; gap: 8px; }
    .trace-item { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 10px; border: 1px solid #e1e7ef; border-radius: 6px; }
    .trace-item b, .trace-item small { display: block; }
    .muted { color: #7a8798; font-size: 13px; }
    .snap { padding: 12px; border: 1px solid #e1e7ef; border-radius: 6px; margin-bottom: 8px; }
    .snap b, .snap small { display: inline-block; margin-right: 6px; }
    .replay-row { display: flex; gap: 8px; margin: 10px 0; }
    .replay-row input { flex: 1; padding: 9px; border: 1px solid #cbd5e1; border-radius: 6px; }
    .audit-line { display: grid; grid-template-columns: 90px 1fr 1fr; gap: 8px; align-items: baseline; padding: 8px 0; border-bottom: 1px solid #edf0f5; font-size: 13px; }
    .audit-line p { grid-column: 1 / -1; margin: 2px 0 0; color: #475467; }
    .mt-4 { margin-top: 16px; }
    .form { display: grid; gap: 9px; }
    .form label { font-size: 13px; color: #475467; }
    .form input { padding: 9px; border: 1px solid #cbd5e1; border-radius: 6px; width: 100%; }
  `],
})
export class MaterialsComponent {
  private readonly store = inject(Store<{ welds: WeldState }>)
  state!: WeldState

  regDialog = false
  reqDialog = false
  reinDialog = false
  backfillDialog = false

  regForm = { batchNo: '', name: '', group: 'Fe-1 碳钢' as MaterialGroup, spec: '', quantity: 100, keeper: '周敏' }
  reqForm = { batchNo: '', weldId: '', quantity: 50, actor: '王凯' }
  reinForm = { batchNo: '', conclusion: '不合格' as BatchConclusion, actor: '吴芳' }
  backfillForm = { weldId: '', batchNo: '' }

  traceBatch = 'H08A-2026-0511'
  replayRegNo = ''
  replayMsg = ''
  lastMaterial?: WeldingMaterial

  readonly groupOptions = GROUPS
  readonly conclusionOptions = CONCLUSIONS

  constructor() {
    this.store.select('welds').subscribe((s) => this.state = s)
  }

  get batchOptions() {
    return this.state.materials.map((m) => ({ label: `${m.batchNo}${m.status === '停发' ? '（停发）' : ''}`, value: m.batchNo, disabled: m.status === '停发' }))
  }
  get weldOptions() {
    return this.state.welds.map((w) => ({ label: `${w.id} · ${w.component}`, value: w.id }))
  }
  get inStockCount() { return this.state.materials.filter((m) => m.status === '在库').length }
  get stoppedCount() { return this.state.materials.filter((m) => m.status === '停发').length }
  get reviewCount() { return this.state.welds.filter((w) => w.reviewStatus === '待复核').length }
  get backfillCount() { return this.state.welds.filter((w) => w.reviewStatus === '待补录').length }
  get traceWelds(): Weld[] { return this.state.welds.filter((w) => w.batchNos.includes(this.traceBatch)) }
  get backfillWelds(): Weld[] { return this.state.welds.filter((w) => w.reviewStatus === '待补录') }

  isStopped(batchNo: string) { return this.state.materials.find((m) => m.batchNo === batchNo)?.status === '停发' }

  disposition(w: Weld): string {
    const hasReport = w.defects.length > 0 || w.status === '合格' || w.status === '已关闭'
    if (hasReport) return '已出报告 · 结论保留 · 标待复核'
    const invalid = this.state.plans.some((p) => p.state === '已失效' && p.weldIds.includes(w.id))
    if (invalid) return `计划已失效 · 比例按 ${w.materialGroup} 重算为 ${w.requiredRatio}%`
    return '待复核 · 等待处置'
  }

  openRegister() { this.regForm = { batchNo: '', name: '', group: 'Fe-1 碳钢', spec: '', quantity: 100, keeper: '周敏' }; this.regDialog = true }
  openRequisition(batchNo = '') { this.reqForm = { batchNo, weldId: '', quantity: 50, actor: '王凯' }; this.reqDialog = true }
  openReinspection(batchNo: string) { this.reinForm = { batchNo, conclusion: '不合格', actor: '吴芳' }; this.reinDialog = true }
  openBackfill(weldId: string) { this.backfillForm = { weldId, batchNo: '' }; this.backfillDialog = true }

  submitRegister() {
    const regNo = `DJ-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 900 + 100)}`
    const material: WeldingMaterial = {
      id: `M-${Date.now()}`, batchNo: this.regForm.batchNo, name: this.regForm.name, group: this.regForm.group,
      spec: this.regForm.spec, quantity: this.regForm.quantity, unit: 'kg', regNo,
      regTime: new Date().toLocaleString('zh-CN'), keeper: this.regForm.keeper, status: '在库', conclusion: '待复验', version: 1,
    }
    this.store.dispatch(A.registerMaterial({ material }))
    this.lastMaterial = material
    this.replayRegNo = regNo
    this.replayMsg = ''
    this.regDialog = false
  }

  submitRequisition() {
    if (!this.reqForm.batchNo || !this.reqForm.weldId) return
    this.store.dispatch(A.requisitionMaterial({ batchNo: this.reqForm.batchNo, weldId: this.reqForm.weldId, quantity: this.reqForm.quantity, actor: this.reqForm.actor }))
    this.reqDialog = false
  }

  submitReinspection() {
    const mat = this.state.materials.find((m) => m.batchNo === this.reinForm.batchNo)
    if (!mat) return
    this.store.dispatch(A.submitReinspection({ batchNo: mat.batchNo, conclusion: this.reinForm.conclusion, actor: this.reinForm.actor, expectedVersion: mat.version }))
    this.reinDialog = false
  }

  /** 两名库管同时提交同一批号结论：携带相同版本号，先到生效、后到见冲突 */
  concurrentSubmit(batchNo: string) {
    const mat = this.state.materials.find((m) => m.batchNo === batchNo)
    if (!mat || mat.status === '停发') return
    const expectedVersion = mat.version
    this.store.dispatch(A.submitReinspection({ batchNo, conclusion: '不合格', actor: '库管员A', expectedVersion }))
    this.store.dispatch(A.submitReinspection({ batchNo, conclusion: '不合格', actor: '库管员B', expectedVersion }))
  }

  submitBackfill() {
    if (!this.backfillForm.batchNo) return
    this.store.dispatch(A.backfillMaterial({ batchNo: this.backfillForm.batchNo, weldId: this.backfillForm.weldId, actor: '库管员' }))
    this.backfillDialog = false
  }

  /** 登记失败后按登记号恢复：同一登记号重放不重复追加 */
  replay() {
    if (!this.lastMaterial || this.lastMaterial.regNo !== this.replayRegNo) {
      this.replayMsg = '未找到该登记号对应的入库记录，无法恢复'
      return
    }
    const exists = this.state.materials.some((m) => m.regNo === this.replayRegNo)
    this.store.dispatch(A.registerMaterial({ material: { ...this.lastMaterial } }))
    this.replayMsg = exists ? '登记号已存在 → 按登记号恢复，重放未重复追加（幂等）' : '登记成功（首次提交）'
  }
}
