import { Component, inject } from '@angular/core'
import { CommonModule } from '@angular/common'
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router'
import { ButtonModule } from 'primeng/button'
import { TagModule } from 'primeng/tag'
import { Store } from '@ngrx/store'
import { WeldState } from './store/weld.reducer'
import * as A from './store/weld.actions'
import type { Notice } from './types'

const kindClass: Record<Notice['kind'], string> = {
  登记成功: 'ok', 冲突: 'danger', 登记失败: 'danger', 重放生效: 'warn', 停发拦截: 'danger', 提示: 'info',
}

@Component({
  selector: 'app-root', standalone:true, imports:[CommonModule,RouterOutlet,RouterLink,RouterLinkActive,ButtonModule,TagModule],
  template:`
    <header class="topbar"><div class="brand"><span>焊</span><div><b>钢结构焊缝质量平台</b><small>WELD & NDT CONTROL</small></div></div><nav><a routerLink="/consumables" routerLinkActive="active">焊材追溯</a><a routerLink="/overview" routerLinkActive="active">台账总览</a><a routerLink="/map" routerLinkActive="active">构件定位</a><a routerLink="/inspections" routerLinkActive="active">检测返修</a><a routerLink="/approvals" routerLinkActive="active">审核锁定</a></nav><span class="spacer"></span><p-tag value="项目：东海会展中心" severity="success" /></header>
    <router-outlet />
    <div class="toast-stack">
      <div class="toast" *ngFor="let n of state.notices.slice(0,4)" [ngClass]="kindClass[n.kind]">
        <div class="toast-head"><i class="pi" [class]="icon(n.kind)"></i><b>{{n.title}}</b><span class="spacer"></span><button (click)="dismiss(n.id)" aria-label="关闭"><i class="pi pi-times"></i></button></div>
        <p>{{n.detail}}</p><small>{{n.kind}} · {{n.time}}</small>
      </div>
    </div>
  `,
  styles:[`
    .topbar{height:68px;background:#0f172a;color:#fff;display:flex;align-items:center;gap:14px;padding:0 22px;position:sticky;top:0;z-index:50}.brand{display:flex;gap:10px;align-items:center;min-width:265px}.brand>span{display:grid;place-items:center;width:36px;height:36px;border-radius:7px;background:#2563eb;font-weight:900}.brand b,.brand small{display:block}.brand small{font-size:9px;color:#8290a7;letter-spacing:1px}nav{display:flex;gap:3px}nav a{color:#cbd5e1;text-decoration:none;padding:10px 12px;border-radius:6px;font-size:14px}nav a.active{background:#1e293b;color:#fff}.spacer{flex:1}
    .toast-stack{position:fixed;right:18px;bottom:18px;z-index:100;display:grid;gap:10px;width:min(380px,92vw)}
    .toast{background:#fff;border:1px solid #e1e7ef;border-left-width:4px;border-radius:8px;padding:11px 13px;box-shadow:0 8px 24px #0f172a26}
    .toast.ok{border-left-color:#16a34a}.toast.danger{border-left-color:#dc2626}.toast.warn{border-left-color:#d97706}.toast.info{border-left-color:#2563eb}
    .toast-head{display:flex;align-items:center;gap:8px}.toast-head button{border:0;background:none;color:#94a3b8;cursor:pointer;padding:2px}.toast p{margin:6px 0;font-size:13px;color:#475467}.toast small{color:#94a3b8;font-size:11px}
    .toast.ok .toast-head i{color:#16a34a}.toast.danger .toast-head i{color:#dc2626}.toast.warn .toast-head i{color:#d97706}.toast.info .toast-head i{color:#2563eb}
    @media(max-width:950px){.topbar{height:auto;min-height:64px;padding:10px;flex-wrap:wrap}.brand{min-width:210px}nav{order:3;width:100%;overflow:auto}.topbar p-tag{display:none}}
  `],
})
export class AppComponent {
  private readonly store = inject(Store<{ welds: WeldState }>)
  state!: WeldState
  constructor() { this.store.select('welds').subscribe((s) => this.state = s) }
  dismiss(id: string) { this.store.dispatch(A.dismissNotice({ id })) }
  icon(kind: Notice['kind']) {
    return { 登记成功: 'pi-check-circle', 冲突: 'pi-exclamation-triangle', 登记失败: 'pi-times-circle', 重放生效: 'pi-refresh', 停发拦截: 'pi-ban', 提示: 'pi-info-circle' }[kind]
  }
  kindClass = kindClass
}
