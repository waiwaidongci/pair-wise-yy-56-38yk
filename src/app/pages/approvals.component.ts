import { Component, inject } from '@angular/core'
import { CommonModule } from '@angular/common'
import { Store } from '@ngrx/store'
import { ButtonModule } from 'primeng/button'
import { TimelineModule } from 'primeng/timeline'
import { TagModule } from 'primeng/tag'
import { WeldState } from '../store/weld.reducer'
import { WeldGraphqlService } from '../services/weld-graphql.service'
import * as A from '../store/weld.actions'

@Component({
  selector:'app-approvals', standalone:true, imports:[CommonModule,ButtonModule,TimelineModule,TagModule],
  template:`
    <main class="page"><div class="page-head"><div><p class="eyebrow">签字、版本与追溯</p><h1>逐段确认与锁定</h1><p>审核人按焊缝或检测计划确认、退回或要求复检；锁定后生成只读版本快照。</p></div><p-button [label]="state.locked ? '已锁定' : '签字锁定检测批次'" icon="pi pi-lock" [disabled]="state.locked" (onClick)="lock()" /></div>
      <div class="grid-2"><section class="card"><h2 class="panel-title">待审核焊缝</h2><div class="review" *ngFor="let weld of reviewWelds"><div><b>{{weld.id}} · {{weld.component}}</b><small>{{weld.method}} · {{weld.welder}} · 返修 {{weld.repairs}} 次</small></div><p-tag [value]="weld.status" [severity]="weld.status === '待复检' ? 'warn' : 'danger'" /><p-button label="要求复检" severity="danger" text size="small" /><p-button label="确认合格" size="small" (onClick)="confirm(weld.id)" /></div><p-button label="导出质量追溯包" icon="pi pi-file-export" severity="secondary" styleClass="w-full" /></section>
      <aside class="card"><h2 class="panel-title">完整审计时间线</h2><p-timeline [value]="state.audit" align="left"><ng-template #content let-event><div class="audit"><div><b>{{event.actor}} · {{event.action}}</b><span>{{event.time}}</span></div><p><strong>{{event.target}}</strong> {{event.detail}}</p></div></ng-template></p-timeline></aside></div>
      <section class="card mt-4"><h2 class="panel-title">签字锁定快照与待复核修订</h2><p class="hint">批号复验不合格不改原签字快照，只从原快照派生“待复核”修订；原版本始终只读可查。</p><div class="snapshot-grid"><div class="snap-card" *ngFor="let s of state.snapshots"><div class="snap-head"><b>{{s.id}} · {{s.versionLabel}}</b><p-tag value="已签字锁定" severity="success" /></div><small>{{s.signer}} · {{s.signedAt}} · 批号 {{s.batchId}}</small><p class="scope">{{s.scope}} · 覆盖 {{s.weldIds.length}} 条焊缝</p><div class="rev" *ngFor="let r of s.revisions"><div class="rev-head"><p-tag value="待复核修订" severity="danger" /><b>{{r.id}}</b></div><p>{{r.reason}}</p><small>派生时间 {{r.derivedAt}} · 触发登记号 {{r.regNo}}</small></div><p class="muted" *ngIf="!s.revisions.length">暂无派生修订，原快照为最新有效版本。</p></div></div></section>
    </main>
  `,
  styles:[`.review{display:grid;grid-template-columns:1fr auto auto auto;gap:8px;align-items:center;padding:12px 0;border-bottom:1px solid #edf0f5}.review b,.review small{display:block}.review small{color:#7a8798;margin-top:4px}.audit{background:#fff;border:1px solid #e1e7ef;border-radius:6px;padding:10px}.audit>div{display:flex;justify-content:space-between}.audit span{color:#7a8798;font-size:12px}.audit p{margin:5px 0 0;font-size:13px}.hint{font-size:12px;color:#667085;margin:0 0 12px}.muted{color:#7a8798;font-size:12px}.snapshot-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}.snap-card{border:1px solid #e1e7ef;border-radius:7px;padding:13px;background:#f8fafc}.snap-head{display:flex;justify-content:space-between;align-items:center;gap:8px}.snap-card>small{color:#7a8798;display:block;margin:6px 0}.scope{font-size:13px;margin:6px 0 10px}.rev{background:#fff;border-left:3px solid #e11d48;border-radius:0 5px 5px 0;padding:9px;margin-top:8px}.rev-head{display:flex;gap:8px;align-items:center}.rev p{margin:6px 0;font-size:13px}.rev small{color:#94a3b8}.mt-4{margin-top:16px}@media(max-width:760px){.review{grid-template-columns:1fr auto}.review .p-button{width:100%}}`],
})
export class ApprovalsComponent {
  private readonly store = inject(Store<{ welds: WeldState }>)
  private readonly api = inject(WeldGraphqlService)
  state!: WeldState
  constructor() {
    this.store.select('welds').subscribe((state) => this.state = state)
    this.api.load().subscribe((d) => {
      if (!d.batches?.length) return
      this.store.dispatch(A.loadWeldsSuccess({ welds: d.welds, plans: d.plans, batches: d.batches, issues: d.issues, snapshots: d.snapshots, journal: d.journal }))
    })
  }
  get reviewWelds() { return (this.state?.welds ?? []).filter((item) => ['待复检','返修中','待检测'].includes(item.status)) }
  confirm(id: string) { this.store.dispatch(A.advanceWeld({ id, status:'合格' })) }
  lock() { this.store.dispatch(A.lockBaseline()) }
}
