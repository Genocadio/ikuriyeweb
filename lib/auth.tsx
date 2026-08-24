'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { isAuthError, setAuthErrorHandler, type AuthRefreshOutcome } from './client'
import { fetchProfile, syncCurrentUser } from './api'
import type { Role, User } from './types'

const SESSION_KEY = 'cavgo.session'

export const ALLOWED_PORTAL_ROLES: Role[] = ['WORKER', 'DRIVER']

const NEXXAUTH_BASE_URL: string = process.env.NEXT_PUBLIC_NEXXAUTH_BASE_URL?.replace(/\/+$/, '') || ''
const NEXXAUTH_CLIENT_ID: string = process.env.NEXT_PUBLIC_NEXXAUTH_CLIENT_ID || ''

// Refresh when fewer than 5 minutes remain before the JWT expires — matches the
// Android app's PROACTIVE_REFRESH_THRESHOLD_SECONDS in NexxAuth.observeSession.
const REFRESH_THRESHOLD_SECONDS = 5 * 60
// Safety-net re-check interval when the token expiry can't be determined.
const REFRESH_CHECK_INTERVAL_MS = 5 * 60 * 1000  /** Persisted session. */
interface PersistedSession {
  access: string
  refresh: string | null
  /** Unix seconds when the access token expires. */
  exp: number | null
}

interface NexxAuthOrgUser {
  id: number
  firstName: string
  lastName?: string
  username?: string
  email?: string
  phone?: string
  enabled: boolean
  roles: string[]
  authTypes: string[]
}

interface NexxAuthResponse {
  accessToken: string
  refreshToken: string | null
  tokenType: string
  expiresInSeconds: number
  user: NexxAuthOrgUser
  actions: string[]
}

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn' | 'denied'

export interface AuthState {
  status: AuthStatus
  token: string | null
  user: User | null
  error: string | null
  nexxauthConfigured: boolean
  /** True when a refresh token is persisted (password login) — auto-refresh is possible. */
  canRefresh: boolean
}

export interface AuthActions {
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  handleSessionExpired: () => void
  /** Refresh the access token via Nexxauth. `{ token }` on success,
   *  `{ token: null, retriable: true }` on transient network failure (session
   *  kept), `{ token: null, retriable: false }` when the refresh token was
   *  rejected/revoked (session cleared, user signed out). */
  refreshSession: () => Promise<AuthRefreshOutcome>
}

interface AuthContextValue extends AuthState, AuthActions {}

const AuthContext = createContext<AuthContextValue | null>(null)

// ── Session persistence ──────────────────────────────────────────────────────

function readStored(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(SESSION_KEY)
  } catch {
    return null
  }
}

function writeStored(value: string) {
  try {
    localStorage.setItem(SESSION_KEY, value)
  } catch {
    /* storage unavailable */
  }
}

function clearStored() {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    /* ignore */
  }
}

/** Parse the persisted session. Legacy bare-JWT values (no refresh token) are
 *  still understood so existing sessions keep working after this upgrade. */
function parseSession(): PersistedSession | null {
  const raw = readStored()
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as PersistedSession
    if (parsed && typeof parsed.access === 'string' && parsed.access) {
      return {
        access: parsed.access,
        refresh: typeof parsed.refresh === 'string' ? parsed.refresh : null,
        exp: typeof parsed.exp === 'number' ? parsed.exp : null,
      }
    }
  } catch {
    /* not JSON — legacy storage */
  }
  return { access: raw, refresh: null, exp: null }
}

function persistSession(session: PersistedSession) {
  writeStored(JSON.stringify(session))
}

/** Decode the JWT payload to read the `exp` claim (Unix seconds). */
function decodeJwtExp(token: string): number | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as { exp?: unknown }
    return typeof payload.exp === 'number' ? payload.exp : null
  } catch {
    return null
  }
}

// ── Nexxauth HTTP helpers ────────────────────────────────────────────────────

function nexxauthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (NEXXAUTH_CLIENT_ID) headers['X-Client-Id'] = NEXXAUTH_CLIENT_ID
  if (typeof window !== 'undefined' && window.location?.origin) {
    headers['Origin'] = window.location.origin
  }
  return headers
}

