export type AsyncStatus = 'idle' | 'loading' | 'error' | 'empty' | 'success'

export type AsyncState<T> =
  | { status: 'idle' | 'loading' }
  | { status: 'error'; error: string }
  | { status: 'empty' }
  | { status: 'success'; data: T }
