#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { loadSpec, openapiToTools, getBaseUrl } from './openapi.js'
import { buildServer } from './server.js'

interface Args {
  spec?: string
  baseUrl?: string
  name?: string
  headers: Record<string, string>
}

function parseArgs(argv: string[]): Args {
  const args: Args = { headers: {} }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--base-url') args.baseUrl = argv[++i]
    else if (a === '--name') args.name = argv[++i]
    else if (a === '--header') {
      const h = argv[++i] || ''
      const idx = h.indexOf(':')
      if (idx > 0) args.headers[h.slice(0, idx).trim()] = h.slice(idx + 1).trim()
    } else if (!a.startsWith('-') && !args.spec) {
      args.spec = a
    }
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.spec) {
    console.error('Usage: mcp-forge <openapi-spec-file-or-url> [--base-url URL] [--header "Key: Value"] [--name NAME]')
    process.exit(1)
  }

  const spec = await loadSpec(args.spec)
  const tools = openapiToTools(spec)
  const baseUrl = args.baseUrl || getBaseUrl(spec)

  if (!baseUrl) {
    console.error('No server URL found in the spec — pass one with --base-url')
    process.exit(1)
  }
  if (tools.length === 0) {
    console.error('No operations found in the spec.')
    process.exit(1)
  }

  const server = buildServer(tools, { baseUrl, headers: args.headers, name: args.name })
  // stdout is reserved for the MCP protocol — log to stderr.
  console.error(`mcp-forge: serving ${tools.length} tools from ${args.spec} -> ${baseUrl}`)
  await server.connect(new StdioServerTransport())
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
