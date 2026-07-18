import { useQuery } from "@tanstack/react-query"

import { getRolesPage } from "@/services/roles"

import { RolesView } from "./RolesView"

const rolesQueryKey = ["roles"] as const

export function RolesPage() {
  const rolesQuery = useQuery({
    queryFn: getRolesPage,
    queryKey: rolesQueryKey,
    retry: false,
  })

  if (rolesQuery.data !== undefined) {
    return <RolesView content={{ status: "ready", data: rolesQuery.data }} variant="default" />
  }

  if (rolesQuery.isFetching) {
    return <RolesView content={{ status: "loading" }} variant="default" />
  }

  if (rolesQuery.isError) {
    return <RolesView onRetry={() => void rolesQuery.refetch()} variant="error" />
  }

  return <RolesView content={{ status: "loading" }} variant="default" />
}
