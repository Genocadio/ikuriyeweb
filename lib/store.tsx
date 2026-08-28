'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-toastify'
import { isAuthError } from './client'
import * as api from './api'
import { subscribeGraphql } from './realtime'
import { useAuth } from './auth'
import type { DeliveryPackage, Notice, PackageItem, PackageStatus, Transfer, TransferRuleType, User } from './types'
import { toPackageItem } from './api'

const CODES_KEY = 'cavgo.deliveryCodes'
const SECURE_KEY = 'cavgo.secureTransferCodes'
// Slow safety-net sync for the operational board. New packages/offers/transfers
// arrive via the GraphQL subscription; notices arrive via the noticeCreated
// GraphQL subscription. This timer only covers changes neither subscription
// fires for (e.g. another worker accepting a transfer you are watching).
const SYNC_INTERVAL_MS = 60_000

interface WorkspaceState {
  loading: boolean
  refreshing: boolean
  error: string | null
  lastSync: number | null
  packages: PackageItem[]
  offers: DeliveryPackage[]
  pendingTransfers: Transfer[]
  requestedTransfers: Transfer[]
  myTransfers: Transfer[]
  notices: Notice[]
  unread: number
  drivers: User[]
  codes: Record<string, string>
  secureCodes: Record<string, string>
}

interface WorkspaceActions {
  refresh: () => Promise<void>
  acceptTransfer: (transferId: string, code?: string, opts?: { successMessage?: string }) => Promise<void>
  claimPackage: (packageId: string) => Promise<void>
  createPackage: (input: api.CreatePackageInput) => Promise<{
    packageId: string
    transferId: string | null
    secureCode: string | null
  }>
  assignDriver: (packageId: string, driverId: string) => Promise<void>
  advanceStatus: (packageId: string, status: PackageStatus, opts?: { notes?: string }) => Promise<void>
  initiateDelivery: (packageId: string) => Promise<string>
  confirmDelivery: (packageId: string, deliveryCode: string) => Promise<void>
  regenerateDeliveryCode: (packageId: string) => Promise<string>
  createTransferForPackages: (packageIds: string[], ruleType: TransferRuleType) => Promise<Transfer>
  cancelTransfer: (transferId: string) => Promise<void>
  confirmTransfer: (transferId: string) => Promise<void>
  rejectTransfer: (transferId: string) => Promise<void>
  regenerateTransferCode: (transferId: string) => Promise<string>
  markRead: (viewerId: string) => Promise<void>
  markAllRead: () => Promise<void>
  saveCode: (packageId: string, code: string) => void
  getCode: (packageId: string) => string | undefined
  saveSecureCode: (transferId: string, code: string) => void
  getSecureCode: (transferId: string) => string | undefined
}

type WorkspaceContextValue = WorkspaceState & WorkspaceActions

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

function readRecord(key: string): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

