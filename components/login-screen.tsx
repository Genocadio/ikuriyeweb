'use client'

import { useState } from 'react'
import { AlertCircle, KeyRound, Loader2, Lock, LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth'

export function LoginScreen() {
  const { login, loginWithToken, error, nexxauthConfigured } = useAuth()
  const [mode, setMode] = useState<'password' | 'token'>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)

  async function submitPassword(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      await login(email, password)
    } catch {
      /* error surfaced via auth state */
    } finally {
      setBusy(false)
    }
  }

  async function submitToken(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      await loginWithToken(token)
    } catch {
      /* error surfaced via auth state */
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-[#f07c42] text-2xl font-black text-white shadow-lg shadow-orange-500/25">
            C
          </span>
          <p className="mt-4 font-mono text-xl font-bold tracking-tight">CAVGO</p>
          <p className="mt-1 text-xs uppercase tracking-[0.25em] text-muted-foreground">Worker console</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex gap-1 rounded-xl bg-muted p-1">
            <button
              type="button"
              onClick={() => setMode('password')}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold',
                mode === 'password' ? 'bg-card shadow-sm' : 'text-muted-foreground',
              )}
            >
              <LogIn className="size-3.5" /> Sign in
            </button>
            <button
              type="button"
              onClick={() => setMode('token')}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold',
                mode === 'token' ? 'bg-card shadow-sm' : 'text-muted-foreground',
              )}
            >
              <KeyRound className="size-3.5" /> Paste token
            </button>
          </div>

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-relaxed text-red-700">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {mode === 'password' ? (
            <form onSubmit={submitPassword} className="mt-5 flex flex-col gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Email</span>
                <Input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="worker@cavgo.example"
                  className="h-10"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Password</span>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 size-4 text-muted-foreground" />
                  <Input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••"
                    className="h-10 pl-9"
                  />
                </div>
              </label>
              <Button type="submit" disabled={busy} className="mt-2 h-10 gap-2 bg-[#1f2523] text-white hover:bg-[#343b37]">
                {busy && <Loader2 className="size-4 animate-spin" />}
                {busy ? 'Signing in…' : 'Sign in'}
              </Button>
              {!nexxauthConfigured && (
                <p className="mt-2 text-center text-[11px] leading-relaxed text-muted-foreground">
                  Password sign-in needs <code className="font-mono">NEXT_PUBLIC_NEXXAUTH_BASE_URL</code> and{' '}
                  <code className="font-mono">NEXT_PUBLIC_NEXXAUTH_CLIENT_ID</code>. Use "Paste token" until they are set.
                </p>
              )}
            </form>
          ) : (
            <form onSubmit={submitToken} className="mt-5 flex flex-col gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Access token</span>
                <textarea
                  required
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  placeholder="eyJhbGciOi…"
                  rows={3}
                  className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 font-mono text-xs outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-foreground/40"
                />
              </label>
              <Button type="submit" disabled={busy} className="mt-2 h-10 gap-2 bg-[#1f2523] text-white hover:bg-[#343b37]">
                {busy && <Loader2 className="size-4 animate-spin" />}
                {busy ? 'Validating…' : 'Connect with token'}
              </Button>
              <p className="mt-2 text-center text-[11px] leading-relaxed text-muted-foreground">
                Paste an access token from Nexxauth. It is stored locally in your browser and sent only to
                the CavGo API.
              </p>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-muted-foreground">
          Worker accounts must be assigned the <span className="font-mono">WORKER</span> or{' '}
          <span className="font-mono">DRIVER</span> role by a CavGo administrator.
        </p>
      </div>
    </div>
  )
}
