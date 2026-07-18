import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useRef, useState } from "react"

import type { GetMatchingAnalysisStatusInput, RolesPageResponse, TargetRole } from "@/models/roles"
import { getMatchingAnalysisStatus } from "@/services/roles"

import { ROLES_QUERY_KEY } from "./useJobDescriptionSynchronization"

export const MATCHING_ANALYSIS_POLL_INTERVAL_MS = 1000

type PollingController = {
  input: GetMatchingAnalysisStatusInput
  timer: ReturnType<typeof setTimeout> | null
}

function createOperationKey(input: GetMatchingAnalysisStatusInput) {
  return `${input.roleId}:${input.version}`
}

function getGeneratingInput(role: TargetRole): GetMatchingAnalysisStatusInput | null {
  if (role.matchingAnalysis?.status !== "generating") return null
  return { roleId: role.id, version: role.version }
}

export function useMatchingAnalysisSynchronization(data: RolesPageResponse | undefined) {
  const queryClient = useQueryClient()
  const [synchronizationErrorRoleIds, setSynchronizationErrorRoleIds] = useState<string[]>([])
  const mountedRef = useRef(true)
  const activeControllersRef = useRef(new Map<string, PollingController>())
  const failedOperationKeysRef = useRef(new Set<string>())

  const isCurrentOperation = useCallback(
    (input: GetMatchingAnalysisStatusInput) => {
      const current = queryClient.getQueryData<RolesPageResponse>(ROLES_QUERY_KEY)
      const role = current?.roles.find((candidate) => candidate.id === input.roleId)
      return role?.version === input.version && role.matchingAnalysis?.status === "generating"
    },
    [queryClient],
  )

  const clearFailedOperations = useCallback((roleId: string) => {
    for (const operationKey of failedOperationKeysRef.current) {
      if (operationKey.startsWith(`${roleId}:`)) {
        failedOperationKeysRef.current.delete(operationKey)
      }
    }
  }, [])

  const clearSynchronizationError = useCallback(
    (roleId: string) => {
      clearFailedOperations(roleId)
      if (!mountedRef.current) return
      setSynchronizationErrorRoleIds((current) =>
        current.includes(roleId) ? current.filter((candidate) => candidate !== roleId) : current,
      )
    },
    [clearFailedOperations],
  )

  const stopController = useCallback((roleId: string, controller: PollingController) => {
    if (controller.timer !== null) clearTimeout(controller.timer)
    if (activeControllersRef.current.get(roleId) === controller) {
      activeControllersRef.current.delete(roleId)
    }
  }, [])

  const mergeRoleSnapshot = useCallback(
    (role: TargetRole, input: GetMatchingAnalysisStatusInput, controller: PollingController) => {
      let merged = false
      queryClient.setQueryData<RolesPageResponse>(ROLES_QUERY_KEY, (current) => {
        if (!mountedRef.current || activeControllersRef.current.get(input.roleId) !== controller) {
          return current
        }
        const currentRole = current?.roles.find((candidate) => candidate.id === input.roleId)
        const currentAnalysis = currentRole?.matchingAnalysis
        const responseAnalysis = role.matchingAnalysis
        if (
          !current ||
          currentRole?.version !== input.version ||
          currentAnalysis?.status !== "generating" ||
          role.id !== input.roleId ||
          !responseAnalysis ||
          responseAnalysis.profileVersion !== currentAnalysis.profileVersion ||
          responseAnalysis.jobDescriptionVersion !== currentAnalysis.jobDescriptionVersion
        ) {
          return current
        }
        merged = true
        return {
          ...current,
          roles: current.roles.map((candidate) =>
            candidate.id === input.roleId ? role : candidate,
          ),
        }
      })
      return merged
    },
    [queryClient],
  )

  const pollRef = useRef<(controller: PollingController) => Promise<void>>(async () => {})
  const poll = useCallback(
    async (controller: PollingController) => {
      const input = controller.input
      if (
        !mountedRef.current ||
        activeControllersRef.current.get(input.roleId) !== controller ||
        !isCurrentOperation(input)
      ) {
        stopController(input.roleId, controller)
        return
      }

      let role: TargetRole
      try {
        role = await getMatchingAnalysisStatus(input)
      } catch {
        if (
          mountedRef.current &&
          activeControllersRef.current.get(input.roleId) === controller &&
          isCurrentOperation(input)
        ) {
          failedOperationKeysRef.current.add(createOperationKey(input))
          stopController(input.roleId, controller)
          setSynchronizationErrorRoleIds((current) =>
            current.includes(input.roleId) ? current : [...current, input.roleId],
          )
        }
        return
      }

      if (
        !mountedRef.current ||
        activeControllersRef.current.get(input.roleId) !== controller ||
        !isCurrentOperation(input)
      ) {
        stopController(input.roleId, controller)
        return
      }

      const nextInput = getGeneratingInput(role)
      if (nextInput) controller.input = nextInput
      if (!mergeRoleSnapshot(role, input, controller)) {
        stopController(input.roleId, controller)
        return
      }

      clearSynchronizationError(input.roleId)
      if (!nextInput) {
        stopController(input.roleId, controller)
        return
      }
      controller.timer = setTimeout(
        () => void pollRef.current(controller),
        MATCHING_ANALYSIS_POLL_INTERVAL_MS,
      )
    },
    [clearSynchronizationError, isCurrentOperation, mergeRoleSnapshot, stopController],
  )
  pollRef.current = poll

  const startPolling = useCallback(
    (input: GetMatchingAnalysisStatusInput) => {
      if (!mountedRef.current || failedOperationKeysRef.current.has(createOperationKey(input))) {
        return
      }
      const existing = activeControllersRef.current.get(input.roleId)
      if (existing && createOperationKey(existing.input) === createOperationKey(input)) return
      if (existing) stopController(input.roleId, existing)

      const controller: PollingController = { input, timer: null }
      activeControllersRef.current.set(input.roleId, controller)
      void pollRef.current(controller)
    },
    [stopController],
  )

  const restartSynchronization = useCallback(
    (input: GetMatchingAnalysisStatusInput) => {
      const current = queryClient.getQueryData<RolesPageResponse>(ROLES_QUERY_KEY)
      if (!current || !isCurrentOperation(input)) return null
      clearFailedOperations(input.roleId)
      startPolling(input)
      return current
    },
    [clearFailedOperations, isCurrentOperation, queryClient, startPolling],
  )

  useEffect(() => {
    const activeControllers = activeControllersRef.current
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      for (const controller of activeControllers.values()) {
        if (controller.timer !== null) clearTimeout(controller.timer)
      }
      activeControllers.clear()
    }
  }, [])

  useEffect(() => {
    if (!data) return
    for (const [roleId, controller] of activeControllersRef.current) {
      const role = data.roles.find((candidate) => candidate.id === roleId)
      const input = role ? getGeneratingInput(role) : null
      if (!input || createOperationKey(input) !== createOperationKey(controller.input)) {
        stopController(roleId, controller)
      }
    }
    for (const role of data.roles) {
      const input = getGeneratingInput(role)
      if (input) startPolling(input)
    }
  }, [data, startPolling, stopController])

  return {
    clearSynchronizationError,
    restartSynchronization,
    synchronizationErrorRoleIds,
  }
}
