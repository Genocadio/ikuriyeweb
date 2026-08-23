// Notices come from Supabase Realtime — NOT from the CavGo backend.
//
// The backend writes a `notice_viewers` row for every recipient whenever a
// notice is published (package status changes, transfer events, delivery codes).
// Workers subscribe directly to their own `notice_viewers` rows here, so the
// notice feed + unread badge update instantly without any backend polling.
//
// Supabase prerequisites (dashboard setup, documented in WORKER_FRONTEND.md):
//   1. The `notice_viewers` table must be added to the `supabase_realtime` publication.
//   2. RLS must allow the authenticated user to SELECT their own rows
//      (`user_id = auth.uid()`).
//   3. `ALTER TABLE notice_viewers REPLICA IDENTITY FULL;` for DELETE events (optional).

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL: string = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '') || ''
const SUPABASE_ANON_KEY: string = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export interface NoticeChange {
  eventType: 'INSERT' | 'UPDATE'
  viewerId: string
  noticeId: string
}

export interface SubscribeNoticesOptions {
  token: string // Supabase access token — the backend JWTs are the same tokens
  userId: string
  onInsert: (change: NoticeChange) => void
  onUpdate: (change: NoticeChange) => void
  /** Reports channel health so the caller can fall back when realtime is unavailable. */
  onStatus?: (live: boolean, error?: string) => void
}

/**
 * Subscribes the authenticated worker to their own `notice_viewers` rows.
 * INSERT → a new notice was delivered. UPDATE → read state changed elsewhere.
 *
 * The JWT is applied via `realtime.setAuth()` and awaited BEFORE subscribing so
 * RLS-authenticated realtime works on the first connection. Channel health is
 * reported through `onStatus` — callers should fall back to periodic syncing
 * while `live` is false.
 *
 * Returns an unsubscribe function. No-op when Supabase env vars are missing.
 */
export function subscribeNotices(opts: SubscribeNoticesOptions): () => void {
  if (typeof window === 'undefined' || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    opts.onStatus?.(false, 'Supabase is not configured on this frontend')
    return () => {}
  }

  let supabase: ReturnType<typeof createClient>
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    })
  } catch {
    opts.onStatus?.(false, 'Failed to create Supabase client')
    return () => {}
  }

  const cancelled = { value: false }

  const readRow = (eventType: 'INSERT' | 'UPDATE', row: Record<string, unknown>): NoticeChange | null => {
    const viewerId = row.id
    const noticeId = row.notice_id
    if (typeof viewerId !== 'string' || typeof noticeId !== 'string') return null
    return { eventType, viewerId, noticeId }
  }

  const channel = supabase
    .channel('cavgo-notice-viewers')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notice_viewers', filter: `user_id=eq.${opts.userId}` },
      (payload) => {
        const change = readRow('INSERT', (payload.new ?? {}) as Record<string, unknown>)
        if (change) opts.onInsert(change)
      },
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'notice_viewers', filter: `user_id=eq.${opts.userId}` },
      (payload) => {
        const change = readRow('UPDATE', (payload.new ?? {}) as Record<string, unknown>)
        if (change) opts.onUpdate(change)
      },
    )

  // Apply the worker's JWT first, then open the subscription — avoids the race
  // where the socket connects with the anon key and RLS rejects the channel.
  void supabase.realtime
    .setAuth(opts.token)
    .then(() => {
      if (cancelled.value) return
      channel.subscribe((status, err) => {
        if (cancelled.value) return
        if (status === 'SUBSCRIBED') {
          opts.onStatus?.(true)
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          const message = err instanceof Error ? err.message : status
          console.warn('[realtime] notice channel status:', status, message)
          opts.onStatus?.(false, message)
        }
      })
    })
    .catch((error) => {
      console.warn('[realtime] failed to authenticate notice subscription:', error)
      opts.onStatus?.(false, error instanceof Error ? error.message : 'authentication failed')
    })

  return () => {
    cancelled.value = true
    void supabase.removeChannel(channel)
  }
}
