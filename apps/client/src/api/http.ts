import axios, { type AxiosRequestConfig } from "axios"

import { normalizeRequestError } from "./error"

const apiClient = axios.create({
  baseURL: import.meta.env.BASE_URL,
  withCredentials: true,
})

export async function request<T>(
  config: AxiosRequestConfig,
  options?: AxiosRequestConfig,
): Promise<T> {
  try {
    const response = await apiClient.request<T>({ ...config, ...options })
    return response.data
  } catch (error) {
    throw normalizeRequestError(error)
  }
}
