import { useQuery, useQueryClient } from "@tanstack/react-query"

import { rolesQueryKey, taskRefetchInterval } from "@/pages/roles/queries"
import { getCareerProfile, getCareerProfileExtractionState } from "@/services/profile"

export const careerProfileQueryKey = ["profile"] as const
export const careerProfileExtractionStateQueryKey = ["profile", "extraction"] as const

export function useCareerProfileQueries() {
  const queryClient = useQueryClient()
  const careerProfileQuery = useQuery({
    queryKey: careerProfileQueryKey,
    queryFn: ({ signal }) => getCareerProfile(signal),
    retry: false,
  })
  const careerProfileExtractionStateQuery = useQuery({
    queryKey: careerProfileExtractionStateQueryKey,
    queryFn: async ({ signal }) => {
      const state = await getCareerProfileExtractionState(signal)
      signal.throwIfAborted()
      // Also refresh on the first idle observation: a fast task may already be done.
      if (state.status === "idle") {
        await Promise.all([
          queryClient.invalidateQueries(
            { queryKey: careerProfileQueryKey, exact: true },
            { throwOnError: true },
          ),
          queryClient.invalidateQueries(
            { queryKey: rolesQueryKey, exact: true },
            { throwOnError: true },
          ),
        ])
        signal.throwIfAborted()
      }
      return state
    },
    retry: false,
    refetchInterval: taskRefetchInterval,
  })
  return { careerProfileQuery, careerProfileExtractionStateQuery }
}