async function nexxauthPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${NEXXAUTH_BASE_URL}${path}`, {
    method: 'POST',
    headers: nexxauthHeaders(),
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
    message?: string
    error?: string
  }
  if (!res.ok) {
    throw new Error(json.message || json.error || `Nexxauth request failed (HTTP ${res.status})`)
  }
  return json as T
}

// ── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: 'loading',
    token: null,
    user: null,
    error: null,
    nexxauthConfigured: Boolean(NEXXAUTH_BASE_URL && NEXXAUTH_CLIENT_ID),
    canRefresh: false,
  })
  const bootstrapping = useRef(false)
  const refreshInFlight = useRef<Promise<AuthRefreshOutcome> | null>(null)

  const bootstrap = useCallback(async (token: string) => {
    if (bootstrapping.current) return
    bootstrapping.current = true
    try {
      // Ensure the local user row exists (first login) and fetch the profile.
      await syncCurrentUser(token)
      const { myProfile } = await fetchProfile(token)
      setState((prev) => ({
        ...prev,
        status: 'signedIn',
        token,
        user: myProfile,
        error: null,
      }))
    } catch (error) {
      if (isAuthError(error)) {
        clearStored()
        setState((prev) => ({ ...prev, status: 'signedOut', token: null, user: null, error: null, canRefresh: false }))
      } else {
        setState((prev) => ({
          ...prev,
          status: 'signedIn',
          token,
          error: error instanceof Error ? error.message : 'Failed to load your profile',
        }))
      }
    } finally {
      bootstrapping.current = false
    }
  }, [])

  const login = useCallback(
    async (email: string, password: string) => {
      setState((prev) => ({ ...prev, error: null }))
      if (!NEXXAUTH_BASE_URL || !NEXXAUTH_CLIENT_ID) {
        const message =
          'Nexxauth is not configured on this frontend. Add NEXT_PUBLIC_NEXXAUTH_BASE_URL and NEXT_PUBLIC_NEXXAUTH_CLIENT_ID.'
        setState((prev) => ({ ...prev, error: message }))
        throw new Error(message)
      }
      let session: { access: string; refresh: string | null; exp: number | null }
      try {
        const data = await nexxauthPost<NexxAuthResponse>('/auth/login', {
          identifier: email.trim(),
          identifierType: 'EMAIL',
          authType: 'PASSWORD',
          password,
        })
        session = {
          access: data.accessToken,
          refresh: data.refreshToken,
          exp:
            typeof data.expiresInSeconds === 'number'
              ? Math.floor(Date.now() / 1000 + data.expiresInSeconds)
              : null,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Sign-in failed'
        setState((prev) => ({ ...prev, error: message }))
        throw error
      }
      persistSession(session)
      setState((prev) => ({ ...prev, canRefresh: Boolean(session.refresh) }))
      await bootstrap(session.access)
    },
    [bootstrap],
  )

  const logout = useCallback(async () => {
    const session = parseSession()
    if (session?.refresh && NEXXAUTH_BASE_URL) {
      try {
        await fetch(`${NEXXAUTH_BASE_URL}/auth/logout`, {
          method: 'POST',
          headers: nexxauthHeaders(),
          body: JSON.stringify({ refreshToken: session.refresh }),
        })
      } catch {
        /* best-effort — still clear locally */
      }
    }
    clearStored()
    setState((prev) => ({ ...prev, status: 'signedOut', token: null, user: null, error: null, canRefresh: false }))
  }, [])

  const handleSessionExpired = useCallback(() => {
    if (state.status !== 'signedIn') return
    clearStored()
    setState((prev) => ({
      ...prev,
      status: 'signedOut',
      token: null,
      user: null,
      canRefresh: false,
      error: 'Your session expired. Please sign in again.',
    }))
  }, [state.status])

  // Single-flight refresh. On success the new access token (and any rotated
  // refresh token) is persisted and exposed; the caller gets the fresh token.
  const refreshSession = useCallback(async (): Promise<AuthRefreshOutcome> => {
    if (refreshInFlight.current) return refreshInFlight.current
    const run = async (): Promise<AuthRefreshOutcome> => {
      const session = parseSession()
      if (!session?.refresh || !NEXXAUTH_BASE_URL) {
        return { token: null, retriable: false }
      }
      let response: Response
      try {
        response = await fetch(`${NEXXAUTH_BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: nexxauthHeaders(),
          body: JSON.stringify({ refreshToken: session.refresh }),
        })
      } catch {
        // Transient network failure — keep the session, retry later.
        return { token: null, retriable: true }
      }
      let json: NexxAuthResponse & { message?: string; error?: string }
      try {
        json = (await response.json()) as NexxAuthResponse & { message?: string; error?: string }
      } catch {
        return { token: null, retriable: true }
      }
      if (!response.ok || !json.accessToken) {
        // The refresh token was rejected or revoked — the session is dead.
        clearStored()
        setState((prev) => ({
          ...prev,
          status: 'signedOut',
          token: null,
          user: null,
          canRefresh: false,
          error: 'Your session expired. Please sign in again.',
        }))
        return { token: null, retriable: false }
      }
      const next: PersistedSession = {
        access: json.accessToken,
        // Nexxauth rotates refresh tokens — use the new one if provided, otherwise
        // keep the current one (null means a gating action is pending).
        refresh: json.refreshToken ?? session.refresh,
        exp:
          typeof json.expiresInSeconds === 'number'
            ? Math.floor(Date.now() / 1000 + json.expiresInSeconds)
            : null,
      }
      persistSession(next)
      setState((prev) => ({ ...prev, token: next.access, canRefresh: Boolean(next.refresh) }))
      return { token: next.access, retriable: false }
    }
    const promise = run()
    refreshInFlight.current = promise
    try {
      return await promise
    } finally {
      refreshInFlight.current = null
    }
  }, [])

  // Restore session on mount (access token + optional refresh token). If the
  // access token expired while the tab was closed, refresh it first so a
  // returning worker is not bounced to the login screen.
  useEffect(() => {
    const stored = parseSession()
    if (!stored) {
      setState((prev) => ({ ...prev, status: 'signedOut' }))
      return
    }
    setState((prev) => ({ ...prev, token: stored.access, canRefresh: Boolean(stored.refresh) }))
    const exp = stored.exp ?? decodeJwtExp(stored.access)
    if (stored.refresh && (exp == null || exp <= Date.now() / 1000)) {
      void refreshSession().then((outcome) => {
        if (outcome.token) {
          void bootstrap(outcome.token)
        } else if (outcome.retriable) {
          // Network blip — fall back to the stored token; gql() will refresh
          // on the first 401 (the handler is registered while a token is set).
          void bootstrap(stored.access)
        }
        // revoked → refreshSession already cleared the session and signed out
      })
      return
    }
    void bootstrap(stored.access)
  }, [bootstrap, refreshSession])

  // Let the GraphQL client refresh transparently when a request 401s.
  // Registered whenever a token is present (including during restore/bootstrap)
  // so even the very first syncUser/myProfile calls can refresh an expired
  // token instead of bouncing the worker to the login screen.
  useEffect(() => {
    if (state.token) {
      setAuthErrorHandler(refreshSession)
    } else {
      setAuthErrorHandler(null)
    }
    return () => setAuthErrorHandler(null)
  }, [state.token, refreshSession])

  // Proactive refresh — mirrors Android NexxAuth.observeSession: refresh about
  // 5 minutes before the JWT expires, with a 5-minute safety-net interval when
  // the expiry can't be read. Only runs when a refresh token is available.
  useEffect(() => {
    if (state.status !== 'signedIn' || !state.token || !state.canRefresh) return
    const token = state.token
    let cancelled = false
    let timer: number | undefined

    const tick = async () => {
      if (cancelled) return
      const session = parseSession()
      const exp = session?.exp ?? decodeJwtExp(token)
      const now = Date.now() / 1000
      let delayMs: number
      if (exp != null) {
        const remaining = exp - now
        if (remaining < REFRESH_THRESHOLD_SECONDS) {
          const outcome = await refreshSession()
          if (cancelled) return
          // Always reschedule — success re-checks against the new token (the
          // effect also re-runs on token change), retriable retries later, and
          // a revoked refresh signs the user out (the effect cleans up).
          timer = window.setTimeout(() => void tick(), REFRESH_CHECK_INTERVAL_MS)
          return
        }
        delayMs = Math.min(
          Math.max((remaining - REFRESH_THRESHOLD_SECONDS) * 1000, 15_000),
          REFRESH_CHECK_INTERVAL_MS,
        )
      } else {
        delayMs = REFRESH_CHECK_INTERVAL_MS
      }
      timer = window.setTimeout(() => void tick(), delayMs)
    }

    void tick()
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [state.status, state.token, state.canRefresh, refreshSession])

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, logout, handleSessionExpired, refreshSession }),
    [state, login, logout, handleSessionExpired, refreshSession],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
