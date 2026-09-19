'use client'

import { useCallback, useEffect, useState } from 'react'
import { isAuthError } from './client'
import * as api from './api'
import type { CompanyAccessRequestStatus, CompanyOffice, MyCompany } from './types'

export type OnboardingPhase = 'checking' | 'join' | 'waiting' | 'office' | 'member'

export interface OnboardingState {
  /** 'member' → the worker is attached to a company and can open the workspace. */
  phase: OnboardingPhase
  company: MyCompany | null
  pendingAccess: CompanyAccessRequestStatus | null
  offices: CompanyOffice[]
  officesLoading: boolean
  busy: boolean
  error: string | null
}

export interface OnboardingActions {
  requestAccess: (code: string) => Promise<boolean>
  pickOffice: (officeId: string) => Promise<boolean>
  /** Re-run the membership check (used by the waiting poll and manual retries). */
  refresh: () => Promise<void>
}

/** Seconds between polls while a company access request is pending approval. */
export const WAITING_POLL_INTERVAL_MS = 20_000

/**
 * Worker onboarding state machine for the web portal:
 *
 *  checking → join (no company, no pending request)
 *           → waiting (request pending approval — polls every 20s)
 *           → office  (approved but no office chosen yet → office picker)
 *           → member  (company + office set → render the workspace)
 *
 * Company data is read from cavgomain via the gateway's /main namespace.
 */
export function useOnboarding(token: string | null, onAuthError: () => void): OnboardingState & OnboardingActions {
  const [state, setState] = useState<OnboardingState>({
    phase: 'checking',
    company: null,
    pendingAccess: null,
    offices: [],
    officesLoading: false,
    busy: false,
    error: null,
  })

  const checkMembership = useCallback(async (): Promise<void> => {
    if (!token) return
    try {
      const me = await api.fetchMyCompany(token)
      if (me) {
        const needsOffice =
          me.role !== 'DRIVER' && me.companyId != null && me.office == null
        setState((prev) => ({
          ...prev,
          phase: needsOffice ? 'office' : 'member',
          company: me,
          pendingAccess: null,
          error: null,
        }))
        return
      }
      // Not a company member yet — what's the status of any access request?
      const req = await api.fetchMyCompanyAccessStatus(token)
      setState((prev) => ({
        ...prev,
        pendingAccess: req,
        company: null,
        phase: req == null || req.status === 'REJECTED' ? 'join' : 'waiting',
        error: null,
      }))
    } catch (error) {
      if (isAuthError(error)) {
        onAuthError()
        return
      }
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Could not check your company status.',
      }))
    }
  }, [token, onAuthError])

  // Run the membership check on mount / when a token becomes available.
  useEffect(() => {
    if (!token) return
    void checkMembership()
  }, [token, checkMembership])

  // Poll the access request status while it is pending — on approval the
  // membership re-check flips the phase to 'office'/'member' automatically.
  useEffect(() => {
    if (state.phase !== 'waiting' || !token) return
    const id = window.setInterval(() => {
      void checkMembership()
    }, WAITING_POLL_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [state.phase, token, checkMembership])

  // Load the office list once when the office picker phase is reached.
  const companyId = state.company?.companyId
  useEffect(() => {
    if (state.phase !== 'office' || !token || !companyId || state.offices.length > 0) return
    setState((prev) => ({ ...prev, officesLoading: true, error: null }))
    api
      .fetchOffices(token, companyId)
      .then((offices) => setState((prev) => ({ ...prev, offices })))
      .catch((error) => {
        if (!isAuthError(error)) {
          setState((prev) => ({
            ...prev,
            error: error instanceof Error ? error.message : 'Could not load the company offices.',
          }))
        }
      })
      .finally(() => setState((prev) => ({ ...prev, officesLoading: false })))
  }, [state.phase, token, companyId, state.offices.length, onAuthError])

  const requestAccess = useCallback(
    async (code: string): Promise<boolean> => {
      if (!token) return false
      setState((prev) => ({ ...prev, busy: true, error: null }))
      try {
        await api.requestCompanyAccess(token, code.trim())
        await checkMembership()
        return true
      } catch (error) {
        if (isAuthError(error)) {
          onAuthError()
          return false
        }
        setState((prev) => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Your request could not be submitted.',
        }))
        return false
      } finally {
        setState((prev) => (prev.busy ? { ...prev, busy: false } : prev))
      }
    },
    [token, checkMembership, onAuthError],
  )

  const pickOffice = useCallback(
    async (officeId: string): Promise<boolean> => {
      const userId = state.company?.id
      if (!token || !userId) return false
      setState((prev) => ({ ...prev, busy: true, error: null }))
      try {
        const updated = await api.assignMyOffice(token, userId, officeId)
        if (updated) {
          setState((prev) => ({
            ...prev,
            phase: 'member',
            company: updated,
            busy: false,
          }))
          return true
        }
        await checkMembership()
        setState((prev) => (prev.busy ? { ...prev, busy: false } : prev))
        return Boolean(state.company?.office)
      } catch (error) {
        if (isAuthError(error)) {
          onAuthError()
          return false
        }
        setState((prev) => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Could not assign the office.',
        }))
        return false
      } finally {
        setState((prev) => (prev.busy ? { ...prev, busy: false } : prev))
      }
    },
    [token, state.company, checkMembership, onAuthError],
  )

  return { ...state, requestAccess, pickOffice, refresh: checkMembership }
}