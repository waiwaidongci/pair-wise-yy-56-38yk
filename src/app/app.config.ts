import { ApplicationConfig } from '@angular/core'
import { provideRouter } from '@angular/router'
import { provideStore } from '@ngrx/store'
import { providePrimeNG } from 'primeng/config'
import Aura from '@primeng/themes/aura'
import { provideApollo } from 'apollo-angular'
import { ApolloLink, InMemoryCache, Observable } from '@apollo/client/core'
import { routes } from './app.routes'
import { weldReducer } from './store/weld.reducer'

const mockGraphqlLink = new ApolloLink((operation) => new Observable((observer) => {
  setTimeout(() => {
    observer.next({ data: operation.operationName === 'Welds' ? mockData : {} })
    observer.complete()
  }, 180)
}))

const mockData = {
  batches: [
    { id:'CHE507-260908', type:'焊条 E5015', spec:'φ3.2', supplier:'金桥焊材', materialGroup:'Ⅱ类', receivedDate:'2026-09-08', quantity:300, unit:'kg', verdict:'未复验', stopped:false },
    { id:'ER506-260901', type:'焊丝 ER50-6', spec:'φ1.2', supplier:'大西洋', materialGroup:'Ⅱ类', receivedDate:'2026-09-01', quantity:500, unit:'kg', verdict:'合格', retestNo:'RT-0910', conclusionAt:'2026-09-10', stopped:false },
    { id:'SJ101-260825', type:'焊剂 SJ101', spec:'10-60目', supplier:'大西洋', materialGroup:'Ⅰ类', receivedDate:'2026-08-25', quantity:800, unit:'kg', verdict:'未复验', stopped:false },
    { id:'J422-260712', type:'焊条 J422', spec:'φ4.0', supplier:'金桥焊材', materialGroup:'Ⅲ类', receivedDate:'2026-07-12', quantity:200, unit:'kg', verdict:'合格', retestNo:'RT-0802', conclusionAt:'2026-08-02', stopped:false },
  ],
  issues: [
    { id:'LY-260920-01', date:'2026-09-20', batchId:'CHE507-260908', welder:'王凯', workOrder:'SG-04 柱翼缘焊接', quantity:30, unit:'kg', weldIds:['W-101','W-105','W-106'] },
    { id:'LY-260921-02', date:'2026-09-21', batchId:'CHE507-260908', welder:'赵明', workOrder:'SG-07 腹板焊接', quantity:25, unit:'kg', weldIds:['W-107','W-108'] },
    { id:'LY-260922-03', date:'2026-09-22', batchId:'CHE507-260908', welder:'孙鹏', workOrder:'SG-12 平台梁', quantity:20, unit:'kg', weldIds:['W-109','W-110'] },
    { id:'LY-260918-04', date:'2026-09-18', batchId:'ER506-260901', welder:'刘强', workOrder:'SG-07 下翼缘', quantity:40, unit:'kg', weldIds:['W-104','W-106'] },
    { id:'LY-260910-05', date:'2026-09-10', batchId:'SJ101-260825', welder:'王凯', workOrder:'SG-12 腹板', quantity:60, unit:'kg', weldIds:['W-112','W-111'] },
    { id:'LY-260820-06', date:'2026-08-20', batchId:'J422-260712', welder:'周恒', workOrder:'梯段零星焊接', quantity:18, unit:'kg', weldIds:['W-115'] },
  ],
  welds: [
    { id:'W-101', drawing:'SG-04-钢柱', component:'KZ-12 / 柱翼缘', joint:'全熔透坡口焊', method:'GMAW', welder:'王凯', qualification:'GB/T 9448 · 2027-06', qualificationValid:true, inspectionRatio:100, requiredRatio:100, status:'合格', x:18, y:24, repairs:0, batchIds:['CHE507-260908'], group:'Ⅱ类', reportNo:'UT-2026-0922', reportConclusion:'合格', traceState:'正常', defects:[] },
    { id:'W-104', drawing:'SG-07-屋面梁', component:'GL-21 / 下翼缘', joint:'对接焊缝', method:'SAW', welder:'刘强', qualification:'GB/T 9448 · 2028-03', qualificationValid:true, inspectionRatio:100, requiredRatio:100, status:'待复检', x:48, y:38, repairs:2, batchIds:['ER506-260901'], group:'Ⅰ类', reportNo:'UT-2026-0918', reportConclusion:'不合格', traceState:'正常', defects:[{id:'D-31',position:42,type:'夹渣',length:12,level:'Ⅱ级',method:'UT',report:'UT-2026-0918'}] },
    { id:'W-105', drawing:'SG-04-钢柱', component:'KZ-12 / 柱腹板', joint:'组合焊缝', method:'GMAW', welder:'王凯', qualification:'GB/T 9448 · 2027-06', qualificationValid:true, inspectionRatio:50, requiredRatio:50, status:'待检测', x:26, y:40, repairs:0, batchIds:['CHE507-260908'], group:'Ⅰ类', traceState:'正常', defects:[] },
    { id:'W-106', drawing:'SG-04-钢柱', component:'KZ-13 / 翼缘', joint:'对接焊缝', method:'GMAW', welder:'王凯', qualification:'GB/T 9448 · 2027-06', qualificationValid:true, inspectionRatio:50, requiredRatio:50, status:'待检测', x:30, y:18, repairs:0, batchIds:['CHE507-260908','ER506-260901'], group:'Ⅰ类', traceState:'正常', defects:[] },
    { id:'W-107', drawing:'SG-07-屋面梁', component:'GL-21 / 腹板', joint:'角焊缝', method:'FCAW', welder:'赵明', qualification:'GB/T 9448 · 2027-01', qualificationValid:true, inspectionRatio:20, requiredRatio:20, status:'返修中', x:61, y:42, repairs:1, batchIds:['CHE507-260908'], group:'Ⅱ类', reportNo:'MT-2026-0921', reportConclusion:'不合格', traceState:'正常', defects:[{id:'D-32',position:68,type:'未熔合',length:18,level:'Ⅲ级',method:'MT',report:'MT-2026-0921'}] },
    { id:'W-108', drawing:'SG-07-屋面梁', component:'GL-22 / 腹板', joint:'角焊缝', method:'FCAW', welder:'赵明', qualification:'GB/T 9448 · 2027-01', qualificationValid:true, inspectionRatio:20, requiredRatio:20, status:'待检测', x:66, y:50, repairs:0, batchIds:['CHE507-260908'], group:'Ⅱ类', traceState:'正常', defects:[] },
    { id:'W-109', drawing:'SG-12-平台梁', component:'PL-08 / 节点板', joint:'角焊缝', method:'SMAW', welder:'孙鹏', qualification:'GB/T 9448 · 2026-10-01', qualificationValid:false, inspectionRatio:10, requiredRatio:20, status:'待检测', x:78, y:60, repairs:0, batchIds:['CHE507-260908'], group:'Ⅲ类', traceState:'正常', defects:[] },
    { id:'W-110', drawing:'SG-12-平台梁', component:'PL-08 / 下弦', joint:'角焊缝', method:'SMAW', welder:'孙鹏', qualification:'GB/T 9448 · 2026-10-01', qualificationValid:false, inspectionRatio:10, requiredRatio:20, status:'待检测', x:82, y:66, repairs:0, batchIds:['CHE507-260908'], group:'Ⅲ类', traceState:'正常', defects:[] },
    { id:'W-111', drawing:'SG-12-平台梁', component:'PL-09 / 腹板', joint:'角焊缝', method:'SAW', welder:'王凯', qualification:'GB/T 9448 · 2027-06', qualificationValid:true, inspectionRatio:50, requiredRatio:50, status:'待检测', x:54, y:70, repairs:0, batchIds:['SJ101-260825'], group:'Ⅰ类', traceState:'正常', defects:[] },
    { id:'W-112', drawing:'SG-12-平台梁', component:'PL-08 / 腹板', joint:'组合焊缝', method:'GMAW', welder:'王凯', qualification:'GB/T 9448 · 2027-06', qualificationValid:true, inspectionRatio:50, requiredRatio:50, status:'已关闭', x:36, y:68, repairs:0, batchIds:['SJ101-260825'], group:'Ⅰ类', reportNo:'UT-2026-0912', reportConclusion:'合格', traceState:'正常', defects:[] },
    { id:'W-115', drawing:'SG-18-钢梯', component:'LT-02 / 梯梁', joint:'角焊缝', method:'SMAW', welder:'周恒', qualification:'GB/T 9448 · 2017-03', qualificationValid:true, inspectionRatio:0, requiredRatio:10, status:'已关闭', x:88, y:28, repairs:0, batchIds:['J422-260712'], group:'Ⅲ类', traceState:'正常', defects:[] },
    // 历史数据：缺焊材批号，兼容规则 → 待补录
    { id:'W-201', drawing:'SG-旧-雨棚', component:'YP-01 / 边梁', joint:'角焊缝', method:'SMAW', welder:'(历史录入)', qualification:'—', qualificationValid:true, inspectionRatio:0, requiredRatio:10, status:'待检测', x:12, y:78, repairs:0, batchIds:[], group:'Ⅲ类', traceState:'正常', defects:[] },
  ],
  plans: [
    { id:'IP-2026-0930-A', date:'2026-09-30', method:'UT + MT', weldIds:['W-105','W-106','W-108','W-111'], inspector:'陈锋', state:'待执行', group:'Ⅰ类' },
    { id:'IP-2026-0929-B', date:'2026-09-29', method:'UT', weldIds:['W-104'], inspector:'赵岚', state:'执行中' },
  ],
  snapshots: [
    { id:'SNAP-2026-W39', batchId:'CHE507-260908', versionLabel:'v11 · 9月第3周', signedAt:'2026-09-22 17:40', signer:'质量负责人 林越', scope:'SG-04 / SG-07 / SG-12 柱梁焊接批次', weldIds:['W-101','W-105','W-106','W-107','W-108','W-109','W-110'], revisions:[] },
    { id:'SNAP-2026-W37', batchId:'SJ101-260825', versionLabel:'v9 · 9月第1周', signedAt:'2026-09-12 16:05', signer:'质量负责人 林越', scope:'SG-12 平台梁埋弧批次', weldIds:['W-111','W-112'], revisions:[] },
  ],
  journal: [],
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideStore({ welds: weldReducer }),
    providePrimeNG({ theme: { preset: Aura, options: { darkModeSelector: false } } }),
    provideApollo(() => ({ cache: new InMemoryCache(), link: mockGraphqlLink })),
  ],
}
