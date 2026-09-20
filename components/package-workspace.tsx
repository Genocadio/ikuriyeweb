'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, PackageCheck, Send, Plus, Search, Truck, KeyRound } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/lib/auth'
import { useWorkspace } from '@/lib/store'
import { statusClass, statusLabel, TRANSFER_RULE_LABEL } from '@/lib/status'
import { timeAgo } from '@/lib/format'
import type { PackageItem } from '@/lib/types'
import { cn } from '@/lib/utils'
import { CustodyInbox } from '@/components/workspace/inbox'
import { PackageDetail } from '@/components/workspace/package-detail'
import { CreatePackageDialog } from '@/components/workspace/create-package-dialog'
import { CodePromptDialog, CodeRevealDialog, ConfirmDialog } from '@/components/workspace/dialogs'
import { DriverPickerDialog } from '@/components/workspace/driver-picker-dialog'

type FilterKey = 'all' | 'at-office' | 'in-transit' | 'delivered' | 'other'

// Restores the list scroll position after a reload — the store hydrates the
// cached package pages, this restores where the user was reading.
const SCROLL_KEY = 'cavgo.workspaceScroll'

interface FilterTab {
  key: FilterKey
  label: string
  match: (item: PackageItem) => boolean
}

const FILTER_TABS: FilterTab[] = [
  { key: 'all', label: 'All', match: () => true },
  {
    key: 'at-office',
    label: 'At office',
    match: (item) => ['CREATED', 'ORIGIN_OFFICE', 'ACCEPTED'].includes(item.status),
  },
  {
    key: 'in-transit',
    label: 'In transit',
    match: (item) =>
      ['ASSIGNED_DRIVER', 'PICKED_UP', 'IN_TRANSIT', 'DESTINATION_OFFICE', 'READY_FOR_COLLECTION'].includes(
        item.status,
      ),
  },
  {
    key: 'delivered',
    label: 'Delivered',
    match: (item) => ['PENDING_CONFIRMATION', 'DELIVERED', 'COMPLETED'].includes(item.status),
  },
  {
    key: 'other',
    label: 'Other',
    match: (item) => item.status === 'CANCELLED',
  },
]

