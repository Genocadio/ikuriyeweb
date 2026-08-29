'use client'

import { useState } from 'react'
import { Loader2, PackagePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useWorkspace } from '@/lib/store'
import type { DeliveryType, TransferRuleType } from '@/lib/types'
import { cn } from '@/lib/utils'
import { CodeRevealDialog } from './dialogs'

const TRANSFER_RULES: Array<{ value: TransferRuleType | 'NONE'; label: string; hint: string }> = [
  { value: 'NONE', label: 'No transfer', hint: 'Package stays in your custody' },
  { value: 'AUTO', label: 'Auto', hint: 'Anyone can accept' },
  { value: 'SECURE', label: 'Code protected', hint: '8-char code required' },
  { value: 'CONFIRM', label: 'Two-step', hint: 'Request → owner confirms' },
]

function num(value: string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function CreatePackageDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { createPackage } = useWorkspace()
  const [busy, setBusy] = useState(false)
  // Web always creates FIXED_ROUTE packages (the Android app handles OPEN).
  const deliveryType: DeliveryType = 'FIXED_ROUTE'
  const [ruleType, setRuleType] = useState<TransferRuleType | 'NONE'>('AUTO')

  const [senderName, setSenderName] = useState('')
  const [senderPhone, setSenderPhone] = useState('')
  const [receiverName, setReceiverName] = useState('')
  const [receiverPhone, setReceiverPhone] = useState('')
  const [originName, setOriginName] = useState('')
  const [originLat, setOriginLat] = useState('0')
  const [originLng, setOriginLng] = useState('0')
  const [destName, setDestName] = useState('')
  const [destLat, setDestLat] = useState('0')
  const [destLng, setDestLng] = useState('0')
  const [weight, setWeight] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [fragile, setFragile] = useState(false)

  const [reveal, setReveal] = useState<{ code: string | null } | null>(null)

  const valid = Boolean(senderName.trim() && receiverName.trim() && originName.trim() && destName.trim())

  async function submit() {
    if (!valid || busy) return
    setBusy(true)
    try {
      const result = await createPackage({
        deliveryType,
        sender: { role: 'SENDER', name: senderName.trim(), phone: senderPhone.trim() || null },
        receiver: { role: 'RECEIVER', name: receiverName.trim(), phone: receiverPhone.trim() || null },
        origin: { type: 'ORIGIN', latitude: num(originLat), longitude: num(originLng), placeName: originName.trim() },
        destination: { type: 'DESTINATION', latitude: num(destLat), longitude: num(destLng), placeName: destName.trim() },
        details: {
          weight: weight ? num(weight) : null,
          category: category.trim() || null,
          description: description.trim() || null,
          fragile: fragile || null,
        },
        transferRuleType: ruleType === 'NONE' ? null : ruleType,
      })
      // Only a SECURE transfer produces a code worth revealing — NONE/AUTO
      // have nothing to show, so keep the dialog closed for those.
      if (result.secureCode) {
        setReveal({ code: result.secureCode })
      } else {
        onClose()
      }
    } catch {
      /* error toasted by the store */
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>New package</DialogTitle>
            <DialogDescription>
              Log an incoming shipment. Workers must supply the sender; you automatically become the first custodian.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-muted-foreground">Sender</p>
                <Input placeholder="Name" value={senderName} onChange={(event) => setSenderName(event.target.value)} />
                <Input placeholder="Phone (optional)" value={senderPhone} onChange={(event) => setSenderPhone(event.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-muted-foreground">Receiver</p>
                <Input placeholder="Name" value={receiverName} onChange={(event) => setReceiverName(event.target.value)} />
                <Input placeholder="Phone (optional)" value={receiverPhone} onChange={(event) => setReceiverPhone(event.target.value)} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-muted-foreground">Origin</p>
                <Input placeholder="Pickup name" value={originName} onChange={(event) => setOriginName(event.target.value)} />
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Lat" value={originLat} onChange={(event) => setOriginLat(event.target.value)} />
                  <Input placeholder="Lng" value={originLng} onChange={(event) => setOriginLng(event.target.value)} />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-muted-foreground">Destination</p>
                <Input placeholder="Drop-off name" value={destName} onChange={(event) => setDestName(event.target.value)} />
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Lat" value={destLat} onChange={(event) => setDestLat(event.target.value)} />
                  <Input placeholder="Lng" value={destLng} onChange={(event) => setDestLng(event.target.value)} />
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-muted-foreground">Details</p>
                <Input placeholder="Weight (kg, optional)" value={weight} onChange={(event) => setWeight(event.target.value)} />
                <Input placeholder="Category (optional)" value={category} onChange={(event) => setCategory(event.target.value)} />
              </div>
              <div className="flex flex-col gap-2 pt-6">
                <Input placeholder="Description (optional)" value={description} onChange={(event) => setDescription(event.target.value)} />
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={fragile} onChange={(event) => setFragile(event.target.checked)} className="size-3.5 accent-[#f07c42]" />
                  Fragile item
                </label>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">Transfer rule</p>
              <div className="grid grid-cols-2 gap-2">
                {TRANSFER_RULES.map((rule) => (
                  <button
                    key={rule.value}
                    onClick={() => setRuleType(rule.value)}
                    className={cn(
                      'rounded-xl border p-3 text-left transition-colors',
                      ruleType === rule.value ? 'border-[#1f2523] bg-[#1f2523] text-white' : 'border-border hover:bg-muted/50',
                    )}
                  >
                    <p className="text-xs font-semibold">{rule.label}</p>
                    <p className={cn('mt-1 text-[10px] leading-relaxed', ruleType === rule.value ? 'text-white/60' : 'text-muted-foreground')}>
                      {rule.hint}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              className="gap-2 bg-[#f07c42] text-white hover:bg-[#e3743e]"
              disabled={!valid || busy}
              onClick={() => void submit()}
            >
              {busy && <Loader2 className="size-3.5 animate-spin" />}
              <PackagePlus className="size-3.5" />
              Create package
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CodeRevealDialog
        open={Boolean(reveal)}
        title="Secure transfer code — save this once"
        description={reveal?.code ? 'Share this code with the worker or driver who will accept the transfer. It will not be shown again.' : ''}
        code={reveal?.code ?? null}
        onClose={() => {
          setReveal(null)
          onClose()
        }}
      />
    </>
  )
}
