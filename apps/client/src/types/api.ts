export type ApiResponse<T> = {
  success: boolean
  data: T
  message?: string
  requestId: string
}

export type ApiErrorData = {
  success: false
  message: string
  code: string
  requestId: string
}

export type AsyncStatus = 'idle' | 'loading' | 'error' | 'empty' | 'success'

export type AsyncState<T> =
  | { status: 'idle' | 'loading' }
  | { status: 'error'; error: string }
  | { status: 'empty' }
  | { status: 'success'; data: T }
