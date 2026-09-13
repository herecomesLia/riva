export type RecognizeRoleInput =
  | { sourceType: "text"; text: string }
  | { sourceType: "image"; images: File[] }
  | { sourceType: "url"; url: string }
