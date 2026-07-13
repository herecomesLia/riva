export type Loadable<T> =
  | {
      status: "loading"
    }
  | {
      status: "ready"
      data: T
    }
