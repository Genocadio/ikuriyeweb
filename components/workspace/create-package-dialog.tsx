'use client'

import { useState, useRef, useEffect } from 'react'
import { Loader2, PackagePlus, UserRound, X, MapPin } from 'lucide-react'
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
import { DriverPickerDialog } from './driver-picker-dialog'

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

const RWANDA_LOCATIONS: Record<string, [number, number]> = {
  'Kicukiro, Kigali': [-1.9536, 30.0936], 'Nyarugenge, Kigali': [-1.9440, 29.9840],
  'Remera, Kigali': [-1.9520, 30.0610], 'Kimironko, Kigali': [-1.9380, 30.0780],
  'Nyabugogo, Kigali': [-1.9420, 29.9960], 'Gikondo, Kigali': [-1.9600, 30.0700],
  'Kanombe, Kigali': [-1.9600, 30.0900], 'Niboye, Kigali': [-1.9700, 30.0850],
  'Gatenga, Kigali': [-1.9550, 30.0800], 'Gahanga, Kigali': [-1.9650, 30.0950],
  'Kabeza, Kigali': [-1.9500, 30.0750], 'Nyamirambo, Kigali': [-1.9550, 29.9950],
  'Kimisagara, Kigali': [-1.9450, 29.9900], 'Muhima, Kigali': [-1.9430, 30.0000],
  'Nyakabanda, Kigali': [-1.9500, 30.0050], 'Kiyovu, Kigali': [-1.9470, 30.0100],
  'Rugando, Kigali': [-1.9400, 30.0150], 'Kacyiru, Kigali': [-1.9350, 30.0200],
  'Gisozi, Kigali': [-1.9300, 30.0250], 'Kibagabaga, Kigali': [-1.9250, 30.0400],
  'Kimihurura, Kigali': [-1.9400, 30.0500], 'Nyarutarama, Kigali': [-1.9350, 30.0550],
  'Kagarama, Kigali': [-1.9300, 30.0600], 'Biryogo, Kigali': [-1.9380, 30.0350],
  'Busanza, Kigali': [-1.9650, 30.0750], 'Giporoso, Kigali': [-1.9550, 30.0850],
  'Kicukiro Center, Kigali': [-1.9530, 30.0900],
  'Musanze Town': [-1.4990, 29.6330], 'Ruhengeri, Musanze': [-1.5000, 29.6300],
  'Kinigi, Musanze': [-1.4500, 29.5800],
  'Byumba, Gicumbi': [-1.5760, 29.5560], 'Rulindo Town': [-1.5300, 29.6200],
  'Burera': [-1.3500, 29.5500], 'Gakenke': [-1.5500, 29.5000],
  'Cyumba, Gicumbi': [-1.5200, 29.5800], 'Miyove, Gicumbi': [-1.6000, 29.5200],
  'Nemba, Gicumbi': [-1.5800, 29.5300],
  'Huye Town': [-2.5930, 29.5400], 'Butare, Huye': [-2.5950, 29.5380],
  'Nyanza Town': [-2.4900, 29.7300], 'Nyamagabe': [-2.4800, 29.5600],
  'Gisagara': [-2.5300, 29.5800], 'Muhanga Town': [-2.0800, 29.7600],
  'Ruhango': [-2.2200, 29.7800], 'Kamonyi': [-2.1500, 29.8000],
  'Rubavu Town': [-1.6700, 29.2600], 'Gisenyi, Rubavu': [-1.6720, 29.2580],
  'Rusizi Town': [-2.4900, 28.9100], 'Kamembe, Rusizi': [-2.4850, 28.9150],
  'Karongi Town': [-2.0500, 29.3800], 'Kibuye, Karongi': [-2.0520, 29.3780],
  'Nyamasheke': [-2.3500, 29.1500], 'Rutsiro': [-1.9500, 29.3500],
  'Ngororero': [-1.8500, 29.6200], 'Nyabihu': [-1.6500, 29.5500],
  'Rwamagana Town': [-1.9500, 30.4400], 'Nyagatare Town': [-1.3000, 30.3200],
  'Bugesera': [-2.2500, 30.1500], 'Ngoma Town': [-2.1800, 30.5200],
  'Kayonza Town': [-1.9000, 30.3800], 'Gatsibo': [-1.7500, 30.4500],
  'Kirehe': [-2.1500, 30.6500],
  'Akagera National Park': [-1.8500, 30.4500], 'Volcanoes National Park': [-1.4500, 29.5500],
  'Nyungwe National Park': [-2.4800, 29.2500],
  'Lake Kivu': [-2.0000, 29.1000], 'Lake Muhazi': [-1.8500, 30.3500],
  'Lake Burera': [-1.4000, 29.5500], 'Lake Ruhondo': [-1.4200, 29.5800],
}

