import type { ContextVariableMap, NotFoundHandler } from './hono.ts'
import type { CookieOptions } from './utils/cookie.ts'
import { serialize } from './utils/cookie.ts'
import type { StatusCode } from './utils/http-status.ts'
import { isAbsoluteURL } from './utils/url.ts'

type Headers = Record<string, string>
export type Data = string | ArrayBuffer | ReadableStream
type Env = Record<string, any>

export interface Context<RequestParamKeyType extends string = string, E = Env> {
  req: Request<RequestParamKeyType>
  env: E
  event: FetchEvent
  executionCtx: ExecutionContext
  finalized: boolean

  get res(): Response
  set res(_res: Response)
  header: (name: string, value: string) => void
  status: (status: StatusCode) => void
  set: {
    <Key extends keyof ContextVariableMap>(key: Key, value: ContextVariableMap[Key]): void
    (key: string, value: any): void
  }
  get: {
    <Key extends keyof ContextVariableMap>(key: Key): ContextVariableMap[Key]
    <T = any>(key: string): T
  }
  pretty: (prettyJSON: boolean, space?: number) => void
  newResponse: (data: Data | null, status: StatusCode, headers: Headers) => Response
  body: (data: Data | null, status?: StatusCode, headers?: Headers) => Response
  text: (text: string, status?: StatusCode, headers?: Headers) => Response
  json: <T>(object: T, status?: StatusCode, headers?: Headers) => Response
  html: (html: string, status?: StatusCode, headers?: Headers) => Response
  redirect: (location: string, status?: StatusCode) => Response
  cookie: (name: string, value: string, options?: CookieOptions) => void
  notFound: () => Response | Promise<Response>
}

export class HonoContext<RequestParamKeyType extends string = string, E = Env>
  implements Context<RequestParamKeyType, E>
{
  req: Request<RequestParamKeyType>
  env: E
  finalized: boolean

  _status: StatusCode = 200
  private _executionCtx: FetchEvent | ExecutionContext | undefined
  private _pretty: boolean = false
  private _prettySpace: number = 2
  private _map: Record<string, any> | undefined
  private _headers: Record<string, string> | undefined
  private _res: Response | undefined
  private notFoundHandler: NotFoundHandler

  constructor(
    req: Request,
    env: E | undefined = undefined,
    executionCtx: FetchEvent | ExecutionContext | undefined = undefined,
    notFoundHandler: NotFoundHandler = () => new Response()
  ) {
    this._executionCtx = executionCtx
    this.req = req
    this.env = env ? env : ({} as E)

    this.notFoundHandler = notFoundHandler
    this.finalized = false
  }

  get event(): FetchEvent {
    if (this._executionCtx instanceof FetchEvent) {
      return this._executionCtx
    } else {
      throw Error('This context has no FetchEvent')
    }
  }

  get executionCtx(): ExecutionContext {
    if (this._executionCtx) {
      return this._executionCtx
    } else {
      throw Error('This context has no ExecutionContext')
    }
  }

  get res(): Response {
    return (this._res ||= new Response())
  }

  set res(_res: Response) {
    this._res = _res
    this.finalized = true
  }

  header(name: string, value: string): void {
    this._headers ||= {}
    this._headers[name.toLowerCase()] = value
    if (this.finalized) {
      this.res.headers.set(name, value)
    }
  }

  status(status: StatusCode): void {
    this._status = status
  }

  set<Key extends keyof ContextVariableMap>(key: Key, value: ContextVariableMap[Key]): void
  set(key: string, value: any): void
  set(key: string, value: any): void {
    this._map ||= {}
    this._map[key] = value
  }

  get<Key extends keyof ContextVariableMap>(key: Key): ContextVariableMap[Key]
  get<T = any>(key: string): T
  get(key: string) {
    if (!this._map) {
      return undefined
    }
    return this._map[key]
  }

  pretty(prettyJSON: boolean, space: number = 2): void {
    this._pretty = prettyJSON
    this._prettySpace = space
  }

  newResponse(data: Data | null, status: StatusCode, headers: Headers = {}): Response {
    const _headers = { ...this._headers }
    if (this._res) {
      this._res.headers.forEach((v, k) => {
        _headers[k] = v
      })
    }
    return new Response(data, {
      status: status || this._status || 200,
      headers: { ..._headers, ...headers },
    })
  }

  body(data: Data | null, status: StatusCode = this._status, headers: Headers = {}): Response {
    return this.newResponse(data, status, headers)
  }

  text(text: string, status: StatusCode = this._status, headers: Headers = {}): Response {
    headers['content-type'] = 'text/plain; charset=UTF-8'
    return this.body(text, status, headers)
  }

  json<T>(object: T, status: StatusCode = this._status, headers: Headers = {}): Response {
    const body = this._pretty
      ? JSON.stringify(object, null, this._prettySpace)
      : JSON.stringify(object)
    headers['content-type'] = 'application/json; charset=UTF-8'
    return this.body(body, status, headers)
  }

  html(html: string, status: StatusCode = this._status, headers: Headers = {}): Response {
    headers['content-type'] = 'text/html; charset=UTF-8'
    return this.body(html, status, headers)
  }

  redirect(location: string, status: StatusCode = 302): Response {
    if (!isAbsoluteURL(location)) {
      const url = new URL(this.req.url)
      url.pathname = location
      location = url.toString()
    }
    return this.newResponse(null, status, {
      Location: location,
    })
  }

  cookie(name: string, value: string, opt?: CookieOptions): void {
    const cookie = serialize(name, value, opt)
    this.header('set-cookie', cookie)
  }

  notFound(): Response | Promise<Response> {
    return this.notFoundHandler(this as any)
  }
}
