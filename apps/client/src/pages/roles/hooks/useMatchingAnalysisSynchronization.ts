import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useRef, useState } from "react"

import {
  AGENT_POLLING_FAST_INTERVAL_MS,
  AGENT_POLLING_TIMEOUT_MS,
  getAgentPollingInterval,
} from "@/lib/agent-polling"
import type { GetMatchingAnalysisStatusInput, RolesPageResponse, TargetRole } from "@/models/roles"
import { getMatchingAnalysisStatus } from "@/services/roles"

import { ROLES_QUERY_KEY } from "./useJobDescriptionSynchronization"

export const MATCHING_ANALYSIS_POLL_INTERVAL_MS = AGENT_POLLING_FAST_INTERVAL_MS

type MatchingAnalysisOperation = {
  input: GetMatchingAnalysisStatusInput
  profileVersion: number
  jobDescriptionVersion: number
  jobDescriptionAnalysisVersion: number
}

type PollingController = {
  deadlineTimer: ReturnType<typeof setTimeout> | null
  operation: MatchingAnalysisOperation
  startedAt: number
  timer: ReturnType<typeof setTimeout> | null
}

function createOperationKey(operation: MatchingAnalysisOperation) {
  const { input, profileVersion, jobDescriptionVersion, jobDescriptionAnalysisVersion } = operation
  return `${input.roleId}:${input.version}:${profileVersion}:${jobDescriptionVersion}:${jobDescriptionAnalysisVersion}`
}

function createDeadlineKey(operation: MatchingAnalysisOperation) {
  const { input, profileVersion, jobDescriptionVersion, jobDescriptionAnalysisVersion } = operation
  return `${input.roleId}:${profileVersion}:${jobDescriptionVersion}:${jobDescriptionAnalysisVersion}`
}

function getGeneratingOperation(role: TargetRole): MatchingAnalysisOperation | null {
  if (role.matchingAnalysis?.status !== "generating") return null
  return {
    input: { roleId: role.id, version: role.version },
    profileVersion: role.matchingAnalysis.profileVersion,
    jobDescriptionVersion: role.matchingAnalysis.jobDescriptionVersion,
    jobDescriptionAnalysisVersion: role.matchingAnalysis.jobDescriptionAnalysisVersion,
  }
}

