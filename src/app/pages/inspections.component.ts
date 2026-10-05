import { Component, inject } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { Store } from '@ngrx/store'
import { TableModule } from 'primeng/table'
import { TagModule } from 'primeng/tag'
import { ButtonModule } from 'primeng/button'
import { DialogModule } from 'primeng/dialog'
import { InputTextModule } from 'primeng/inputtext'
import { TextareaModule } from 'primeng/textarea'
import { SelectButtonModule } from 'primeng/selectbutton'
import { WeldState } from '../store/weld.reducer'
import { WeldGraphqlService } from '../services/weld-graphql.service'
import { traceTagSeverity } from '../store/trace.selectors'
import * as A from '../store/weld.actions'

@Component({
  selector:'app-inspections', standalone:true, imports:[CommonModule,FormsModule,TableModule,TagModule,ButtonModule,DialogModule,InputTextModule,TextareaModule,SelectButtonModule],
  template:`
    <main class="page"><div class="page-head"><div><p class="eyebrow">NDT / 返修闭环</p><h1>检测计划与返修</h1><p>检测结果绑定缺陷位置、等级、照片、报告和返修方案；失败与复检不可无痕跳过。</p></div><p-button label="新增检测结果" icon="pi pi-plus" (onClick)="dialog = true" /></div>
      <div class="grid-2"><section class="card"><h2 class="panel-title">批量检测计划</h2><p class="hint">批号不合格时，未开工计划立即失效（红），并按材料组别派生提级重算计划（绿）。</p><p-table [value]="state.plans" [paginator]="true" [rows]="8"><ng-template #header><tr><th>计划编号</th><th>日期 / 组别</th><th>方法</th><th>焊缝</th><th>检测人</th><th>状态</th></tr></ng-template><ng-template #body let-plan><tr [class.invalid]="plan.state === '已失效'" [class.recalc]="plan.recalculated"><td>{{plan.id}}<small class="block danger" *ngIf="plan.invalidReason">{{plan.invalidReason}}<span *ngIf="plan.replacedBy">，重算 {{plan.replacedBy}}</span></small></td><td>{{plan.date}}<small class="block muted" *ngIf="plan.group">{{plan.group}}<span *ngIf="plan.ratio"> · 比例 {{plan.ratio}}%</span></small></td><td>{{plan.method}}</td><td>{{plan.weldIds.length}} 条</td><td>{{plan.inspector}}</td><td><p-tag [value]="plan.state" [severity]="plan.state === '已完成' ? 'success' : plan.state === '已失效' ? 'danger' : plan.state === '执行中' ? 'info' : 'warn'" /></td></tr></ng-template></p-table></section>
      <aside class="card"><h2 class="panel-title">返修状态流转</h2><p class="hint">已出报告焊缝在批号不合格时保留结论、标“待复核”。</p><div class="step" *ngFor="let weld of repairWelds"><div><b>{{weld.id}} · {{weld.component}}</b><small>{{weld.defects.length}} 个缺陷 · 已返修 {{weld.repairs}} 次 · {{weld.batchIds.join('、') || '批号待补录'}}</small></div><p-tag [value]="weld.status" severity="warn" /><p-tag [value]="weld.traceState" [severity]="traceTagSeverity(weld.traceState)" /><p-selectbutton [options]="['返修中','待复检','合格']" [ngModel]="weld.status" (ngModelChange)="advance(weld.id,$event)" /></div><p-button label="提交质量负责人审核" icon="pi pi-send" styleClass="w-full" /></aside></div>
      <section class="card mt-4"><h2 class="panel-title">检测结果与缺陷明细</h2><p-table [value]="defects" [paginator]="true" [rows]="8"><ng-template #header><tr><th>缺陷编号</th><th>焊缝</th><th>位置 / 长度</th><th>类型 / 等级</th><th>检测方法</th><th>报告</th><th>处置</th></tr></ng-template><ng-template #body let-item><tr><td>{{item.defect.id}}</td><td>{{item.weld.id}}</td><td>{{item.defect.position}}% · {{item.defect.length}}mm</td><td>{{item.defect.type}} · {{item.defect.level}}</td><td>{{item.defect.method}}</td><td>{{item.defect.report}}</td><td><p-tag *ngIf="item.weld.traceState === '待复核'" value="结论待复核" severity="danger" /><p-button label="退回方案" severity="danger" size="small" text /><p-button label="确认复检" size="small" (onClick)="advance(item.weld.id,'合格')" /></td></tr></ng-template></p-table></section>
      <p-dialog header="录入检测结果" [(visible)]="dialog" [modal]="true" [style]="{width:'620px'}"><div class="form"><label>焊缝编号</label><input pInputText [(ngModel)]="form.weldId" /><label>检测方法</label><select [(ngModel)]="form.method"><option>UT</option><option>MT</option><option>PT</option></select><label>缺陷位置（0–100%）</label><input pInputText type="number" [(ngModel)]="form.position" /><label>缺陷类型与等级</label><input pInputText [(ngModel)]="form.type" placeholder="如：未熔合 / Ⅲ级" /><label>报告编号与说明</label><textarea pTextarea [(ngModel)]="form.report" rows="4"></textarea></div><ng-template #footer><p-button label="取消" severity="secondary" (onClick)="dialog=false" /><p-button label="提交结果" [disabled]="!form.weldId || !form.report" (onClick)="submit()" /></ng-template></p-dialog>
    </main>
  `,
  styles:[`.step{display:grid;grid-template-columns:1fr auto;gap:9px;padding:12px 0;border-bottom:1px solid #edf0f5}.step>div,.step small{display:block}.step small{color:#7a8798;margin-top:4px}.step p-selectbutton{grid-column:1/-1}.hint{font-size:12px;color:#667085;margin:0 0 10px}.invalid{background:#fef2f2}.recalc{background:#f0fdf4}.muted{color:#7a8798;font-size:12px}.danger{color:#dc2626}.form{display:grid;gap:9px}.form input,.form select,.form textarea{padding:9px;border:1px solid #cbd5e1;border-radius:6px;width:100%}.mt-3{margin-top:12px}.mt-4{margin-top:16px}`],
})
export class InspectionsComponent {
  private readonly store = inject(Store<{ welds: WeldState }>)
  private readonly api = inject(WeldGraphqlService)
  state!: WeldState
  dialog = false
  traceTagSeverity = traceTagSeverity
  form = { weldId:'W-109', method:'UT', position:42, type:'未熔合 / Ⅲ级', report:'UT-2026-0929-08；按 NB/T 47013.3 评定。' }
  constructor() {
    this.store.select('welds').subscribe((state) => this.state = state)
    this.api.load().subscribe((d) => {
      if (!d.batches?.length) return
      this.store.dispatch(A.loadWeldsSuccess({ welds: d.welds, plans: d.plans, batches: d.batches, issues: d.issues, snapshots: d.snapshots, journal: d.journal }))
    })
  }
  get repairWelds() { return (this.state?.welds ?? []).filter((item) => ['返修中','待复检'].includes(item.status)) }
  get defects() { return (this.state?.welds ?? []).flatMap((weld) => weld.defects.map((defect) => ({ weld, defect }))) }
  advance(id: string, status: string) { this.store.dispatch(A.advanceWeld({ id, status: status as never })) }
  submit() { this.store.dispatch(A.advanceWeld({ id:this.form.weldId, status:'返修中' })); this.dialog = false }
}
