import { Component, OnInit, inject } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { Store } from '@ngrx/store'
import { TableModule } from 'primeng/table'
import { TagModule } from 'primeng/tag'
import { ButtonModule } from 'primeng/button'
import { SelectModule } from 'primeng/select'
import { InputTextModule } from 'primeng/inputtext'
import { WeldState } from '../store/weld.reducer'
import { WeldGraphqlService } from '../services/weld-graphql.service'
import { traceChainFor, traceTagSeverity, verdictSeverity } from '../store/trace.selectors'
import * as A from '../store/weld.actions'

@Component({
  selector: 'app-consumables',
  standalone: true,
  imports: [CommonModule, FormsModule, TableModule, TagModule, ButtonModule, SelectModule, InputTextModule],
  template: `
    <main class="page">
      <div class="page-head">
        <div><p class="eyebrow">焊材批号 · 反向追溯</p><h1>焊材入库、发放与批号追溯</h1><p>入库批号经领用单落到焊缝；复验不合格先停发，再沿 领用单 → 焊缝 → 检测计划 → 签字快照 反向处置。</p></div>
        <p-tag [value]="stoppedCount ? (stoppedCount + ' 个批号已停发') : '发放通道正常'" [severity]="stoppedCount ? 'danger' : 'success'" />
      </div>

      <div class="grid-2 trace-grid">
        <!-- 入库批号台账 + 登记 -->
        <section class="card">
          <h2 class="panel-title">焊材入库批号台账</h2>
          <p-table [value]="state.batches" dataKey="id" [rowHover]="true" styleClass="mb-3">
            <ng-template #header><tr><th>批号 / 材料</th><th>组别</th><th>复验结论</th><th>发放</th><th>操作</th></tr></ng-template>
            <ng-template #body let-b>
              <tr [class.row-active]="b.id === state.selectedBatchId" (click)="selectBatch(b.id)" style="cursor:pointer">
                <td><b>{{b.id}}</b><small class="block">{{b.type}} {{b.spec}} · {{b.supplier}}</small><small class="block muted">{{b.receivedDate}} 入库 · {{b.quantity}}{{b.unit}}<span *ngIf="b.retestNo"> · {{b.retestNo}}</span></small></td>
                <td>{{b.materialGroup}}</td>
                <td><p-tag [value]="b.verdict" [severity]="verdictSeverity(b.verdict)" /></td>
                <td><p-tag [value]="b.stopped ? '已停发' : '可发放'" [severity]="b.stopped ? 'danger' : 'success'" /></td>
                <td (click)="$event.stopPropagation()">
                  <p-button label="追溯" icon="pi pi-sitemap" size="small" text (onClick)="selectBatch(b.id)" />
                  <p-button label="发放" icon="pi pi-send" size="small" text [disabled]="b.stopped" (onClick)="issue(b.id)" />
                </td>
              </tr>
            </ng-template>
          </p-table>

          <h2 class="panel-title">库管复验结论登记</h2>
          <div class="reg-form">
            <label>库管<p-select [options]="keepers" [(ngModel)]="form.keeper" optionLabel="name" optionValue="name" styleClass="w-full" /></label>
            <label>批号<p-select [options]="state.batches" [(ngModel)]="form.batchId" optionLabel="id" optionValue="id" styleClass="w-full" /></label>
            <label>复验结论<p-select [options]="['不合格','合格']" [(ngModel)]="form.verdict" styleClass="w-full" /></label>
            <label>复验报告号<input pInputText [(ngModel)]="form.retestNo" placeholder="如 RT-1005" /></label>
            <label class="fail"><input type="checkbox" [(ngModel)]="form.fail" /> 模拟提交时网络超时（登记失败）</label>
            <p-button label="提交结论登记" icon="pi pi-check-circle" (onClick)="submit()" styleClass="w-full" />
          </div>
          <p class="rule">同一批号结论先到生效；两名库管同时提交时，后到者看到冲突。失败条目凭登记号恢复，重放幂等、不重复追加。</p>
        </section>

        <!-- 反向追溯链 -->
        <aside class="card chain-card">
          <h2 class="panel-title">反向追溯链 <small class="muted" *ngIf="chain">· {{chain.batch.id}}</small></h2>
          <ng-container *ngIf="chain">
            <div class="chain-step"><span class="step-no">1</span><div><b>入库批号</b><p>{{chain.batch.type}} {{chain.batch.spec}} · {{chain.batch.materialGroup}} · {{chain.batch.supplier}}</p><p-tag [value]="chain.batch.verdict" [severity]="verdictSeverity(chain.batch.verdict)" /> <p-tag [value]="chain.batch.stopped ? '已停发' : '可发放'" [severity]="chain.batch.stopped ? 'danger' : 'success'" /></div></div>
            <div class="chain-step"><span class="step-no">2</span><div><b>领用单（{{chain.issues.length}} 张）</b><div class="chips"><span class="chip" *ngFor="let i of chain.issues">{{i.id}} · {{i.welder}} · {{i.quantity}}{{i.unit}} → {{i.weldIds.length}} 条焊缝</span><span class="chip empty" *ngIf="!chain.issues.length">暂无领用记录</span></div></div></div>
            <div class="chain-step"><span class="step-no">3</span><div><b>使用该批号的焊缝（{{chain.welds.length}}）</b>
              <div class="weld-line" *ngFor="let w of chain.welds">
                <b>{{w.id}}</b><span class="muted">{{w.group}} · {{w.component}}</span>
                <span class="badges"><span class="mini" *ngIf="w.reportNo">报告 {{w.reportNo}} · 结论“{{w.reportConclusion}}”</span><p-tag [value]="w.traceState" [severity]="traceTagSeverity(w.traceState)" /></span>
              </div>
              <p class="rule" *ngIf="!chain.welds.length">该批号尚未被任何焊缝领用。</p>
            </div></div>
            <div class="chain-step"><span class="step-no">4</span><div><b>关联检测计划（{{chain.plans.length}}）</b>
              <div class="plan-line" *ngFor="let p of chain.plans">
                <b>{{p.id}}</b><span class="muted">{{p.date}} · {{p.method}} · {{p.weldIds.length}} 条</span>
                <p-tag [value]="p.state" [severity]="planSeverity(p.state)" />
                <p class="rule" *ngIf="p.invalidReason">{{p.invalidReason}}<span *ngIf="p.replacedBy">，重算计划 {{p.replacedBy}}</span></p>
                <p class="rule" *ngIf="p.recalculated && p.group && p.ratio">按 {{p.group}} 重算，提级比例 <b class="danger">{{p.ratio}}%</b></p>
              </div>
            </div></div>
            <div class="chain-step"><span class="step-no">5</span><div><b>签字快照（{{chain.snapshots.length}}）</b>
              <div class="snap-line" *ngFor="let s of chain.snapshots">
                <b>{{s.id}} · {{s.versionLabel}}</b><span class="muted">{{s.signer}} · {{s.signedAt}}</span>
                <p class="rule">原快照只读保留，含 {{s.weldIds.length}} 条焊缝。</p>
                <div class="rev" *ngFor="let r of s.revisions"><p-tag value="待复核修订" severity="danger" /><b>{{r.id}}</b><span class="muted">{{r.derivedAt}} · 登记号 {{r.regNo}}</span><p>{{r.reason}}</p></div>
                <p class="muted" *ngIf="!s.revisions.length">暂无派生修订。</p>
              </div>
            </div></div>
          </ng-container>
        </aside>
      </div>

      <!-- 登记台账 + 级联记录 -->
      <div class="grid-2 mt-4">
        <section class="card">
          <h2 class="panel-title">复验结论登记台账（登记号即幂等键）</h2>
          <p-table [value]="state.journal" [paginator]="true" [rows]="6" dataKey="regNo">
            <ng-template #header><tr><th>登记号 / 时间</th><th>库管 / 批号</th><th>结论</th><th>状态</th><th>恢复</th></tr></ng-template>
            <ng-template #body let-e>
              <tr>
                <td><b>{{e.regNo}}</b><small class="block muted">提交 {{e.time}}<span *ngIf="e.appliedAt"> · 生效 {{e.appliedAt}}</span></small></td>
                <td>{{e.keeper}}<small class="block muted">{{e.batchId}} · {{e.retestNo}}</small><small class="block danger" *ngIf="e.failureReason">{{e.failureReason}}</small></td>
                <td><p-tag [value]="e.verdict" [severity]="e.verdict === '不合格' ? 'danger' : 'success'" /></td>
                <td><p-tag [value]="e.status" [severity]="e.status === '已生效' ? 'success' : 'danger'" /><small class="block muted" *ngIf="e.failureKind">{{e.failureKind}}</small></td>
                <td><p-button *ngIf="e.status === '登记失败' && e.failureKind === '网络超时'" label="按登记号恢复重放" icon="pi pi-refresh" size="small" (onClick)="replay(e.regNo)" /></td>
              </tr>
            </ng-template>
          </p-table>
          <p class="rule" *ngIf="!state.journal.length">尚无登记记录。可连续两次以不同库管提交同一批号，观察“先到生效、后到冲突”；勾选网络超时后可在此处恢复。</p>
        </section>
        <section class="card">
          <h2 class="panel-title">不合格批号反向处置记录</h2>
          <div class="cascade" *ngFor="let c of state.cascades">
            <div class="cascade-head"><b>{{c.batchId}}</b><span class="muted">登记号 {{c.regNo}} · {{c.time}}</span></div>
            <div class="cascade-grid">
              <div><strong>{{c.affectedWeldIds.length}}</strong><span>受影响焊缝</span></div>
              <div><strong class="warning">{{c.reportedWeldIds.length}}</strong><span>已出报告 · 保留结论待复核</span></div>
              <div><strong>{{c.replannedWeldIds.length}}</strong><span>未报告 · 重新排检</span></div>
              <div><strong class="danger">{{c.invalidPlanIds.length}}</strong><span>未开工计划失效</span></div>
              <div><strong class="success">{{c.replacementPlanIds.length}}</strong><span>重算计划</span></div>
              <div><strong class="danger">{{c.revisedSnapshotIds.length}}</strong><span>派生待复核修订</span></div>
            </div>
            <p class="rule" *ngFor="let r of c.ratios">材料组别 {{r.group}} 检测比例重算：{{r.from}}% → <b class="danger">{{r.to}}%</b></p>
          </div>
          <p class="rule" *ngIf="!state.cascades.length">暂无不合格批号处置记录。</p>
        </section>
      </div>
    </main>
  `,
  styles: [`
    .trace-grid { align-items: start; }
    .block { display:block; margin-top:2px; } .muted { color:#7a8798; font-size:12px; }
    .row-active { background:#eff6ff; }
    .reg-form { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin:10px 0; }
    .reg-form label { display:grid; gap:5px; font-size:13px; color:#475467; }
    .reg-form label.fail { grid-template-columns:auto 1fr; align-items:center; display:flex; gap:7px; align-self:end; padding-bottom:9px; }
    .reg-form .p-button { grid-column:1/-1; }
    .rule { font-size:12px; color:#667085; margin:7px 0 0; background:#f8fafc; border-left:3px solid #94a3b8; padding:7px 9px; border-radius:0 4px 4px 0; }
    .chain-card { max-height:none; }
    .chain-step { display:flex; gap:12px; padding:13px 0; border-bottom:1px dashed #e1e7ef; }
    .step-no { display:grid; place-items:center; width:24px; height:24px; flex:none; border-radius:50%; background:#2563eb; color:#fff; font-size:12px; font-weight:700; }
    .chain-step p { margin:4px 0; font-size:13px; color:#475467; }
    .chips { display:flex; flex-wrap:wrap; gap:6px; margin-top:6px; }
    .chip { font-size:12px; background:#eef4ff; color:#1d4ed8; border:1px solid #c7dcff; border-radius:12px; padding:3px 9px; }
    .chip.empty { background:#f1f5f9; color:#94a3b8; border-color:#e2e8f0; }
    .weld-line, .plan-line, .snap-line { display:grid; gap:3px; padding:8px 10px; margin-top:6px; background:#f8fafc; border-radius:6px; }
    .badges { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
    .mini { font-size:11px; color:#92400e; background:#fef3c7; border-radius:4px; padding:2px 6px; }
    .rev { margin-top:7px; padding:8px 9px; background:#fff1f2; border-left:3px solid #e11d48; border-radius:0 5px 5px 0; display:grid; gap:3px; }
    .rev p { margin:0; }
    .cascade { border:1px solid #e1e7ef; border-radius:7px; padding:12px; margin-bottom:10px; }
    .cascade-head { display:flex; justify-content:space-between; margin-bottom:9px; }
    .cascade-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
    .cascade-grid div { background:#f8fafc; border-radius:6px; padding:8px; text-align:center; }
    .cascade-grid strong { display:block; font-size:20px; }
    .cascade-grid span { font-size:11px; color:#667085; }
    .danger{color:#dc2626}.warning{color:#d97706}.success{color:#15803d}.mb-3{margin-bottom:14px}.mt-4{margin-top:16px}
  `],
})
export class ConsumablesComponent implements OnInit {
  private readonly store = inject(Store<{ welds: WeldState }>)
  private readonly api = inject(WeldGraphqlService)
  state!: WeldState
  keepers = [{ name: '周敏（库管甲）' }, { name: '吴琼（库管乙）' }]
  form = { keeper: '周敏（库管甲）', batchId: 'CHE507-260908', verdict: '不合格' as '合格' | '不合格', retestNo: 'RT-1005', fail: false }
  private seq = 0