export function useMatchingAnalysisSynchronization(data: RolesPageResponse | undefined) {
  const queryClient = useQueryClient()
  const [synchronizationErrorRoleIds, setSynchronizationErrorRoleIds] = useState<string[]>([])
  const mountedRef = useRef(true)
  const activeControllersRef = useRef(new Map<string, PollingController>())
  const failedOperationKeysRef = useRef(new Set<string>())

  const isCurrentOperation = useCallback(
    (operation: MatchingAnalysisOperation) => {
      const current = queryClient.getQueryData<RolesPageResponse>(ROLES_QUERY_KEY)
      const role = current?.roles.find((candidate) => candidate.id === operation.input.roleId)
      const analysis = role?.matchingAnalysis
      return (
        role?.version === operation.input.version &&
        analysis?.status === "generating" &&
        analysis.profileVersion === operation.profileVersion &&
        analysis.jobDescriptionVersion === operation.jobDescriptionVersion &&
        analysis.jobDescriptionAnalysisVersion === operation.jobDescriptionAnalysisVersion
      )
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
    if (controller.deadlineTimer !== null) clearTimeout(controller.deadlineTimer)
    if (activeControllersRef.current.get(roleId) === controller) {
      activeControllersRef.current.delete(roleId)
    }
  }, [])

  const mergeRoleSnapshot = useCallback(
    (responseRole: TargetRole, controller: PollingController) => {
      const operation = controller.operation
      const { input } = operation
      let merged = false
      queryClient.setQueryData<RolesPageResponse>(ROLES_QUERY_KEY, (current) => {
        if (!mountedRef.current || activeControllersRef.current.get(input.roleId) !== controller) {
          return current
        }
        const currentRole = current?.roles.find((candidate) => candidate.id === input.roleId)
        const currentAnalysis = currentRole?.matchingAnalysis
        const responseAnalysis = responseRole.matchingAnalysis
        if (
          !current ||
          responseRole.id !== input.roleId ||
          currentRole?.version !== input.version ||
          currentAnalysis?.status !== "generating" ||
          currentAnalysis.profileVersion !== operation.profileVersion ||
          currentAnalysis.jobDescriptionVersion !== operation.jobDescriptionVersion ||
          currentAnalysis.jobDescriptionAnalysisVersion !==
            operation.jobDescriptionAnalysisVersion ||
          !responseAnalysis ||
          responseAnalysis.profileVersion !== operation.profileVersion ||
          responseAnalysis.jobDescriptionVersion !== operation.jobDescriptionVersion ||
          responseAnalysis.jobDescriptionAnalysisVersion !== operation.jobDescriptionAnalysisVersion
        ) {
          return current
        }

        const dependenciesAreFresh =
          current.profileContext.exists &&
          current.profileContext.version === responseAnalysis.profileVersion &&
          currentRole.jobDescription.status === "ready" &&
          currentRole.jobDescription.version === responseAnalysis.jobDescriptionVersion &&
          currentRole.jobDescriptionAnalysis?.analysisVersion ===
            responseAnalysis.jobDescriptionAnalysisVersion
        const matchingAnalysis =
          responseAnalysis.status === "current" && !dependenciesAreFresh
            ? { ...responseAnalysis, status: "stale" as const }
            : responseAnalysis

        merged = true
        return {
          ...current,
          roles: current.roles.map((candidate) =>
            candidate.id === input.roleId
              ? {
                  ...candidate,
                  version: responseRole.version,
                  updatedAt: responseRole.updatedAt,
                  matchingAnalysis,
                }
              : candidate,
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
      const operation = controller.operation
      const { input } = operation
      if (
        !mountedRef.current ||
        activeControllersRef.current.get(input.roleId) !== controller ||
        !isCurrentOperation(operation)
      ) {
        stopController(input.roleId, controller)
        return
      }

      if (getAgentPollingInterval(Date.now() - controller.startedAt) === false) {
        failedOperationKeysRef.current.add(createOperationKey(operation))
        stopController(input.roleId, controller)
        setSynchronizationErrorRoleIds((current) =>
          current.includes(input.roleId) ? current : [...current, input.roleId],
        )
        return
      }

      let role: TargetRole
      try {
        role = await getMatchingAnalysisStatus(input)
      } catch {
        if (
          mountedRef.current &&
          activeControllersRef.current.get(input.roleId) === controller &&
          isCurrentOperation(operation)
        ) {
          failedOperationKeysRef.current.add(createOperationKey(operation))
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
        !isCurrentOperation(operation)
      ) {
        stopController(input.roleId, controller)
        return
      }

      if (!mergeRoleSnapshot(role, controller)) {
        stopController(input.roleId, controller)
        return
      }

      clearSynchronizationError(input.roleId)
      const nextOperation = getGeneratingOperation(role)
      if (!nextOperation) {
        stopController(input.roleId, controller)
        return
      }
      controller.operation = nextOperation
      const interval = getAgentPollingInterval(Date.now() - controller.startedAt)
      if (interval === false) {
        failedOperationKeysRef.current.add(createOperationKey(nextOperation))
        stopController(input.roleId, controller)
        setSynchronizationErrorRoleIds((current) =>
          current.includes(input.roleId) ? current : [...current, input.roleId],
        )
        return
      }
      controller.timer = setTimeout(() => void pollRef.current(controller), interval)
    },
    [clearSynchronizationError, isCurrentOperation, mergeRoleSnapshot, stopController],
  )
  pollRef.current = poll

  const startPolling = useCallback(
    (operation: MatchingAnalysisOperation, startedAt = Date.now()) => {
      if (
        !mountedRef.current ||
        failedOperationKeysRef.current.has(createOperationKey(operation))
      ) {
        return
      }
      const existing = activeControllersRef.current.get(operation.input.roleId)
      if (existing && createOperationKey(existing.operation) === createOperationKey(operation)) {
        return
      }
      if (existing) stopController(operation.input.roleId, existing)

      const controller: PollingController = {
        deadlineTimer: null,
        operation,
        startedAt,
        timer: null,
      }
      activeControllersRef.current.set(operation.input.roleId, controller)
      controller.deadlineTimer = setTimeout(
        () => {
          const currentOperation = controller.operation
          const { input } = currentOperation
          if (
            !mountedRef.current ||
            activeControllersRef.current.get(input.roleId) !== controller ||
            !isCurrentOperation(currentOperation)
          ) {
            return
          }
          failedOperationKeysRef.current.add(createOperationKey(currentOperation))
          stopController(input.roleId, controller)
          setSynchronizationErrorRoleIds((current) =>
            current.includes(input.roleId) ? current : [...current, input.roleId],
          )
        },
        Math.max(0, AGENT_POLLING_TIMEOUT_MS - (Date.now() - startedAt)),
      )
      void pollRef.current(controller)
    },
    [isCurrentOperation, stopController],
  )

  const restartSynchronization = useCallback(
    (input: GetMatchingAnalysisStatusInput) => {
      const current = queryClient.getQueryData<RolesPageResponse>(ROLES_QUERY_KEY)
      const role = current?.roles.find((candidate) => candidate.id === input.roleId)
      const operation = role ? getGeneratingOperation(role) : null
      if (!current || !operation || operation.input.version !== input.version) return null
      clearFailedOperations(input.roleId)
      startPolling(operation)
      return current
    },
    [clearFailedOperations, queryClient, startPolling],
  )

  useEffect(() => {
    const activeControllers = activeControllersRef.current
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      for (const controller of activeControllers.values()) {
        if (controller.timer !== null) clearTimeout(controller.timer)
        if (controller.deadlineTimer !== null) clearTimeout(controller.deadlineTimer)
      }
      activeControllers.clear()
    }
  }, [])

  useEffect(() => {
    if (!data) return
    const replacements: Array<{
      operation: MatchingAnalysisOperation
      startedAt: number
    }> = []
    for (const [roleId, controller] of activeControllersRef.current) {
      const role = data.roles.find((candidate) => candidate.id === roleId)
      const operation = role ? getGeneratingOperation(role) : null
      if (
        operation &&
        createDeadlineKey(operation) === createDeadlineKey(controller.operation) &&
        createOperationKey(operation) !== createOperationKey(controller.operation)
      ) {
        stopController(roleId, controller)
        replacements.push({ operation, startedAt: controller.startedAt })
      } else if (
        !operation ||
        createDeadlineKey(operation) !== createDeadlineKey(controller.operation)
      ) {
        stopController(roleId, controller)
      }
    }
    for (const replacement of replacements) {
      startPolling(replacement.operation, replacement.startedAt)
    }
    for (const role of data.roles) {
      const operation = getGeneratingOperation(role)
      if (operation) startPolling(operation)
    }
  }, [data, startPolling, stopController])

  return {
    clearSynchronizationError,
    restartSynchronization,
    synchronizationErrorRoleIds,
  }
}
