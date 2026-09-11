import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useRef, useState } from "react"

import type { RolesData } from "@/models/target-role-workflow"
import { pollMatch } from "@/services/roles"

import { ROLES_QUERY_KEY } from "./useJdExtractionSynchronization"

export const MATCHING_ANALYSIS_POLL_INTERVAL_MS = 1000

type PollingController = {
  roleId: string
  timer: ReturnType<typeof setTimeout> | null
}

export function useMatchingAnalysisSynchronization(data: RolesData | undefined) {
  const queryClient = useQueryClient()
  const [synchronizationErrorRoleIds, setSynchronizationErrorRoleIds] = useState<string[]>([])
  const mountedRef = useRef(true)
  const controllersRef = useRef(new Map<string, PollingController>())
  const failedRoleIdsRef = useRef(new Set<string>())

  const isGenerating = useCallback(
    (roleId: string) => {
      const current = queryClient.getQueryData<RolesData>(ROLES_QUERY_KEY)
      return current?.roles.find((item) => item.id === roleId)?.matchState.status === "generating"
    },
    [queryClient],
  )

  const clearSynchronizationError = useCallback((roleId: string) => {
    failedRoleIdsRef.current.delete(roleId)
    if (!mountedRef.current) return
    setSynchronizationErrorRoleIds((current) =>
      current.includes(roleId) ? current.filter((item) => item !== roleId) : current,
    )
  }, [])

  const stop = useCallback((controller: PollingController) => {
    if (controller.timer !== null) clearTimeout(controller.timer)
    if (controllersRef.current.get(controller.roleId) === controller) {
      controllersRef.current.delete(controller.roleId)
    }
  }, [])

  const pollRef = useRef<(controller: PollingController) => Promise<void>>(async () => {})
  const poll = useCallback(
    async (controller: PollingController) => {
      if (
        !mountedRef.current ||
        controllersRef.current.get(controller.roleId) !== controller ||
        !isGenerating(controller.roleId)
      ) {
        stop(controller)
        return
      }

      let matchState
      try {
        matchState = await pollMatch(controller.roleId)
      } catch {
        if (
          mountedRef.current &&
          controllersRef.current.get(controller.roleId) === controller &&
          isGenerating(controller.roleId)
        ) {
          failedRoleIdsRef.current.add(controller.roleId)
          stop(controller)
          setSynchronizationErrorRoleIds((current) =>
            current.includes(controller.roleId) ? current : [...current, controller.roleId],
          )
        }
        return
      }

      if (
        !mountedRef.current ||
        controllersRef.current.get(controller.roleId) !== controller ||
        !isGenerating(controller.roleId)
      ) {
        stop(controller)
        return
      }

      queryClient.setQueryData<RolesData>(ROLES_QUERY_KEY, (current) =>
        current
          ? {
              ...current,
              roles: current.roles.map((role) =>
                role.id === controller.roleId ? { ...role, matchState } : role,
              ),
            }
          : current,
      )
      clearSynchronizationError(controller.roleId)
      if (matchState.status !== "generating") {
        stop(controller)
        return
      }
      controller.timer = setTimeout(
        () => void pollRef.current(controller),
        MATCHING_ANALYSIS_POLL_INTERVAL_MS,
      )
    },
    [clearSynchronizationError, isGenerating, queryClient, stop],
  )
  pollRef.current = poll

  const start = useCallback((roleId: string) => {
    if (!mountedRef.current || failedRoleIdsRef.current.has(roleId)) return
    if (controllersRef.current.has(roleId)) return
    const controller: PollingController = { roleId, timer: null }
    controllersRef.current.set(roleId, controller)
    void pollRef.current(controller)
  }, [])

  const restartSynchronization = useCallback(
    (roleId: string) => {
      if (!isGenerating(roleId)) return false
      clearSynchronizationError(roleId)
      start(roleId)
      return true
    },
    [clearSynchronizationError, isGenerating, start],
  )

  useEffect(() => {
    const controllers = controllersRef.current
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      for (const controller of controllers.values()) stop(controller)
    }
  }, [stop])

  useEffect(() => {
    if (!data) return
    for (const controller of controllersRef.current.values()) {
      const role = data.roles.find((item) => item.id === controller.roleId)
      if (role?.matchState.status !== "generating") stop(controller)
    }
    for (const role of data.roles) {
      if (role.matchState.status === "generating") start(role.id)
    }
  }, [data, start, stop])

  return { clearSynchronizationError, restartSynchronization, synchronizationErrorRoleIds }
}
