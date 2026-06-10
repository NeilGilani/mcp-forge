import { readFile } from 'node:fs/promises'
import YAML from 'yaml'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = Record<string, any>

export interface ParamDef {
  name: string
  location: 'path' | 'query' | 'header'
  required: boolean
  type: 'string' | 'number' | 'integer' | 'boolean'
  description?: string
}

export interface ToolDef {
  name: string
  description: string
  method: string
  path: string
  params: ParamDef[]
  hasBody: boolean
  bodyRequired: boolean
}

const METHODS = ['get', 'post', 'put', 'patch', 'delete']

/** Load an OpenAPI/Swagger spec from a local file path or an http(s) URL. JSON or YAML. */
export async function loadSpec(source: string): Promise<Json> {
  let text: string
  if (/^https?:\/\//.test(source)) {
    const res = await fetch(source)
    if (!res.ok) throw new Error(`Failed to fetch spec (${res.status})`)
    text = await res.text()
  } else {
    text = await readFile(source, 'utf8')
  }
  try {
    return JSON.parse(text)
  } catch {
    return YAML.parse(text)
  }
}

function resolveRef(spec: Json, ref: string): Json | null {
  if (!ref.startsWith('#/')) return null
  let cur: any = spec
  for (const part of ref.slice(2).split('/')) {
    const key = part.replace(/~1/g, '/').replace(/~0/g, '~')
    cur = cur?.[key]
    if (cur == null) return null
  }
  return cur
}

function deref<T extends Json>(spec: Json, obj: T): T {
  if (obj && typeof obj === 'object' && '$ref' in obj) {
    return (resolveRef(spec, (obj as any).$ref) as T) ?? obj
  }
  return obj
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^_+/, '').slice(0, 64) || 'op'
}

function mapType(t: string | undefined): ParamDef['type'] {
  if (t === 'integer') return 'integer'
  if (t === 'number') return 'number'
  if (t === 'boolean') return 'boolean'
  return 'string'
}

/** Convert a parsed OpenAPI spec into a flat list of MCP-ready tool definitions. */
export function openapiToTools(spec: Json): ToolDef[] {
  const tools: ToolDef[] = []
  const paths: Json = spec.paths || {}

  for (const path of Object.keys(paths)) {
    const item = paths[path] || {}
    const shared = (item.parameters || []).map((p: Json) => deref(spec, p))

    for (const method of METHODS) {
      const op = item[method]
      if (!op) continue

      const opParams = (op.parameters || []).map((p: Json) => deref(spec, p))
      const params: ParamDef[] = [...shared, ...opParams]
        .filter((p: Json) => p && p.in && p.in !== 'cookie')
        .map((p: Json) => ({
          name: p.name,
          location: p.in,
          required: !!p.required || p.in === 'path',
          type: mapType(p.schema?.type),
          description: p.description,
        }))

      const body = op.requestBody ? deref(spec, op.requestBody) : null
      const hasBody = !!body && !!(body.content?.['application/json'] || body.content?.['*/*'])

      tools.push({
        name: sanitize(op.operationId || `${method}_${path}`),
        description: String(op.summary || op.description || `${method.toUpperCase()} ${path}`).slice(0, 300),
        method: method.toUpperCase(),
        path,
        params,
        hasBody,
        bodyRequired: hasBody && !!body?.required,
      })
    }
  }
  return tools
}

/** Best-effort base URL from the spec's servers list. */
export function getBaseUrl(spec: Json): string | undefined {
  const url = spec.servers?.[0]?.url
  return typeof url === 'string' ? url : undefined
}
