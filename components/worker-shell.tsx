'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Bell, CheckCheck, ChevronDown, Loader2, LogOut, RefreshCcw, Wifi, WifiOff } from 'lucide-react'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ALLOWED_PORTAL_ROLES, useAuth } from '@/lib/auth'
import { useWorkspace } from '@/lib/store'
import { LoginScreen } from '@/components/login-screen'
import { displayName, initials, timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'

export function WorkerShell({ children }: { children: React.ReactNode }) {
  const { status, user, logout } = useAuth()
  const workspace = useWorkspace()
  const [noticeOpen, setNoticeOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)

  if (status === 'loading') {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
          <p className="text-xs">Connecting to CavGo…</p>
        </div>
      </div>
    )
  }

  if (status === 'signedOut') {
    return (
      <>
        <LoginScreen />
        <ToastContainer position="top-right" autoClose={3200} newestOnTop theme="light" />
      </>
    )
  }

  if (!user || !ALLOWED_PORTAL_ROLES.includes(user.role)) {
    return (
      <div className="grid min-h-screen place-items-center bg-background p-4">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <span className="mx-auto grid size-12 place-items-center rounded-xl bg-muted text-lg font-bold text-muted-foreground">
            {user ? initials(user.firstName) : '?'}
          </span>
          <h1 className="mt-4 text-base font-semibold">Worker access required</h1>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {user?.email ?? 'This account'} is signed in with role{' '}
            <span className="font-mono font-semibold">{user?.role ?? 'UNKNOWN'}</span>. The worker console is available
            to <span className="font-mono">WORKER</span> and <span className="font-mono">DRIVER</span> accounts. Ask a
            CavGo administrator to assign the role.
          </p>
          <Button className="mt-5 h-9 w-full gap-2 bg-[#1f2523] text-white hover:bg-[#343b37]" onClick={logout}>
            <LogOut className="size-3.5" /> Log out
          </Button>
        </div>
      </div>
    )
  }

  const name = displayName(user)
  const unread = workspace.unread
  const liveState =
    workspace.error && workspace.lastSync == null
      ? { tone: 'text-red-600 bg-red-50 border-red-200', label: 'Offline', dot: 'bg-red-500' }
      : workspace.refreshing
        ? { tone: 'text-amber-700 bg-amber-50 border-amber-200', label: 'Syncing', dot: 'bg-amber-500' }
        : { tone: 'text-emerald-700 bg-emerald-50 border-emerald-200', label: 'Live', dot: 'bg-emerald-500' }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <ToastContainer position="top-right" autoClose={3200} newestOnTop theme="light" toastClassName="font-sans text-sm" />
      <header className="sticky top-0 z-20 flex min-h-20 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur sm:px-6 lg:px-10">
        <Link href="/" className="flex shrink-0 items-center gap-3" aria-label="CavGo packages">
          <span className="grid size-9 place-items-center rounded-xl bg-[#f07c42] text-lg font-black text-white">C</span>
          <span className="hidden sm:block">
            <span className="block font-mono text-sm font-bold tracking-tight">CAVGO</span>
            <span className="block text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Worker console</span>
          </span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          <Badge
            variant="outline"
            title={workspace.lastSync ? `Last synced ${timeAgo(new Date(workspace.lastSync).toISOString())}` : 'Not synced yet'}
            className={cn('hidden items-center gap-2 border font-mono text-[10px] uppercase tracking-wider sm:flex', liveState.tone)}
          >
            <span className={cn('size-1.5 animate-pulse rounded-full', liveState.dot)} />
            {liveState.label}
          </Badge>

          <div className="relative">
            <button
              className="relative grid size-9 place-items-center rounded-full border border-border bg-card text-muted-foreground"
              aria-label="Notifications"
              aria-expanded={noticeOpen}
              onClick={() => {
                setNoticeOpen((value) => !value)
                setProfileOpen(false)
              }}
            >
              <Bell className="size-4" />
              {unread > 0 && (
                <span className="absolute right-0.5 top-0.5 grid size-4 place-items-center rounded-full bg-[#ef8d54] text-[9px] font-bold text-white">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>
            {noticeOpen && (
              <div className="absolute right-0 top-12 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-border bg-card p-2 shadow-xl">
                <div className="flex items-center justify-between px-3 py-2">
                  <p className="text-sm font-semibold">Notifications</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="font-mono text-[10px]">
                      {unread} unread
                    </Badge>
                    {unread > 0 && (
                      <button
                        onClick={() => void workspace.markAllRead()}
                        className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground"
                      >
                        <CheckCheck className="size-3" /> Mark all read
                      </button>
                    )}
                  </div>
                </div>
                <div className="max-h-[22rem] overflow-y-auto">
                  {workspace.notices.length === 0 ? (
                    <p className="px-3 py-8 text-center text-xs text-muted-foreground">No notifications yet.</p>
                  ) : (
                    workspace.notices.slice(0, 10).map((notice) => (
                      <button
                        key={notice.id}
                        onClick={() => {
                          if (!notice.viewer.readAt) void workspace.markRead(notice.viewer.id)
                        }}
                        className="flex w-full gap-3 rounded-xl p-3 text-left hover:bg-muted"
                      >
                        <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', notice.viewer.readAt ? 'bg-muted-foreground/40' : 'bg-[#ef8d54]')} />
                        <span>
                          <span className={cn('block text-xs', !notice.viewer.readAt && 'font-semibold')}>{notice.title}</span>
                          <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">{notice.message}</span>
                          <span className="mt-1 block font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                            {notice.eventType} · {timeAgo(notice.createdAt)}
                          </span>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="relative">
            <button
              className="flex items-center gap-2 rounded-full border border-border bg-card p-1 pr-2"
              aria-label="Open profile menu"
              aria-expanded={profileOpen}
              onClick={() => {
                setProfileOpen((value) => !value)
                setNoticeOpen(false)
              }}
            >
              <span className="grid size-8 place-items-center rounded-full bg-[#d9e4dc] text-xs font-semibold text-[#31403a]">
                {initials(name)}
              </span>
              <ChevronDown className="hidden size-3.5 text-muted-foreground sm:block" />
            </button>
            {profileOpen && (
              <div className="absolute right-0 top-12 w-56 rounded-2xl border border-border bg-card p-2 shadow-xl">
                <div className="border-b border-border px-3 py-2">
                  <p className="text-xs font-semibold">{name}</p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{user.email}</p>
                  <Badge variant="outline" className="mt-2 font-mono text-[9px] uppercase tracking-wider">
                    {user.role}
                  </Badge>
                </div>
                <button
                  onClick={() => void workspace.refresh()}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs hover:bg-muted"
                >
                  <RefreshCcw className="size-3.5" /> Refresh data
                </button>
                <button
                  onClick={() => {
                    setProfileOpen(false)
                    logout()
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-destructive hover:bg-muted"
                >
                  <LogOut className="size-3.5" /> Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {workspace.error && (
        <div className="flex items-center justify-center gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
          <WifiOff className="size-3.5 shrink-0" />
          <span className="truncate">{workspace.error}</span>
          <button onClick={() => void workspace.refresh()} className="shrink-0 font-semibold underline underline-offset-2">
            Retry
          </button>
        </div>
      )}

      <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 md:py-8 lg:px-10 lg:py-9">{children}</main>

      <footer className="mx-auto flex w-full max-w-[1600px] items-center justify-between px-4 pb-8 text-[10px] text-muted-foreground sm:px-6 lg:px-10">
        <span className="flex items-center gap-1.5">
          <Wifi className="size-3" /> Connected to the CavGo API
          {workspace.lastSync && <span>· synced {timeAgo(new Date(workspace.lastSync).toISOString())}</span>}
        </span>
        <span className="hidden font-mono uppercase tracking-widest sm:block">Worker console · {user.role}</span>
      </footer>
    </div>
  )
}
