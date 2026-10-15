import type { Response } from './typed-response'

export interface Options {
  /** Bring your own implementation, e.g. the one from `undici` */
  Response?: typeof Response
}

export declare function request<T>(url: string, options?: Options): Promise<Response<T>>
