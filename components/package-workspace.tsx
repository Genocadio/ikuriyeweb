'use client'

import { useMemo, useState } from 'react'
import { Box, Loader2, PackageCheck, Plus, RefreshCcw, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/lib/auth'
import { useWorkspace } from '@/lib/store'
import { GROUPS, groupForPackage, statusClass, statusLabel } from '@/lib/status'
import { timeAgo } from '@/lib/format'
import type { PackageItem } from '@/lib/types'
import { cn } from '@/lib/utils'
import { CustodyInbox } from '@/components/workspace/inbox'
import { PackageDetail } from '@/components/workspace/package-detail'
import { CreatePackageDialog } from '@/components/workspace/create-package-dialog'

export function PackageWorkspace() {
  const { user } = useAuth()
  const workspace = useWorkspace()
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const meId = user?.id ?? ''

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return workspace.packages
    return workspace.packages.filter((item) =>
      `${item.trackingCode} ${item.receiver} ${item.destination} ${item.sender} ${item.currentCustodian?.name ?? ''}`
        .toLowerCase()
        .includes(q),
    )
  }, [workspace.packages, query])

  const selected = workspace.packages.find((item) => item.id === selectedId) ?? null

  return (
    <div className="flex flex-col gap-6">
      <CustodyInbox />

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
          <Button
            size="sm"
            variant="outline"
            className="h-9 gap-2 bg-card"
            onClick={() => void workspace.refresh()}
            disabled={workspace.refreshing}
          >
            <RefreshCcw className={cn('size-3.5', workspace.refreshing && 'animate-spin')} />
            Refresh
          </Button>
          <Button size="sm" className="h-9 shrink-0 gap-2 bg-[#1f2523] text-white hover:bg-[#343b37]" onClick={() => setCreateOpen(true)}>
            <Plus className="size-3.5" /> New package
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-end">
        <Badge variant="secondary" className="h-8 gap-1.5 px-3 font-mono text-[10px]">
          <Box className="size-3" /> {workspace.packages.length} package{workspace.packages.length === 1 ? '' : 's'}
        </Badge>
      </div>

      {workspace.loading && workspace.packages.length === 0 ? (
        <div className="grid place-items-center rounded-2xl border border-dashed border-border py-20 text-muted-foreground">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="size-6 animate-spin" />
            <p className="text-xs">Loading packages from the CavGo API…</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {GROUPS.map((group) => {
            const items = filtered.filter((item) => groupForPackage(item, meId) === group.key)
            if (items.length === 0 && group.key === 'cancelled') return null
            return <GroupCard key={group.key} groupKey={group.key} items={items} onSelect={setSelectedId} />
          })}
          {filtered.length === 0 && (
            <div className="grid place-items-center rounded-2xl border border-dashed border-border py-16 text-center">
              <p className="text-sm font-medium text-muted-foreground">
                {query.trim() ? `No packages match “${query}”.` : 'No packages yet.'}
              </p>
              <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground/80">
                {query.trim()
                  ? 'Try a different tracking code, recipient, or destination.'
                  : 'Create a package, claim an offer from the inbox, or accept a transfer to see packages here.'}
              </p>
            </div>
          )}
        </div>
      )}

      <PackageDetail item={selected} onClose={() => setSelectedId(null)} />
      <CreatePackageDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}

function GroupCard({
  groupKey,
  items,
  onSelect,
}: {
  groupKey: (typeof GROUPS)[number]['key']
  items: PackageItem[]
  onSelect: (id: string) => void
}) {
  const group = GROUPS.find((g) => g.key === groupKey)!
  return (
    <Card className="border-border bg-card shadow-none">
      <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('size-2 rounded-full', group.dot)} />
            <CardTitle className="text-base">{group.title}</CardTitle>
            <Badge variant="outline" className="font-mono text-[10px]">{items.length}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{group.description}</p>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <div className="px-4 py-5 text-xs text-muted-foreground sm:px-5">Nothing here right now.</div>
        ) : (
          <div className="divide-y divide-border">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => onSelect(item.id)}
                className="group flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/40 sm:gap-4 sm:px-5"
              >
                <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                  <PackageCheck className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-xs font-semibold">{item.trackingCode}</p>
                    {item.fragile && (
                      <Badge variant="outline" className="border-amber-200 bg-amber-50 px-1.5 py-0 text-[9px] text-amber-700">Fragile</Badge>
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {item.receiver} · {item.origin} → {item.destination}
                  </p>
                  <p className="mt-1 truncate text-[10px] text-muted-foreground">
                    {item.currentCustodian ? `Held by ${item.currentCustodian.name} (${item.currentCustodian.role})` : 'No custodian'}
                    {item.assignedDriver && item.currentCustodian?.role !== 'DRIVER' ? ` · ${item.assignedDriver}` : ''}
                  </p>
                </div>
                <div className="hidden text-right sm:block">
                  <Badge variant="outline" className={cn('text-[10px]', statusClass(item.status))}>{statusLabel(item.status)}</Badge>
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">{timeAgo(item.updatedAt)}</p>
                  {item.weight && <p className="mt-1 text-[10px] text-muted-foreground">{item.weight}</p>}
                </div>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
