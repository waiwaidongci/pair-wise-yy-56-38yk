import { inject, Injectable } from '@angular/core'
import { Apollo, gql } from 'apollo-angular'
import { map } from 'rxjs'
import type { ConsumableBatch, ConsumableIssue, InspectionPlan, JournalEntry, SignedSnapshot, Weld } from '../types'

export interface TraceData {
  welds: Weld[]
  plans: InspectionPlan[]
  batches: ConsumableBatch[]
  issues: ConsumableIssue[]
  snapshots: SignedSnapshot[]
  journal: JournalEntry[]
}

const WELDS_QUERY = gql`query Welds {
  welds { id drawing component joint method welder qualification qualificationValid inspectionRatio requiredRatio status x y repairs batchIds group reportNo reportConclusion traceState defects { id position type length level method report } }
  plans { id date method weldIds inspector state group ratio recalculated invalidReason replacedBy }
  batches { id type spec supplier materialGroup receivedDate quantity unit verdict retestNo conclusionAt stopped stoppedAt }
  issues { id date batchId welder workOrder quantity unit weldIds }
  snapshots { id batchId versionLabel signedAt signer scope weldIds revisions { id regNo derivedAt reason status } }
  journal { regNo time appliedAt keeper batchId verdict retestNo status failureKind failureReason }
}`

@Injectable({ providedIn: 'root' })
export class WeldGraphqlService {
  private readonly apollo = inject(Apollo)
  load() {
    return this.apollo.watchQuery<TraceData>({ query: WELDS_QUERY, fetchPolicy: 'cache-first' }).valueChanges.pipe(map((result) => result.data))
  }
}