function writeRecord(key: string, record: Record<string, string>) {
  try {
    localStorage.setItem(key, JSON.stringify(record))
  } catch {
    /* ignore */
  }
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { token, status, user, handleSessionExpired } = useAuth()
  const meId = user?.id ?? ''

  const [state, setState] = useState<WorkspaceState>({
    loading: true,
    refreshing: false,
    error: null,
    lastSync: null,
    packages: [],
    offers: [],
    pendingTransfers: [],
    requestedTransfers: [],
    myTransfers: [],
    notices: [],
    unread: 0,
    drivers: [],
    codes: readRecord(CODES_KEY),
    secureCodes: readRecord(SECURE_KEY),
  })
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const patch = useCallback(
    (update: Partial<WorkspaceState> | ((prev: WorkspaceState) => Partial<WorkspaceState>)) => {
      if (mounted.current) {
        setState((prev) => ({ ...prev, ...(typeof update === 'function' ? update(prev) : update) }))
      }
    },
    [],
  )

  const fail = useCallback(
    (error: unknown, notify: boolean): boolean => {
      if (isAuthError(error)) {
        handleSessionExpired()
        return false
      }
      if (notify) {
        patch({ error: error instanceof Error ? error.message : 'Failed to load workspace data' })
      }
      return false
    },
    [handleSessionExpired, patch],
  )

  // Operational data: packages, offers, transfers, drivers.
  const loadWorkspace = useCallback(async (): Promise<boolean> => {
    if (!token) return false
    try {
      const [pkgRes, offersRes, pendingRes, requestedRes, mineRes, driversRes] = await Promise.all([
        api.fetchMyPackages(token),
        api.fetchAvailablePackages(token),
        api.fetchTransfersByStatus(token, 'PENDING'),
        api.fetchTransfersByStatus(token, 'REQUESTED'),
        api.fetchMyTransfers(token),
        api.fetchDrivers(token),
      ])
      patch({
        packages: pkgRes.myPackages.items.map((p) => toPackageItem(p, meId)),
        offers: offersRes.availablePackages.items,
        pendingTransfers: pendingRes.transfersByStatus,
        requestedTransfers: requestedRes.transfersByStatus,
        myTransfers: mineRes.myTransfers,
        drivers: driversRes.searchUsers,
        lastSync: Date.now(),
        error: null,
      })
      return true
    } catch (error) {
      return fail(error, true)
    }
  }, [token, meId, patch, fail])

  // Notice feed — initial fetch + periodic sync fallback.
  const loadNotices = useCallback(async (): Promise<boolean> => {
    if (!token) return false
    try {
      const [noticesRes, unreadRes] = await Promise.all([api.fetchMyNotices(token), api.fetchUnreadCount(token)])
      patch({ notices: noticesRes.myNotices, unread: unreadRes.unreadNoticeCount })
      return true
    } catch (error) {
      // Silent — notices are pushed via the GraphQL subscription; a failed fetch must
      // not trip the workspace error banner.
      return fail(error, false)
    }
  }, [token, patch, fail])

  const loadAll = useCallback(async (): Promise<boolean> => {
    const results = await Promise.all([loadWorkspace(), loadNotices()])
    return results.some(Boolean)
  }, [loadWorkspace, loadNotices])

  const refresh = useCallback(async () => {
    patch({ refreshing: true })
    await loadAll()
    patch({ refreshing: false })
  }, [patch, loadAll])

  // Initial load + slow background sync for the operational board.
  useEffect(() => {
    if (status !== 'signedIn' || !token) return
    patch({ loading: true })
    void loadAll().finally(() => patch({ loading: false }))
    const interval = window.setInterval(() => {
      if (document.hidden) return
      void loadWorkspace()
    }, SYNC_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [status, token, loadWorkspace, patch])

  // GraphQL subscription — instant cue + refresh for newly created package+transfer events.
  // Reconnects with bounded backoff when the WebSocket drops.
  useEffect(() => {
    if (status !== 'signedIn' || !token || typeof window === 'undefined') return
    let stop = false
    let unsubscribe = () => {}
    let attempts = 0
    const connect = () => {
      if (stop) return
      // Close any lingering socket before opening a new one — onError can fire
      // while the previous connection is still alive. close() is idempotent.
      unsubscribe()
      unsubscribe = subscribeGraphql<{ newPackageTransfer: { deliveryPackage: { trackingCode: string } } }>({
        token,
        query: `subscription NewPackageTransfer {
          newPackageTransfer {
            deliveryPackage { id trackingCode status }
            transfer { id ruleType acceptorType status }
          }
        }`,
        onNext: (data) => {
          const code = data.newPackageTransfer?.deliveryPackage?.trackingCode
          toast.info(code ? `New package ${code} is ready to accept` : 'New package offer received')
          void loadWorkspace()
        },
        onError: () => {
          if (stop) return
          attempts += 1
          if (attempts < 5) {
            window.setTimeout(connect, Math.min(attempts * 4_000, 20_000))
          } else {
            console.warn('[realtime] GraphQL subscription gave up after retries — using the 60s sync')
          }
        },
      })
    }
    connect()
    return () => {
      stop = true
      unsubscribe()
    }
  }, [status, token, loadWorkspace])

  // GraphQL subscription — real-time notice feed via WebSocket (replaces Supabase Realtime).
  // New notices are pushed instantly; falls back to the 60s polling interval on failure.
  useEffect(() => {
    if (status !== 'signedIn' || !token || typeof window === 'undefined') return
    let stop = false
    let unsubscribe = () => {}
    let attempts = 0
    const connect = () => {
      if (stop) return
      unsubscribe()
      unsubscribe = subscribeGraphql<{
        noticeCreated: {
          id: string
          resourceType: string
          resourceId: string
          eventType: string
          actorId: string | null
          title: string
          message: string
          payload: string | null
          viewer: { id: string; noticeId: string; userId: string; deliveredAt: string | null; readAt: string | null }
          createdAt: string
        }
      }>({
        token,
        query: `subscription NoticeCreated {
          noticeCreated {
            id resourceType resourceId eventType actorId title message payload
            viewer { id noticeId userId deliveredAt readAt }
            createdAt
          }
        }`,
        onNext: (data) => {
          const notice = data.noticeCreated
          if (!notice) return
          patch((prev) => {
            // Deduplicate — the 60s sync may have already fetched this notice.
            if (prev.notices.some((n) => n.viewer.id === notice.viewer.id)) return {}
            return {
              notices: [notice, ...prev.notices],
              unread: prev.unread + 1,
            }
          })
          toast.info(notice.title)
        },
        onError: () => {
          if (stop) return
          attempts += 1
          if (attempts < 5) {
            window.setTimeout(connect, Math.min(attempts * 4_000, 20_000))
          } else {
            console.warn('[realtime] notice subscription gave up after retries — using the 60s sync')
          }
        },
      })
    }
    connect()
    return () => {
      stop = true
      unsubscribe()
    }
  }, [status, token, patch])

  // ── Local key-value helpers (delivery codes / secure transfer codes) ────

  const saveCode = useCallback((packageId: string, code: string) => {
    const next = { ...readRecord(CODES_KEY), [packageId]: code }
    writeRecord(CODES_KEY, next)
    patch({ codes: next })
  }, [patch])

  const getCode = useCallback((packageId: string) => readRecord(CODES_KEY)[packageId], [])

  const saveSecureCode = useCallback((transferId: string, code: string) => {
    const next = { ...readRecord(SECURE_KEY), [transferId]: code }
    writeRecord(SECURE_KEY, next)
    patch({ secureCodes: next })
  }, [patch])

  const getSecureCode = useCallback((transferId: string) => readRecord(SECURE_KEY)[transferId], [])

  // ── Mutations ────────────────────────────────────────────────────────────

  const runMutation = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T> => {
      try {
        const result = await fn()
        await loadAll()
        return result
      } catch (error) {
        if (isAuthError(error)) {
          handleSessionExpired()
          throw error
        }
        const message = error instanceof Error ? error.message : 'Operation failed'
        toast.error(message)
        throw error
      }
    },
    [loadAll, handleSessionExpired],
  )

  const acceptTransfer = useCallback(
    async (transferId: string, code?: string, opts?: { successMessage?: string }) => {
      await runMutation(() => api.acceptTransfer(token!, transferId, code))
      toast.success(opts?.successMessage ?? 'Transfer accepted')
    },
    [token, runMutation],
  )

  const claimPackage = useCallback(
    async (packageId: string) => {
      await runMutation(async () => {
        const { createTransfer } = await api.createTransfer(token!, [packageId], 'AUTO')
        await api.acceptTransfer(token!, createTransfer.id)
      })
      toast.success('Package claimed into your custody')
    },
    [token, runMutation],
  )

  const createPackage = useCallback(
    async (input: api.CreatePackageInput) => {
      return runMutation(async () => {
        const { createPackage } = await api.createPackage(token!, input)
        const packageId = createPackage.deliveryPackage.id
        const secureCode =
          createPackage.transfer?.ruleType === 'SECURE' && createPackage.transfer.transferCode
            ? createPackage.transfer.transferCode
            : null
        if (secureCode) saveSecureCode(createPackage.transfer!.id, secureCode)
        return {
          packageId,
          transferId: createPackage.transfer?.id ?? null,
          secureCode,
        }
      }).then((result) => {
        toast.success('Package created')
        return result
      })
    },
    [token, runMutation],
  )

  const assignDriver = useCallback(
    async (packageId: string, driverId: string) => {
      await runMutation(() => api.assignDriver(token!, packageId, driverId))
      toast.success('Driver assigned')
    },
    [token, runMutation],
  )

  const advanceStatus = useCallback(
    async (packageId: string, status: PackageStatus, opts?: { notes?: string }) => {
      await runMutation(() => api.updatePackageStatus(token!, packageId, status, opts?.notes))
    },
    [token, runMutation],
  )

  const initiateDelivery = useCallback(
    async (packageId: string) => {
      const result = await runMutation(() => api.initiateDelivery(token!, packageId))
      const code = result.initiateDelivery.deliveryCode
      saveCode(packageId, code)
      return code
    },
    [token, runMutation],
  )

  const confirmDelivery = useCallback(
    (packageId: string, deliveryCode: string) =>
      runMutation(() => api.confirmDelivery(token!, packageId, deliveryCode)).then(() => {
        toast.success('Delivery confirmed')
      }),
    [token, runMutation],
  )

  const regenerateDeliveryCode = useCallback(
    async (packageId: string) => {
      const result = await runMutation(() => api.regenerateDeliveryCode(token!, packageId))
      const code = result.regenerateDeliveryCode.deliveryCode
      saveCode(packageId, code)
      return code
    },
    [token, runMutation],
  )

  const createTransferForPackages = useCallback(
    async (packageIds: string[], ruleType: TransferRuleType) => {
      const result = await runMutation(() => api.createTransfer(token!, packageIds, ruleType))
      return result.createTransfer
    },
    [token, runMutation],
  )

  const cancelTransfer = useCallback(
    (transferId: string) =>
      runMutation(() => api.cancelTransfer(token!, transferId)).then(() => {
        toast.success('Transfer cancelled')
      }),
    [token, runMutation],
  )

  const confirmTransfer = useCallback(
    (transferId: string) =>
      runMutation(() => api.confirmTransfer(token!, transferId)).then(() => {
        toast.success('Transfer confirmed — packages accepted')
      }),
    [token, runMutation],
  )

  const rejectTransfer = useCallback(
    (transferId: string) =>
      runMutation(() => api.rejectTransfer(token!, transferId)).then(() => {
        toast.success('Transfer request rejected')
      }),
    [token, runMutation],
  )

  const regenerateTransferCode = useCallback(
    async (transferId: string) => {
      const result = await runMutation(() => api.regenerateTransferCode(token!, transferId))
      const code = result.regenerateTransferCode.transferCode
      if (code) saveSecureCode(transferId, code)
      return code ?? ''
    },
    [token, runMutation],
  )

  const markRead = useCallback(
    async (viewerId: string) => {
      await runMutation(() => api.markNoticeRead(token!, viewerId))
      patch((prev) => ({
        notices: prev.notices.map((n) =>
          n.viewer.id === viewerId ? { ...n, viewer: { ...n.viewer, readAt: new Date().toISOString() } } : n,
        ),
        unread: Math.max(0, prev.unread - 1),
      }))
    },
    [token, runMutation, patch],
  )

  const markAllRead = useCallback(async () => {
    const unread = state.notices.filter((n) => !n.viewer.readAt)
    if (unread.length === 0) return
    await runMutation(async () => {
      for (const notice of unread) {
        await api.markNoticeRead(token!, notice.viewer.id)
      }
    })
    patch((prev) => ({
      notices: prev.notices.map((n) => (n.viewer.readAt ? n : { ...n, viewer: { ...n.viewer, readAt: new Date().toISOString() } })),
      unread: 0,
    }))
  }, [token, runMutation, patch, state.notices])

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      ...state,
      refresh,
      acceptTransfer,
      claimPackage,
      createPackage,
      assignDriver,
      advanceStatus,
      initiateDelivery,
      confirmDelivery,
      regenerateDeliveryCode,
      createTransferForPackages,
      cancelTransfer,
      confirmTransfer,
      rejectTransfer,
      regenerateTransferCode,
      markRead,
      markAllRead,
      saveCode,
      getCode,
      saveSecureCode,
      getSecureCode,
    }),
    [
      state, refresh, acceptTransfer, claimPackage, createPackage, assignDriver, advanceStatus,
      initiateDelivery, confirmDelivery, regenerateDeliveryCode, createTransferForPackages,
      cancelTransfer, confirmTransfer, rejectTransfer, regenerateTransferCode, markRead, markAllRead,
      saveCode, getCode, saveSecureCode, getSecureCode,
    ],
  )

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used inside <WorkspaceProvider>')
  return ctx
}
