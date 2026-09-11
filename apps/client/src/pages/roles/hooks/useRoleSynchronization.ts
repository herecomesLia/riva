import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useRef, useState } from "react"

import type { RoleView, RolesData } from "@/models/target-role-workflow"
import { getJdExtractionState, pollMatch, toJdState } from "@/services/roles"

export const ROLES_QUERY_KEY = ["roles"] as const
const POLL_INTERVAL_MS = 1000

type PollingController = {
  roleId: string
  timer: ReturnType<typeof setTimeout> | null
}

type Synchronization = {
  isActive: (role: RoleView) => boolean
  poll: (
    role: RoleView,
    isCurrent: () => boolean,
  ) => Promise<Partial<Pick<RoleView, "jdState" | "matchState">> | null>
}

function useRoleSynchronization(data: RolesData | undefined, synchronization: Synchronization) {
  const queryClient = useQueryClient()
  const [synchronizationErrorRoleIds, setSynchronizationErrorRoleIds] = useState<string[]>([])
  const mountedRef = useRef(true)
  const controllersRef = useRef(new Map<string, PollingController>())
  const failedRoleIdsRef = useRef(new Set<string>())
  const pausedRoleIdsRef = useRef(new Set<string>())
  const synchronizationRef = useRef(synchronization)
  synchronizationRef.current = synchronization

  const getActiveRole = useCallback(
    (roleId: string) => {
      const role = queryClient
        .getQueryData<RolesData>(ROLES_QUERY_KEY)
        ?.roles.find((item) => item.id === roleId)
      return role && synchronizationRef.current.isActive(role) ? role : null
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

  const poll = useCallback(
    async function poll(controller: PollingController) {
      const isCurrent = () =>
        mountedRef.current && controllersRef.current.get(controller.roleId) === controller
      const role = getActiveRole(controller.roleId)
      if (!isCurrent() || !role) {
        stop(controller)
        return
      }

      try {
        const update = await synchronizationRef.current.poll(role, isCurrent)
        if (!isCurrent()) return
        if (update && getActiveRole(role.id)) {
          queryClient.setQueryData<RolesData>(ROLES_QUERY_KEY, (current) =>
            current
              ? {
                  ...current,
                  roles: current.roles.map((item) =>
                    item.id === role.id ? { ...item, ...update } : item,
                  ),
                }
              : current,
          )
        }
        clearSynchronizationError(role.id)
        if (!getActiveRole(role.id)) {
          stop(controller)
          return
        }
        controller.timer = setTimeout(() => void poll(controller), POLL_INTERVAL_MS)
      } catch {
        if (isCurrent()) {
          stop(controller)
          if (getActiveRole(role.id)) {
            failedRoleIdsRef.current.add(role.id)
            setSynchronizationErrorRoleIds((current) =>
              current.includes(role.id) ? current : [...current, role.id],
            )
          }
        }
      }
    },
    [clearSynchronizationError, getActiveRole, queryClient, stop],
  )

  const start = useCallback(
    (roleId: string) => {
      if (
        !mountedRef.current ||
        failedRoleIdsRef.current.has(roleId) ||
        pausedRoleIdsRef.current.has(roleId) ||
        controllersRef.current.has(roleId)
      )
        return
      const controller: PollingController = { roleId, timer: null }
      controllersRef.current.set(roleId, controller)
      void poll(controller)
    },
    [poll],
  )

  const restartSynchronization = useCallback(
    (roleId: string) => {
      pausedRoleIdsRef.current.delete(roleId)
      clearSynchronizationError(roleId)
      if (!getActiveRole(roleId)) return false
      start(roleId)
      return true
    },
    [clearSynchronizationError, getActiveRole, start],
  )

  const pauseSynchronization = useCallback(
    (roleId: string) => {
      pausedRoleIdsRef.current.add(roleId)
      const controller = controllersRef.current.get(roleId)
      if (controller) stop(controller)
    },
    [stop],
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
      if (!getActiveRole(controller.roleId)) stop(controller)
    }
    for (const role of data.roles) {
      if (synchronizationRef.current.isActive(role)) start(role.id)
    }
  }, [data, getActiveRole, start, stop])

  return {
    clearSynchronizationError,
    pauseSynchronization,
    restartSynchronization,
    synchronizationErrorRoleIds,
  }
}

export function useJdExtractionSynchronization(data: RolesData | undefined) {
  const queryClient = useQueryClient()
  return useRoleSynchronization(data, {
    isActive: (role) => role.jdState.status === "extracting",
    poll: async (role, isCurrent) => {
      const state = await getJdExtractionState(role.id)
      if (!isCurrent()) return null
      if (state.status === "idle") {
        await queryClient.invalidateQueries(
          { queryKey: ROLES_QUERY_KEY },
          { throwOnError: true, cancelRefetch: false },
        )
        return null
      }
      return { jdState: toJdState(state, role.jd) }
    },
  })
}

export function useMatchingAnalysisSynchronization(data: RolesData | undefined) {
  return useRoleSynchronization(data, {
    isActive: (role) => role.matchState.status === "generating",
    poll: async (role) => ({ matchState: await pollMatch(role.id) }),
  })
}
