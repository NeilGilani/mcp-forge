import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z, type ZodTypeAny } from 'zod'
import type { ToolDef, ParamDef } from './openapi.js'

export interface ServerOptions {
  /** Base URL every request is sent to, e.g. https://api.example.com/v1 */
  baseUrl: string
  /** Extra headers added to every request (e.g. auth). */
  headers?: Record<string, string>
  /** Server name reported over MCP. */
  name?: string
}

function zodForParam(p: ParamDef): ZodTypeAny {
  let base: ZodTypeAny =
    p.type === 'integer' || p.type === 'number'
      ? z.number()
      : p.type === 'boolean'
        ? z.boolean()
        : z.string()
  if (p.description) base = base.describe(p.description)
  return p.required ? base : base.optional()
}

async function callApi(tool: ToolDef, args: Record<string, unknown>, opts: ServerOptions): Promise<string> {
  let path = tool.path
  const query = new URLSearchParams()
  const headers: Record<string, string> = { ...(opts.headers || {}) }

  for (const p of tool.params) {
    const v = args[p.name]
    if (v == null) continue
    if (p.location === 'path') path = path.replace(`{${p.name}}`, encodeURIComponent(String(v)))
    else if (p.location === 'query') query.set(p.name, String(v))
    else if (p.location === 'header') headers[p.name] = String(v)
  }

  const url = opts.baseUrl.replace(/\/$/, '') + path + (query.toString() ? `?${query.toString()}` : '')
  const init: RequestInit = { method: tool.method, headers }
  if (tool.hasBody && args.body != null) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(args.body)
  }

  const res = await fetch(url, init)
  const text = await res.text()
  return `HTTP ${res.status} ${res.statusText}\n${text.slice(0, 8000)}`
}

/** Build an MCP server that exposes each OpenAPI operation as a tool proxying the real API. */
export function buildServer(tools: ToolDef[], opts: ServerOptions): McpServer {
  const server = new McpServer({ name: opts.name || 'mcp-forge', version: '0.1.0' })

  for (const tool of tools) {
    const shape: Record<string, ZodTypeAny> = {}
    for (const p of tool.params) shape[p.name] = zodForParam(p)
    if (tool.hasBody) {
      const body = z.record(z.unknown()).describe('JSON request body')
      shape.body = tool.bodyRequired ? body : body.optional()
    }

    const handler = async (args: Record<string, unknown>) => {
      try {
        return { content: [{ type: 'text' as const, text: await callApi(tool, args, opts) }] }
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Request failed: ${(err as Error).message}` }],
          isError: true,
        }
      }
    }

    // Cast keeps us compatible across @modelcontextprotocol/sdk minor versions,
    // since tools + schemas here are generated dynamically from the spec.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(server.tool as any)(tool.name, tool.description, shape, handler)
  }

  return server
}
