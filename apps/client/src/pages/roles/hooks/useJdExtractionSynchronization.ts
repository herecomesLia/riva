import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useRef, useState } from "react"

import type { JdState, RolesData } from "@/models/target-role-workflow"
import { getJdExtractionState, toJdState } from "@/services/roles"

export const ROLES_QUERY_KEY = ["roles"] as const
export const JD_EXTRACTION_POLL_INTERVAL_MS = 1000

type PollingController = {
  roleId: string
  timer: ReturnType<typeof setTimeout> | null
}

export function useJdExtractionSynchronization(data: RolesData | undefined) {
  const queryClient = useQueryClient()
  const [synchronizationErrorRoleIds, setSynchronizationErrorRoleIds] = useState<string[]>([])
  const mountedRef = useRef(true)
  const controllersRef = useRef(new Map<string, PollingController>())
  const failedRoleIdsRef = useRef(new Set<string>())
  const pausedRoleIdsRef = useRef(new Set<string>())

  const getExtractingRole = useCallback(
    (roleId: string) => {
      const current = queryClient.getQueryData<RolesData>(ROLES_QUERY_KEY)
      const role = current?.roles.find((item) => item.id === roleId)
      return role?.jdState.status === "extracting" ? role : null
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

  const updateJdState = useCallback(
    (jdState: JdState, controller: PollingController) => {
      const roleId = controller.roleId
      queryClient.setQueryData<RolesData>(ROLES_QUERY_KEY, (current) => {
        if (!current || !mountedRef.current || controllersRef.current.get(roleId) !== controller) {
          return current
        }
        const currentRole = current.roles.find((item) => item.id === roleId)
        if (currentRole?.jdState.status !== "extracting") return current
        return {
          ...current,
          roles: current.roles.map((item) => (item.id === roleId ? { ...item, jdState } : item)),
        }
      })
    },
    [queryClient],
  )

  const pollRef = useRef<(controller: PollingController) => Promise<void>>(async () => {})
  const poll = useCallback(
    async (controller: PollingController) => {
      const role = getExtractingRole(controller.roleId)
      if (
        !mountedRef.current ||
        controllersRef.current.get(controller.roleId) !== controller ||
        !role
      ) {
        stop(controller)
        return
      }

      let nextState: JdState
      try {
        const state = await getJdExtractionState(role.id)
        if (!mountedRef.current || controllersRef.current.get(role.id) !== controller) return
        if (state.status === "idle") {
          await queryClient.invalidateQueries(
            { queryKey: ROLES_QUERY_KEY },
            { throwOnError: true, cancelRefetch: false },
          )
          const currentRole = getExtractingRole(role.id)
          if (!currentRole) {
            clearSynchronizationError(role.id)
            stop(controller)
            return
          }
          nextState = currentRole.jdState
        } else {
          nextState = toJdState(state, role.jd)
        }
      } catch {
        if (
          mountedRef.current &&
          controllersRef.current.get(controller.roleId) === controller &&
          getExtractingRole(controller.roleId)
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
        !getExtractingRole(controller.roleId)
      ) {
        stop(controller)
        return
      }

      updateJdState(nextState, controller)
      clearSynchronizationError(controller.roleId)
      if (nextState.status !== "extracting") {
        stop(controller)
        return
      }
      controller.timer = setTimeout(
        () => void pollRef.current(controller),
        JD_EXTRACTION_POLL_INTERVAL_MS,
      )
    },
    [clearSynchronizationError, getExtractingRole, updateJdState, queryClient, stop],
  )
  pollRef.current = poll

  const start = useCallback((roleId: string) => {
    if (
      !mountedRef.current ||
      failedRoleIdsRef.current.has(roleId) ||
      pausedRoleIdsRef.current.has(roleId)
    )
      return
    if (controllersRef.current.has(roleId)) return
    const controller: PollingController = { roleId, timer: null }
    controllersRef.current.set(roleId, controller)
    void pollRef.current(controller)
  }, [])

  const restartSynchronization = useCallback(
    (roleId: string) => {
      pausedRoleIdsRef.current.delete(roleId)
      clearSynchronizationError(roleId)
      if (!getExtractingRole(roleId)) return false
      start(roleId)
      return true
    },
    [clearSynchronizationError, getExtractingRole, start],
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
      const role = data.roles.find((item) => item.id === controller.roleId)
      if (role?.jdState.status !== "extracting") stop(controller)
    }
    for (const role of data.roles) {
      if (role.jdState.status === "extracting") start(role.id)
    }
  }, [data, start, stop])

  return {
    clearSynchronizationError,
    pauseSynchronization,
    restartSynchronization,
    synchronizationErrorRoleIds,
  }
}
