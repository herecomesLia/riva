import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useRef, useState } from "react"

import type { RolesData, RoleView } from "@/models/target-role-workflow"
import { pollJd } from "@/services/roles"

export const ROLES_QUERY_KEY = ["roles"] as const
export const JOB_DESCRIPTION_POLL_INTERVAL_MS = 1000

type PollingController = {
  roleId: string
  timer: ReturnType<typeof setTimeout> | null
}

export function useJobDescriptionSynchronization(data: RolesData | undefined) {
  const queryClient = useQueryClient()
  const [synchronizationErrorRoleIds, setSynchronizationErrorRoleIds] = useState<string[]>([])
  const mountedRef = useRef(true)
  const controllersRef = useRef(new Map<string, PollingController>())
  const failedRoleIdsRef = useRef(new Set<string>())

  const getParsingRole = useCallback(
    (roleId: string) => {
      const current = queryClient.getQueryData<RolesData>(ROLES_QUERY_KEY)
      const role = current?.roles.find((item) => item.id === roleId)
      return role?.jdState.status === "parsing" ? role : null
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

  const mergeRole = useCallback(
    (role: RoleView, controller: PollingController) => {
      queryClient.setQueryData<RolesData>(ROLES_QUERY_KEY, (current) => {
        if (!current || !mountedRef.current || controllersRef.current.get(role.id) !== controller) {
          return current
        }
        const currentRole = current.roles.find((item) => item.id === role.id)
        if (currentRole?.jdState.status !== "parsing") return current
        return {
          ...current,
          roles: current.roles.map((item) => (item.id === role.id ? role : item)),
        }
      })
    },
    [queryClient],
  )

  const pollRef = useRef<(controller: PollingController) => Promise<void>>(async () => {})
  const poll = useCallback(
    async (controller: PollingController) => {
      const role = getParsingRole(controller.roleId)
      if (
        !mountedRef.current ||
        controllersRef.current.get(controller.roleId) !== controller ||
        !role
      ) {
        stop(controller)
        return
      }

      let nextRole: RoleView
      try {
        nextRole = await pollJd(role)
      } catch {
        if (
          mountedRef.current &&
          controllersRef.current.get(controller.roleId) === controller &&
          getParsingRole(controller.roleId)
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
        !getParsingRole(controller.roleId)
      ) {
        stop(controller)
        return
      }

      mergeRole(nextRole, controller)
      clearSynchronizationError(controller.roleId)
      if (nextRole.jdState.status !== "parsing") {
        stop(controller)
        return
      }
      controller.timer = setTimeout(
        () => void pollRef.current(controller),
        JOB_DESCRIPTION_POLL_INTERVAL_MS,
      )
    },
    [clearSynchronizationError, getParsingRole, mergeRole, stop],
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
      if (!getParsingRole(roleId)) return false
      clearSynchronizationError(roleId)
      start(roleId)
      return true
    },
    [clearSynchronizationError, getParsingRole, start],
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
      if (role?.jdState.status !== "parsing") stop(controller)
    }
    for (const role of data.roles) {
      if (role.jdState.status === "parsing") start(role.id)
    }
  }, [data, start, stop])

  return { clearSynchronizationError, restartSynchronization, synchronizationErrorRoleIds }
}
