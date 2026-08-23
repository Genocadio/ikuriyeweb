'use client'

import { useState } from 'react'
import { Check, Copy, Loader2 } from 'lucide-react'
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

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  busy?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            className="gap-2 bg-[#1f2523] text-white hover:bg-[#343b37]"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy && <Loader2 className="size-3.5 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function CodePromptDialog({
  open,
  title,
  description,
  placeholder = 'Enter code',
  confirmLabel = 'Verify & accept',
  initialValue = '',
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  description?: string
  placeholder?: string
  confirmLabel?: string
  initialValue?: string
  busy?: boolean
  onConfirm: (code: string) => void
  onClose: () => void
}) {
  const [code, setCode] = useState(initialValue)
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <Input
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder={placeholder}
          className="h-11 font-mono tracking-[0.3em]"
          autoFocus
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            className="gap-2 bg-[#1f2523] text-white hover:bg-[#343b37]"
            disabled={!code.trim() || busy}
            onClick={() => onConfirm(code.trim())}
          >
            {busy && <Loader2 className="size-3.5 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function CodeRevealDialog({
  open,
  title,
  description,
  code,
  onClose,
}: {
  open: boolean
  title: string
  description?: string
  code: string | null
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-center font-mono text-3xl font-bold tracking-[0.35em] text-amber-800">
            {code ?? '———'}
          </p>
        </div>
        {code && (
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => {
              void navigator.clipboard?.writeText(code)
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1500)
            }}
          >
            {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
            {copied ? 'Copied' : 'Copy code'}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}