function LocationSuggestionInput({
  value,
  onChange,
  onCoordinatesChange,
  placeholder,
  icon,
}: {
  value: string
  onChange: (v: string) => void
  onCoordinatesChange?: (lat: number, lng: number) => void
  placeholder: string
  icon?: React.ReactNode
}) {
  const [focused, setFocused] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const locationNames = Object.keys(RWANDA_LOCATIONS)
  const filtered = value.trim()
    ? locationNames.filter((loc) =>
        loc.toLowerCase().includes(value.toLowerCase())
      )
    : locationNames.slice(0, 8) // show popular locations when empty

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {icon}
          </span>
        )}
        <input
          ref={inputRef}
          type="text"
          value={value}
          placeholder={placeholder}
          className={`flex h-9 w-full rounded-xl border border-border bg-transparent px-3 py-1 text-xs shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#f07c42] disabled:cursor-not-allowed disabled:opacity-50 ${icon ? 'pl-9' : ''}`}
          onFocus={() => { setFocused(true); setShowDropdown(true) }}
          onBlur={() => setFocused(false)}
          onChange={(e) => {
            onChange(e.target.value)
            setShowDropdown(true)
          }}
        />
      </div>
      {showDropdown && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-border bg-white shadow-lg dark:bg-zinc-900">
          {filtered.map((loc) => (
            <button
              key={loc}
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted/50"
              onMouseDown={(e) => {
                e.preventDefault()
                onChange(loc)
                // Auto-fill coordinates when selecting from suggestions
                const coords = RWANDA_LOCATIONS[loc]
                if (coords && onCoordinatesChange) {
                  onCoordinatesChange(coords[0], coords[1])
                }
                setShowDropdown(false)
              }}
            >
              <MapPin className="size-3 shrink-0 text-muted-foreground" />
              <span>{loc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function CreatePackageDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const workspace = useWorkspace()
  const { createPackage, drivers } = workspace
  const [busy, setBusy] = useState(false)
  // Web always creates FIXED_ROUTE packages (the Android app handles OPEN).
  const deliveryType: DeliveryType = 'FIXED_ROUTE'
  const [ruleType, setRuleType] = useState<TransferRuleType | 'NONE'>('AUTO')
  const [matchDriverId, setMatchDriverId] = useState<string | null>(null)
  const [matchDriverName, setMatchDriverName] = useState<string | null>(null)
  const [driverPickerOpen, setDriverPickerOpen] = useState(false)

  const [senderName, setSenderName] = useState('')
  const [senderPhone, setSenderPhone] = useState('')
  const [receiverName, setReceiverName] = useState('')
  const [receiverPhone, setReceiverPhone] = useState('')
  const [originName, setOriginName] = useState('')
  const [originCoords, setOriginCoords] = useState<[number, number]>([0, 0])
  const [destName, setDestName] = useState('')
  const [destCoords, setDestCoords] = useState<[number, number]>([0, 0])
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
        origin: { type: 'ORIGIN', latitude: originCoords[0], longitude: originCoords[1], placeName: originName.trim() },
        destination: { type: 'DESTINATION', latitude: destCoords[0], longitude: destCoords[1], placeName: destName.trim() },
        details: {
          weight: weight ? num(weight) : null,
          category: category.trim() || null,
          description: description.trim() || null,
          fragile: fragile || null,
        },
        transferRuleType: ruleType === 'NONE' ? null : ruleType,
        transferMatchUserId: matchDriverId ?? null,
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
                <LocationSuggestionInput
                  value={originName}
                  onChange={setOriginName}
                  onCoordinatesChange={(lat, lng) => setOriginCoords([lat, lng])}
                  placeholder="Pickup location"
                  icon={<MapPin className="size-3.5" />}
                />
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-muted-foreground">Destination</p>
                <LocationSuggestionInput
                  value={destName}
                  onChange={setDestName}
                  onCoordinatesChange={(lat, lng) => setDestCoords([lat, lng])}
                  placeholder="Drop-off location"
                  icon={<MapPin className="size-3.5" />}
                />
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
                    onClick={() => {
                      setRuleType(rule.value)
                      // Clear driver selection when switching to no transfer
                      if (rule.value === 'NONE') {
                        setMatchDriverId(null)
                        setMatchDriverName(null)
                      }
                    }}
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

              {ruleType !== 'NONE' && (
                <div className="mt-1">
                  <p className="mb-1.5 text-[10px] font-medium text-muted-foreground">Assign to driver (optional)</p>
                  {matchDriverId ? (
                    <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2">
                      <UserRound className="size-3.5 text-muted-foreground" />
                      <span className="flex-1 truncate text-xs font-medium">{matchDriverName}</span>
                      <button
                        onClick={() => { setMatchDriverId(null); setMatchDriverName(null) }}
                        className="grid size-5 place-items-center rounded-md text-muted-foreground hover:bg-muted"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDriverPickerOpen(true)}
                      className="flex w-full items-center gap-2 rounded-xl border border-dashed border-border p-2.5 text-left text-xs text-muted-foreground hover:bg-muted/50"
                    >
                      <UserRound className="size-3.5" />
                      Pick a driver…
                    </button>
                  )}
                </div>
              )}
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

      <DriverPickerDialog
        open={driverPickerOpen}
        title="Select driver"
        description="Choose a driver to pick up this package. They will receive a transfer request."
        onConfirm={async (id) => {
          const driver = drivers.find((d) => d.id === id)
          setMatchDriverId(id)
          setMatchDriverName(driver ? (driver.firstName ?? driver.email) : 'Driver')
        }}
        onClose={() => setDriverPickerOpen(false)}
      />
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
