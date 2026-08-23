import type { GroupKey, PackageItem, PackageStatus } from './types'

// ── Labels & badge styles (keep in sync with backend PackageStatus enum) ──

const STATUS_META: Record<PackageStatus, { label: string; className: string }> = {
  CREATED: { label: 'Created', className: 'bg-orange-50 text-orange-700 border-orange-200' },
  ACCEPTED: { label: 'Accepted', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  ORIGIN_OFFICE: { label: 'At origin office', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  ASSIGNED_DRIVER: { label: 'Driver assigned', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  PICKED_UP: { label: 'Picked up', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  IN_TRANSIT: { label: 'In transit', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  DESTINATION_OFFICE: { label: 'At destination office', className: 'bg-violet-50 text-violet-700 border-violet-200' },
  READY_FOR_COLLECTION: { label: 'Ready for collection', className: 'bg-violet-50 text-violet-700 border-violet-200' },
  PENDING_CONFIRMATION: { label: 'Awaiting confirmation', className: 'bg-orange-50 text-orange-700 border-orange-200' },
  DELIVERED: { label: 'Delivered', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  COMPLETED: { label: 'Completed', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  CANCELLED: { label: 'Cancelled', className: 'bg-muted text-muted-foreground border-border' },
}

export function statusLabel(status: PackageStatus): string {
  return STATUS_META[status]?.label ?? status
}

export function statusClass(status: PackageStatus): string {
  return STATUS_META[status]?.className ?? 'bg-muted text-muted-foreground border-border'
}

// ── Workspace groups ───────────────────────────────────────────────────────

export interface GroupMeta {
  key: GroupKey
  title: string
  description: string
  dot: string
}

export const GROUPS: GroupMeta[] = [
  { key: 'waiting-us', title: 'Waiting for our action', description: 'Ready to be accepted into our custody.', dot: 'bg-orange-500' },
  { key: 'waiting-others', title: 'Waiting for others', description: 'Our transfer awaits the next custodian.', dot: 'bg-violet-500' },
  { key: 'at-office', title: 'At our office', description: 'Accepted packages that have not departed yet.', dot: 'bg-amber-500' },
  { key: 'in-transit', title: 'In transit', description: 'Moving with a driver or route.', dot: 'bg-blue-500' },
  { key: 'awaiting-confirmation', title: 'Awaiting confirmation', description: 'Delivery code issued to the receiver.', dot: 'bg-orange-500' },
  { key: 'delivered', title: 'Delivered', description: 'Final handoff confirmed.', dot: 'bg-emerald-500' },
  { key: 'completed', title: 'Completed', description: 'Fully finished packages.', dot: 'bg-emerald-500' },
  { key: 'cancelled', title: 'Cancelled', description: 'Closed packages.', dot: 'bg-muted-foreground' },
]

export function groupForPackage(item: PackageItem, meId: string): GroupKey {
  switch (item.status) {
    case 'CREATED':
      return item.openTransfer && item.openTransfer.creatorId === meId ? 'waiting-others' : 'waiting-us'
    case 'ORIGIN_OFFICE':
    case 'ACCEPTED':
      return 'at-office'
    case 'ASSIGNED_DRIVER':
    case 'PICKED_UP':
    case 'IN_TRANSIT':
    case 'DESTINATION_OFFICE':
    case 'READY_FOR_COLLECTION':
      return 'in-transit'
    case 'PENDING_CONFIRMATION':
      return 'awaiting-confirmation'
    case 'DELIVERED':
      return 'delivered'
    case 'COMPLETED':
      return 'completed'
    case 'CANCELLED':
      return 'cancelled'
    default:
      return 'waiting-us'
  }
}

// ── Actions available for a package, driven by the backend state machine ──

export type PackageAction =
  | { kind: 'accept-transfer' } // AUTO transfer
  | { kind: 'accept-secure' } // SECURE transfer (code prompt)
  | { kind: 'request-transfer' } // CONFIRM transfer
  | { kind: 'claim' } // CREATED, no transfer → create AUTO transfer + accept
  | { kind: 'approve-request' } // I own a REQUESTED CONFIRM transfer
  | { kind: 'reject-request' }
  | { kind: 'regenerate-transfer-code' }
  | { kind: 'cancel-transfer' }
  | { kind: 'assign-driver' }
  | { kind: 'mark-in-transit' }
  | { kind: 'arrive-destination' }
  | { kind: 'ready-for-collection' }
  | { kind: 'start-delivery' }
  | { kind: 'confirm-delivery' }
  | { kind: 'regenerate-delivery-code' }
  | { kind: 'mark-completed' }
  | { kind: 'cancel-package' }

export function actionsForPackage(item: PackageItem, meId: string): PackageAction[] {
  const isMine = item.currentCustodian?.userId === meId

  if (item.status === 'CREATED') {
    const t = item.openTransfer
    if (!t) return [{ kind: 'claim' }]
    if (t.creatorId === meId) {
      if (t.status === 'REQUESTED') {
        return t.requestorId ? [{ kind: 'approve-request' }, { kind: 'reject-request' }] : []
      }
      return [{ kind: 'regenerate-transfer-code' }, { kind: 'cancel-transfer' }]
    }
    switch (t.ruleType) {
      case 'AUTO':
        return [{ kind: 'accept-transfer' }]
      case 'SECURE':
        return [{ kind: 'accept-secure' }]
      case 'CONFIRM':
        return [{ kind: 'request-transfer' }]
      default:
        return []
    }
  }

  if (!isMine) return []

  switch (item.status) {
    case 'ORIGIN_OFFICE':
      return [{ kind: 'assign-driver' }, { kind: 'cancel-package' }]
    case 'ACCEPTED':
      return item.deliveryType === 'OPEN'
        ? [{ kind: 'assign-driver' }, { kind: 'start-delivery' }, { kind: 'cancel-package' }]
        : [{ kind: 'assign-driver' }, { kind: 'cancel-package' }]
    case 'ASSIGNED_DRIVER':
    case 'PICKED_UP':
      return [{ kind: 'mark-in-transit' }, { kind: 'cancel-package' }]
    case 'IN_TRANSIT':
      return item.deliveryType === 'FIXED_ROUTE'
        ? [{ kind: 'arrive-destination' }, { kind: 'cancel-package' }]
        : [{ kind: 'start-delivery' }, { kind: 'cancel-package' }]
    case 'DESTINATION_OFFICE':
      return [{ kind: 'ready-for-collection' }, { kind: 'cancel-package' }]
    case 'READY_FOR_COLLECTION':
      return [{ kind: 'start-delivery' }, { kind: 'cancel-package' }]
    case 'PENDING_CONFIRMATION':
      return [{ kind: 'confirm-delivery' }, { kind: 'regenerate-delivery-code' }]
    case 'DELIVERED':
      return [{ kind: 'mark-completed' }]
    default:
      return []
  }
}

// ── Small display helpers ──────────────────────────────────────────────────

export const TRANSFER_RULE_LABEL: Record<string, string> = {
  AUTO: 'Auto',
  SECURE: 'Code protected',
  CONFIRM: 'Two-step confirm',
}

export const RULE_TONE: Record<string, string> = {
  AUTO: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  SECURE: 'border-amber-200 bg-amber-50 text-amber-700',
  CONFIRM: 'border-violet-200 bg-violet-50 text-violet-700',
}

export const ACCEPTOR_LABEL: Record<string, string> = {
  WORKER: 'Workers',
  DRIVER: 'Drivers',
  BOTH: 'Workers & drivers',
}

export const TRANSFER_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Open',
  REQUESTED: 'Requested',
  DONE: 'Completed',
  CANCELED: 'Cancelled',
}
