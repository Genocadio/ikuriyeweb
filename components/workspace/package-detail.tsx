'use client'

import { useState } from 'react'
import {
  ArrowRight,
  Check,
  Clock3,
  KeyRound,
  MapPin,
  PackageCheck,
  Send,
  ShieldCheck,
  Truck,
  UserRound,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { useWorkspace } from '@/lib/store'
import {
  ACCEPTOR_LABEL,
  actionsForPackage,
  RULE_TONE,
  statusClass,
  statusLabel,
  TRANSFER_RULE_LABEL,
  type PackageAction,
} from '@/lib/status'
import { formatTimestamp, timeAgo } from '@/lib/format'
import type { PackageItem } from '@/lib/types'
import { cn } from '@/lib/utils'
import { AssignDriverDialog } from './assign-driver-dialog'
import { CodePromptDialog, CodeRevealDialog, ConfirmDialog } from './dialogs'

const ACTION_LABEL: Record<PackageAction['kind'], string> = {
  'accept-transfer': 'Accept custody',
  'accept-secure': 'Accept with code',
  'request-transfer': 'Request transfer',
  claim: 'Claim package',
  'approve-request': 'Approve request',
  'reject-request': 'Reject request',
  'regenerate-transfer-code': 'Regenerate transfer code',
  'cancel-transfer': 'Cancel transfer',
  'assign-driver': 'Assign driver',
  'mark-in-transit': 'Mark in transit',
  'arrive-destination': 'Arrived at destination office',
  'ready-for-collection': 'Ready for collection',
  'start-delivery': 'Start delivery',
  'confirm-delivery': 'Confirm delivery',
  'regenerate-delivery-code': 'Regenerate delivery code',
  'mark-completed': 'Mark completed',
  'cancel-package': 'Cancel package',
}

export function PackageDetail({ item, onClose }: { item: PackageItem | null; onClose: () => void }) {
  const { user } = useAuth()
  const workspace = useWorkspace()
  const [confirm, setConfirm] = useState<{ title: string; description?: string; label?: string; run: () => Promise<unknown> } | null>(null)
  const [codePrompt, setCodePrompt] = useState<{ title: string; description?: string; label?: string; initialValue?: string; onSubmit: (code: string) => Promise<void> } | null>(null)
  const [reveal, setReveal] = useState<{ title: string; description?: string; code: string } | null>(null)
  const [assignOpen, setAssignOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!item) {
    // Keep the one-time code reveal mounted while the drawer unmounts (e.g. after
    // “Start delivery” closes the drawer on success).
    return reveal ? (
      <CodeRevealDialog
        open
        title={reveal.title}
        description={reveal.description}
        code={reveal.code}
        onClose={() => setReveal(null)}
      />
    ) : null
  }
  const pkg = item
  const meId = user?.id ?? ''
  const actions = actionsForPackage(pkg, meId)
  const t = pkg.openTransfer

  const runAction = async (action: PackageAction) => {
    const code = pkg.trackingCode
    switch (action.kind) {
      case 'accept-transfer':
        setConfirm({
          title: `Accept ${code}?`,
          description: 'Custody will move to you and the transfer will be completed.',
          run: () => workspace.acceptTransfer(t!.id),
        })
        break
      case 'accept-secure':
        setCodePrompt({
          title: `Accept ${code}`,
          description: `This transfer is code protected (${TRANSFER_RULE_LABEL.SECURE}). Enter the 8-character code provided by the sender.`,
          label: 'Verify & accept',
          onSubmit: (value) => workspace.acceptTransfer(t!.id, value),
        })
        break
      case 'request-transfer':
        setConfirm({
          title: `Request ${code}?`,
          description: 'The transfer owner will confirm before custody moves to you.',
          label: 'Send request',
          run: () => workspace.acceptTransfer(t!.id),
        })
        break
      case 'claim':
        setConfirm({
          title: `Claim ${code}?`,
          description: 'Creates an AUTO transfer for this package and accepts it into your custody.',
          label: 'Claim package',
          run: () => workspace.claimPackage(pkg.id),
        })
        break
      case 'approve-request':
        setConfirm({
          title: 'Approve transfer request?',
          description: 'The requestor becomes custodian of all packages in this transfer.',
          run: () => workspace.confirmTransfer(t!.id),
        })
        break
      case 'reject-request':
        setConfirm({
          title: 'Reject transfer request?',
          description: 'The transfer returns to open status and the request is cleared.',
          run: () => workspace.rejectTransfer(t!.id),
        })
        break
      case 'regenerate-transfer-code':
        setBusy(true)
        try {
          const newCode = await workspace.regenerateTransferCode(t!.id)
          setReveal({ title: 'New transfer code', description: 'The previous code is now invalid. Share this one.', code: newCode })
        } finally {
          setBusy(false)
        }
        break
      case 'cancel-transfer':
        setConfirm({ title: 'Cancel this transfer?', description: 'Packages stay with the current custodian.', run: () => workspace.cancelTransfer(t!.id) })
        break
      case 'assign-driver':
        setAssignOpen(true)
        break
      case 'mark-in-transit':
        setConfirm({ title: `Mark ${code} in transit?`, run: () => workspace.advanceStatus(pkg.id, 'IN_TRANSIT') })
        break
      case 'arrive-destination':
        setConfirm({ title: `Arrived at destination office?`, run: () => workspace.advanceStatus(pkg.id, 'DESTINATION_OFFICE') })
        break
      case 'ready-for-collection':
        setConfirm({ title: 'Ready for collection?', run: () => workspace.advanceStatus(pkg.id, 'READY_FOR_COLLECTION') })
        break
      case 'start-delivery':
        setConfirm({
          title: `Start delivery for ${code}?`,
          description: 'Generates a one-time 6-digit delivery code and moves the package to “awaiting confirmation”.',
          label: 'Start delivery',
          run: async () => {
            const deliveryCode = await workspace.initiateDelivery(pkg.id)
            setReveal({
              title: 'Delivery code',
              description: 'Share this code with the receiver — they use it to confirm the delivery.',
              code: deliveryCode,
            })
          },
        })
        break
      case 'confirm-delivery':
        setCodePrompt({
          title: `Confirm delivery of ${code}`,
          description: 'Enter the 6-digit delivery code the receiver presented.',
          label: 'Confirm delivery',
          initialValue: workspace.getCode(pkg.id) ?? '',
          onSubmit: (value) => workspace.confirmDelivery(pkg.id, value),
        })
        break
      case 'regenerate-delivery-code':
        setBusy(true)
        try {
          const deliveryCode = await workspace.regenerateDeliveryCode(pkg.id)
          setReveal({ title: 'New delivery code', description: 'The previous code was invalidated. Share this one with the receiver.', code: deliveryCode })
        } finally {
          setBusy(false)
        }
        break
      case 'mark-completed':
        setConfirm({ title: `Mark ${code} completed?`, description: 'Closes the package after a successful handoff.', run: () => workspace.advanceStatus(pkg.id, 'COMPLETED') })
        break
      case 'cancel-package':
        setConfirm({ title: `Cancel ${code}?`, description: 'Closes the package. This cannot be undone.', label: 'Cancel package', run: () => workspace.advanceStatus(pkg.id, 'CANCELLED', { notes: 'Cancelled from worker console' }) })
        break
      default:
        break
    }
  }

  const confirmRun = async () => {
    if (!confirm) return
    setBusy(true)
    try {
      await confirm.run()
      setConfirm(null)
      onClose()
    } catch {
      /* error toasted by the store */
    } finally {
      setBusy(false)
    }
  }

  const codeSubmit = async (codeValue: string) => {
    if (!codePrompt) return
    setBusy(true)
    try {
      await codePrompt.onSubmit(codeValue)
      setCodePrompt(null)
      onClose()
    } catch {
      /* error toasted by the store */
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-foreground/20" onClick={onClose} aria-hidden="true" />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Package detail</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold">{item.trackingCode}</h2>
              <Badge variant="outline" className={cn('text-[10px]', statusClass(item.status))}>{statusLabel(item.status)}</Badge>
              <Badge variant="outline" className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                {item.deliveryType}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {item.receiver} · {item.destination}
            </p>
          </div>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid gap-3 rounded-xl border border-border bg-muted/30 p-4 text-xs sm:grid-cols-2">
            <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Sender</p><p className="mt-1 font-medium">{item.sender}</p></div>
            <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Receiver</p><p className="mt-1 font-medium">{item.receiver}</p></div>
            <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Origin</p><p className="mt-1 font-medium">{item.origin}</p></div>
            <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Destination</p><p className="mt-1 font-medium">{item.destination}</p></div>
            {item.weight && <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Weight</p><p className="mt-1 font-medium">{item.weight}</p></div>}
            {item.category && <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Category</p><p className="mt-1 font-medium">{item.category}</p></div>}
          </div>

          {item.description && (
            <p className="mt-4 rounded-xl border border-border p-3 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
          )}

          {item.fragile && (
            <Badge variant="outline" className="mt-3 border-amber-200 bg-amber-50 text-[10px] text-amber-700">Fragile</Badge>
          )}

          {item.photos.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">Package photos</p>
              <div className="grid grid-cols-2 gap-2">
                {item.photos.map((photo) => (
                  <img key={photo} src={photo} alt={`Photo of ${item.trackingCode}`} className="h-28 w-full rounded-xl object-cover" />
                ))}
              </div>
            </div>
          )}

          {t && (
            <div className="mt-4 rounded-xl border border-border p-3">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <ShieldCheck className="size-3.5" /> Transfer
                </p>
                <Badge variant="outline" className={cn('text-[10px]', RULE_TONE[t.ruleType])}>{TRANSFER_RULE_LABEL[t.ruleType]}</Badge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {t.creatorId === meId ? 'You created this transfer.' : 'Created by another custodian.'}{' '}
                Accepts: {ACCEPTOR_LABEL[t.acceptorType] ?? t.acceptorType}.
              </p>
              {t.ruleType === 'SECURE' && t.creatorId === meId && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700">
                  <KeyRound className="size-3.5" />
                  {workspace.getSecureCode(t.id) ? `Code: ${workspace.getSecureCode(t.id)}` : 'Regenerate the code to view it.'}
                </p>
              )}
            </div>
          )}

          <div className="mt-4">
            <p className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              <UserRound className="size-3.5" /> Current custody
            </p>
            <div className="flex items-center justify-between rounded-xl border border-border p-3">
              <span className="text-xs text-muted-foreground">Held by</span>
              <span className="text-xs font-medium">
                {item.currentCustodian ? `${item.currentCustodian.name} (${item.currentCustodian.role})` : 'No custodian'}
                {item.assignedDriver && item.currentCustodian?.role !== 'DRIVER' ? ` · ${item.assignedDriver}` : ''}
              </span>
            </div>
          </div>

          {item.custody.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                <ArrowRight className="size-3.5" /> Custody trail
              </p>
              <div className="flex flex-col gap-2">
                {item.custody.map((entry) => (
                  <div key={entry.id} className="flex items-center gap-3 text-xs">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                      <Check className="size-3" />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-medium">{entry.fromEntity} → {entry.toEntity}</span>
                      <span className="block text-[10px] text-muted-foreground">{timeAgo(entry.timestamp)} · {entry.notes ?? ''}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {item.events.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                <Clock3 className="size-3.5" /> Timeline
              </p>
              <div className="flex flex-col gap-2">
                {item.events.map((event) => (
                  <div key={event.id} className="flex gap-3 text-xs">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                    <span className="min-w-0">
                      <span className="block font-medium">{event.description ?? event.eventType}</span>
                      <span className="block font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                        {event.eventType} · {formatTimestamp(event.createdAt)}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {item.status === 'PENDING_CONFIRMATION' && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-orange-200 bg-orange-50 p-3 text-xs text-orange-800">
              <MapPin className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Delivery code issued to the receiver — awaiting confirmation. You can confirm on their behalf if they
                share the code with you.
              </span>
            </div>
          )}
        </div>

        {actions.length > 0 && (
          <div className="border-t border-border bg-muted/30 p-4">
            <div className="flex flex-wrap gap-2">
              {actions.map((action) => (
                <Button
                  key={action.kind}
                  variant={action.kind === 'cancel-transfer' || action.kind === 'cancel-package' || action.kind === 'reject-request' ? 'outline' : 'default'}
                  className={cn(
                    action.kind === 'cancel-transfer' || action.kind === 'cancel-package' || action.kind === 'reject-request'
                      ? 'text-destructive'
                      : 'bg-[#1f2523] text-white hover:bg-[#343b37]',
                  )}
                  onClick={() => void runAction(action)}
                >
                  {ACTION_LABEL[action.kind] === 'Assign driver' && <Truck className="size-3.5" />}
                  {ACTION_LABEL[action.kind] === 'Start delivery' && <Send className="size-3.5" />}
                  {ACTION_LABEL[action.kind] === 'Claim package' && <PackageCheck className="size-3.5" />}
                  {ACTION_LABEL[action.kind] === 'Accept custody' && <Check className="size-3.5" />}
                  {ACTION_LABEL[action.kind]}
                </Button>
              ))}
            </div>
          </div>
        )}
      </aside>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title ?? ''}
        description={confirm?.description}
        confirmLabel={confirm?.label}
        busy={busy}
        onConfirm={() => void confirmRun()}
        onClose={() => setConfirm(null)}
      />
      <CodePromptDialog
        key={codePrompt ? `${item.id}-${codePrompt.title}` : 'none'}
        open={Boolean(codePrompt)}
        title={codePrompt?.title ?? ''}
        description={codePrompt?.description}
        confirmLabel={codePrompt?.label}
        initialValue={codePrompt?.initialValue ?? ''}
        busy={busy}
        onConfirm={(value) => void codeSubmit(value)}
        onClose={() => setCodePrompt(null)}
      />
      <CodeRevealDialog
        open={Boolean(reveal)}
        title={reveal?.title ?? ''}
        description={reveal?.description}
        code={reveal?.code ?? null}
        onClose={() => setReveal(null)}
      />
      <AssignDriverDialog
        open={assignOpen}
        packageId={item.id}
        packageCode={item.trackingCode}
        onClose={() => setAssignOpen(false)}
      />
    </>
  )
}