export function PackageWorkspace() {
  const { user } = useAuth()
  const workspace = useWorkspace()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const meId = user?.id ?? ''

  // Save window scroll position (page scrolls on the window) so a reload can
  // restore it. Passive listener — runs constantly, must never block scrolling.
  useEffect(() => {
    const onScroll = () => {
      try {
        sessionStorage.setItem(SCROLL_KEY, String(window.scrollY))
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Restore scroll once content has rendered (cached pages hydrate
  // synchronously from the store, so this runs on the first paint after a
  // reload). If the saved position is deeper than the restored content, keep
  // loading pages and re-scrolling until the position is reachable again.
  const pendingScrollRef = useRef<number | null>(null)
  useEffect(() => {
    if (workspace.packages.length === 0) return
    if (pendingScrollRef.current === null) {
      try {
        const saved = Number(sessionStorage.getItem(SCROLL_KEY) ?? '0')
        // -1 marks "nothing to restore" so we don't retry every render.
        pendingScrollRef.current = saved > 0 ? saved : -1
      } catch {
        pendingScrollRef.current = -1
      }
    }
    const target = pendingScrollRef.current
    if (target <= 0) return
    window.scrollTo(0, target)
    if (window.scrollY >= target - 50) {
      // Reached (or passed) the saved position — done.
      pendingScrollRef.current = -1
    } else if (workspace.hasMorePackages) {
      // Content still too short to reach the position — grow it and retry.
      void workspace.loadMorePackages()
    } else {
      pendingScrollRef.current = -1
    }
  }, [workspace.packages.length, workspace.hasMorePackages, workspace.loadMorePackages])

  // Infinite scroll: a sentinel row at the end of the list requests the next
  // page when it scrolls into view.
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const loadMorePackages = workspace.loadMorePackages
  const hasMorePackages = workspace.hasMorePackages
  const loadingMore = workspace.loadingMore
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMorePackages || loadingMore) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMorePackages()
        }
      },
      { rootMargin: '400px 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMorePackages, loadingMore, loadMorePackages])

  const filtered = useMemo(() => {
    const tab = FILTER_TABS.find((t) => t.key === filter) ?? FILTER_TABS[0]
    let items = workspace.packages.filter(tab.match)
    const q = query.trim().toLowerCase()
    if (q) {
      items = items.filter((item) =>
        `${item.trackingCode} ${item.receiver} ${item.destination} ${item.sender} ${item.currentCustodian?.name ?? ''}`
          .toLowerCase()
          .includes(q),
      )
    }
    return items
  }, [workspace.packages, query, filter])

  const selected = workspace.packages.find((item) => item.id === selectedId) ?? null

  // Quick actions rendered inline on list rows (the same flows live in the
  // detail drawer).
  const [deliverItem, setDeliverItem] = useState<PackageItem | null>(null)
  const [confirmItem, setConfirmItem] = useState<PackageItem | null>(null)
  const [reveal, setReveal] = useState<{ code: string } | null>(null)
  const [transferItemId, setTransferItemId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Packages that arrived at this office (as their destination) are handed to
  // the receiver from here — one-tap "Deliver".
  const officeDeliver = (item: PackageItem) =>
    ['DESTINATION_OFFICE', 'READY_FOR_COLLECTION'].includes(item.status)
  const awaitingConfirm = (item: PackageItem) => item.status === 'PENDING_CONFIRMATION'
  // Packages I hold that were created here (origin = this office) go out via a
  // driver — regardless of destination. Offer the handover until one is open.
  const canTransfer = (item: PackageItem) =>
    item.isMine && ['CREATED', 'ORIGIN_OFFICE', 'ACCEPTED'].includes(item.status) && !item.openTransfer

  async function runQuickDeliver() {
    if (!deliverItem) return
    setBusy(true)
    try {
      const deliveryCode = await workspace.initiateDelivery(deliverItem.id)
      setDeliverItem(null)
      setReveal({ code: deliveryCode })
    } catch {
      /* error toasted by the store */
    } finally {
      setBusy(false)
    }
  }

  async function runQuickConfirm(code: string) {
    if (!confirmItem) return
    setBusy(true)
    try {
      await workspace.confirmDelivery(confirmItem.id, code)
      setConfirmItem(null)
    } catch {
      /* error toasted by the store */
    } finally {
      setBusy(false)
    }
  }

  async function runQuickTransfer(driverId: string) {
    if (!transferItemId) return
    await workspace.createTransferForPackages([transferItemId], 'AUTO', driverId)
  }

  // Compute badge counts for each tab
  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { all: 0, 'at-office': 0, 'in-transit': 0, delivered: 0, other: 0 }
    for (const item of workspace.packages) {
      for (const tab of FILTER_TABS) {
        if (tab.match(item)) {
          c[tab.key]++
        }
      }
    }
    return c
  }, [workspace.packages])

  return (
    <div className="flex flex-col gap-4">
      <CustodyInbox />

      {/* Search + actions row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tracking code, recipient, destination, custodian…"
            className="h-9 pl-9 text-xs"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" className="h-9 shrink-0 gap-2 bg-[#1f2523] text-white hover:bg-[#343b37]" onClick={() => setCreateOpen(true)}>
            <Plus className="size-3.5" /> New package
          </Button>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
              filter === tab.key ? 'bg-[#1f2523] text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80',
            )}
          >
            {tab.label}
            <span className={cn('font-mono text-[10px]', filter === tab.key ? 'text-white/60' : 'text-muted-foreground/70')}>
              {counts[tab.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Package list */}
      {workspace.loading && workspace.packages.length === 0 ? (
        <div className="grid place-items-center rounded-2xl border border-dashed border-border py-20 text-muted-foreground">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="size-6 animate-spin" />
            <p className="text-xs">Loading packages…</p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="grid place-items-center rounded-2xl border border-dashed border-border py-16 text-center">
          <p className="text-sm font-medium text-muted-foreground">
            {query.trim() ? `No packages match "${query}".` : 'No packages here.'}
          </p>
          <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground/80">
            {query.trim()
              ? 'Try a different tracking code, recipient, or destination.'
              : 'Create a package or accept a transfer to see packages here.'}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border">
          {filtered.map((item) => (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedId(item.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setSelectedId(item.id)
                }
              }}
              className="group flex w-full cursor-pointer items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/40 sm:items-center sm:gap-4 sm:px-5"
            >
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                <PackageCheck className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-mono text-xs font-semibold">{item.trackingCode}</p>
                  <Badge variant="outline" className={cn('text-[10px]', statusClass(item.status))}>
                    {statusLabel(item.status)}
                  </Badge>
                  {item.openTransfer && item.isMine && (
                    <Badge variant="outline" className="border-violet-200 bg-violet-50 text-[9px] text-violet-700">
                      Awaiting driver
                    </Badge>
                  )}
                  {item.fragile && (
                    <Badge variant="outline" className="border-amber-200 bg-amber-50 px-1.5 py-0 text-[9px] text-amber-700">
                      Fragile
                    </Badge>
                  )}
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {item.receiver} · {item.origin} → {item.destination}
                </p>
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                  {item.currentCustodian ? `${item.currentCustodian.name} (${item.currentCustodian.role})` : 'No custodian'}
                  {item.assignedDriver && item.currentCustodian?.role !== 'DRIVER' ? ` · Driver: ${item.assignedDriver}` : ''}
                  {item.openTransfer && item.isMine ? ` · ${TRANSFER_RULE_LABEL[item.openTransfer.ruleType] ?? ''} transfer open — waiting for the driver to accept` : ''}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {canTransfer(item) && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        setTransferItemId(item.id)
                      }}
                      className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted"
                    >
                      <Truck className="size-3" /> Transfer to driver
                    </button>
                  )}
                  {officeDeliver(item) && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        setDeliverItem(item)
                      }}
                      className="flex items-center gap-1.5 rounded-lg bg-[#f07c42] px-2.5 py-1 text-[10px] font-semibold text-white transition-colors hover:bg-[#e3743e]"
                    >
                      <Send className="size-3" /> Deliver
                    </button>
                  )}
                  {awaitingConfirm(item) && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        setConfirmItem(item)
                      }}
                      className="flex items-center gap-1.5 rounded-lg bg-[#1f2523] px-2.5 py-1 text-[10px] font-semibold text-white transition-colors hover:bg-[#343b37]"
                    >
                      <KeyRound className="size-3" /> Enter delivery code
                    </button>
                  )}
                </div>
              </div>
              <div className="hidden shrink-0 text-right sm:block">
                <p className="font-mono text-[10px] text-muted-foreground">{timeAgo(item.updatedAt)}</p>
                {item.weight && <p className="mt-1 text-[10px] text-muted-foreground">{item.weight}</p>}
              </div>
            </div>
          ))}

          {/* Infinite-scroll sentinel — appended after the last row. */}
          {hasMorePackages ? (
            <div ref={sentinelRef} className="grid place-items-center py-4 text-muted-foreground">
              {loadingMore ? (
                <div className="flex items-center gap-2 text-xs">
                  <Loader2 className="size-4 animate-spin" /> Loading more…
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground/70">Scroll for more</p>
              )}
            </div>
          ) : (
            filtered.length > 0 && (
              <p className="py-3 text-center text-[10px] text-muted-foreground/60">
                All {workspace.packagesTotalCount} package{workspace.packagesTotalCount === 1 ? '' : 's'} loaded
              </p>
            )
          )}
        </div>
      )}

      <PackageDetail item={selected} onClose={() => setSelectedId(null)} />
      <CreatePackageDialog open={createOpen} onClose={() => setCreateOpen(false)} />

      {/* Quick-row actions — the same flows as the detail drawer */}
      <ConfirmDialog
        open={Boolean(deliverItem)}
        title={`Deliver ${deliverItem?.trackingCode ?? ''}?`}
        description="Initiates delivery to the receiver and generates a one-time 6-digit confirmation code. The package moves to “awaiting confirmation”."
        confirmLabel="Deliver"
        busy={busy}
        onConfirm={() => void runQuickDeliver()}
        onClose={() => setDeliverItem(null)}
      />
      <CodePromptDialog
        key={confirmItem ? `confirm-${confirmItem.id}` : 'none'}
        open={Boolean(confirmItem)}
        title={`Enter delivery code for ${confirmItem?.trackingCode ?? ''}`}
        description="The receiver should share the delivery code if they have not yet confirmed in their app."
        placeholder="000000"
        confirmLabel="Confirm delivery"
        initialValue={confirmItem ? (workspace.getCode(confirmItem.id) ?? '') : ''}
        busy={busy}
        onConfirm={(code) => void runQuickConfirm(code)}
        onClose={() => setConfirmItem(null)}
      />
      <CodeRevealDialog
        open={Boolean(reveal)}
        title="Delivery code"
        description="Share this code with the receiver — they use it to confirm the delivery."
        code={reveal?.code ?? null}
        onClose={() => setReveal(null)}
      />
      <DriverPickerDialog
        open={Boolean(transferItemId)}
        title="Transfer to a driver"
        description="A transfer will be created for the selected driver to pick up the package."
        onConfirm={(driverId) => runQuickTransfer(driverId)}
        onClose={() => setTransferItemId(null)}
      />
    </div>
  )
}
