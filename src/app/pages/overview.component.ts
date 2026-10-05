import { Component, OnInit, inject } from '@angular/core'
import { CommonModule } from '@angular/common'
import { Store } from '@ngrx/store'
import { TableModule } from 'primeng/table'
import { TagModule } from 'primeng/tag'
import { ButtonModule } from 'primeng/button'
import { SelectModule } from 'primeng/select'
import { FormsModule } from '@angular/forms'
import { WeldGraphqlService } from '../services/weld-graphql.service'
import { WeldState } from '../store/weld.reducer'
import { traceTagSeverity } from '../store/trace.selectors'
import * as A from '../store/weld.actions'
import type { Weld } from '../types'

@Component({
  selector:'app-overview', standalone:true, imports:[CommonModule,TableModule,TagModule,ButtonModule,SelectModule,FormsModule],
  template:`
    <main class="page"><div class="page-head"><div><p class="eyebrow">焊缝、资质、批号与检测比例</p><h1>焊缝台账总览</h1><p>焊缝绑定焊材批号，支持从批号反向追溯；批号不合格时已报告焊缝保留结论标待复核，历史缺批号数据标待补录。</p></div><p-button label="批量导入焊缝" icon="pi pi-upload" severity="secondary" /></div>
      <div class="grid-4"><article class="card metric"><span>焊缝总数</span><strong>{{state.welds.length}}</strong><small>已建地图定位 {{state.welds.length}} 条</small></article><article class="card metric"><span>待检测 / 返修</span><strong class="warning">{{pending}}</strong><small>{{state.plans.length}} 个检测计划</small></article><article class="card metric"><span>待复核 / 待补录</span><strong class="danger">{{tracePending}}</strong><small>批号不合格或历史缺批号</small></article><article class="card metric"><span>版本快照</span><strong>v{{state.version}}</strong><small>{{state.locked ? '已签字锁定' : '可继续修改'}}</small></article></div>
      <div class="grid-2"><section class="card"><div class="toolbar"><p-select [options]="statusOptions" [(ngModel)]="filter" (ngModelChange)="applyFilter($event)" placeholder="筛选追溯状态" styleClass="w-full md:w-40" /><span class="spacer"></span><p-button label="导出焊缝台账" icon="pi pi-file-excel" severity="secondary" /></div><p-table [value]="filtered" [paginator]="true" [rows]="8" selectionMode="single" (onRowSelect)="select($event.data)" dataKey="id"><ng-template #header><tr><th>焊缝 / 构件</th><th>焊材批号</th><th>方法与焊工</th><th>检测</th><th>返修</th><th>状态</th></tr></ng-template><ng-template #body let-weld><tr><td><b>{{weld.id}}</b><small class="block">{{weld.drawing}} · {{weld.component}}</small><small class="block muted">{{weld.group}}</small></td><td><span class="batch" *ngFor="let bx of weld.batchIds">{{bx}}</span><span class="batch missing" *ngIf="!weld.batchIds.length">批号待补录</span></td><td>{{weld.method}} · {{weld.welder}}<small class="block" [class.danger]="!weld.qualificationValid">{{weld.qualificationValid ? '资质有效' : '资质即将过期'}}</small></td><td><b [class.danger]="weld.inspectionRatio < weld.requiredRatio">{{weld.inspectionRatio}}% / {{weld.requiredRatio}}%</b><small class="block">要求检测比例</small></td><td>{{weld.repairs}} 次<small class="block" *ngIf="weld.repairs >= 2">重复返修关注</small></td><td><p-tag [value]="weld.status" [severity]="weld.status === '合格' || weld.status === '已关闭' ? 'success' : weld.status === '返修中' ? 'danger' : 'warn'" /><p-tag class="trace-tag" [value]="weld.traceState" [severity]="traceTagSeverity(weld.traceState)" /></td></tr></ng-template></p-table></section>
      <aside class="card"><h2 class="panel-title">规则预警</h2><div class="warning-row"><i class="red"></i><div><b>焊材批号待补录（兼容规则）</b><p>{{missingCount}} 条历史焊缝缺焊材批号，标“待补录”但不阻断现有业务。</p></div></div><div class="warning-row"><i class="red"></i><div><b>批号不合格 · 已报告焊缝待复核</b><p>原检测结论保留，复核确认前不得作为最终合格依据。</p></div></div><div class="warning-row"><i class="red"></i><div><b>W-109 焊工资质即将到期</b><p>孙鹏证书 2026-10-01 到期，检测计划未安排替代人员。</p></div></div><div class="warning-row"><i class="amber"></i><div><b>W-109 检测比例不足</b><p>当前计划 10%，图纸及规范要求 20%。</p></div></div><p-button label="生成处置任务" icon="pi pi-check-square" styleClass="w-full" /></aside></div>
    </main>
  `,
  styles:[`.block{display:block;color:#7a8798;margin-top:3px}.muted{font-size:12px}.batch{display:inline-block;font-size:11px;background:#eef4ff;color:#1d4ed8;border:1px solid #c7dcff;border-radius:4px;padding:2px 6px;margin:0 4px 3px 0}.batch.missing{background:#fef3c7;color:#92400e;border-color:#fde68a}.trace-tag{margin-left:6px}.warning-row{display:flex;gap:10px;padding:12px 0;border-bottom:1px solid #edf0f5}.warning-row i{width:6px;border-radius:5px;background:#f59e0b}.warning-row i.red{background:#ef4444}.warning-row div{flex:1}.warning-row p{margin:4px 0 0;font-size:13px}.warning-row .p-button{width:100%}`],
})
export class OverviewComponent implements OnInit {
  private readonly store = inject(Store<{ welds: WeldState }>)
  private readonly api = inject(WeldGraphqlService)
  state!: WeldState
  filter = '全部'
  statusOptions = ['全部','正常','待复核','待补录']
  traceTagSeverity = traceTagSeverity
  private loaded = false
  ngOnInit() {
    this.store.select('welds').subscribe((state) => this.state = state)
    this.api.load().subscribe((d) => {
      if (this.loaded) return
      this.loaded = true
      this.store.dispatch(A.loadWeldsSuccess({ welds: d.welds, plans: d.plans, batches: d.batches, issues: d.issues, snapshots: d.snapshots, journal: d.journal }))
    })
  }
  get filtered() {
    const list = this.state?.welds ?? []
    return this.filter === '全部' ? list : list.filter((item) => item.traceState === this.filter)
  }
  get pending() { return (this.state?.welds ?? []).filter((item) => ['待检测','返修中','待复检'].includes(item.status)).length }
  get tracePending() { return (this.state?.welds ?? []).filter((item) => item.traceState === '待复核' || item.traceState === '待补录').length }
  get missingCount() { return (this.state?.welds ?? []).filter((item) => item.traceState === '待补录').length }
  applyFilter(status: string) { this.store.dispatch(A.filterStatus({ status })) }
  select(weld: Weld | Weld[] | undefined) { if (weld && !Array.isArray(weld)) this.store.dispatch(A.selectWeld({ id: weld.id })) }
}
