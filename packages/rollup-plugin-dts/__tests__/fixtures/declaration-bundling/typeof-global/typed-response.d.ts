/** A `Response` whose `json()` is typed */
interface TypedResponse<T> extends Response {
  json(): Promise<T>
}
export type { TypedResponse as Response }