  ngOnInit() {
    this.store.select('welds').subscribe((s) => { this.state = s; if (!this.form.batchId && s.batches[0]) this.form.batchId = s.batches[0].id })
    this.api.load().subscribe((d) => {
      if (!d.batches?.length) return
      this.store.dispatch(A.loadWeldsSuccess({ welds: d.welds, plans: d.plans, batches: d.batches, issues: d.issues, snapshots: d.snapshots, journal: d.journal }))
    })
  }

  get chain() {
    if (!this.state?.selectedBatchId) return undefined
    return traceChainFor(this.state.selectedBatchId, this.state.batches, this.state.issues, this.state.welds, this.state.plans, this.state.snapshots)
  }

  get stoppedCount() { return (this.state?.batches ?? []).filter((b) => b.stopped).length }

  verdictSeverity = verdictSeverity
  traceTagSeverity = traceTagSeverity
  planSeverity = (s: string) => s === '已完成' || s === '已失效' ? (s === '已失效' ? 'danger' : 'success') : s === '执行中' ? 'info' : 'warn'

  selectBatch(batchId: string) { this.store.dispatch(A.selectBatch({ batchId })) }

  issue(batchId: string) {
    const b = this.state.batches.find((x) => x.id === batchId)
    if (b?.stopped) {
      this.pushNotice('停发拦截', `批号 ${batchId} 复验不合格已停发，领用单被拦截，不得再用于任何焊缝。`, '停发拦截')
      return
    }
    this.pushNotice('允许发放', `批号 ${batchId} 复验状态“${b?.verdict ?? '未复验'}”，可继续领用。`, '提示')
  }

  submit() {
    this.seq += 1
    const regNo = `REG-10050${this.seq}-${Math.floor(Math.random() * 90 + 10)}`
    const time = new Date().toLocaleString('zh-CN', { hour12: false })
    this.store.dispatch(A.registerVerdict({
      regNo, time, keeper: this.form.keeper, batchId: this.form.batchId,
      verdict: this.form.verdict, retestNo: this.form.retestNo || 'RT-未填', fail: this.form.fail,
    }))
  }

  replay(regNo: string) {
    this.store.dispatch(A.replayRegistration({ regNo, time: new Date().toLocaleString('zh-CN', { hour12: false }) }))
  }

  private pushNotice(title: string, detail: string, kind: '停发拦截' | '提示') {
    this.store.dispatch(A.pushNotice({ notice: { id: `N-manual-${Date.now()}`, kind, title, detail, time: new Date().toLocaleTimeString('zh-CN', { hour12: false }) } }))
  }
}
