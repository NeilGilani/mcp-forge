# mcp-forge

**Turn any OpenAPI spec into a working MCP server.** Point it at a spec (file or URL) and Claude instantly gets a tool for every endpoint — no codegen, no boilerplate, no hand-writing tool definitions.

```bash
npx mcp-forge ./openapi.json
# -> serving 14 tools from ./openapi.json -> https://api.example.com/v1
```

[MCP](https://modelcontextprotocol.io) is how Claude calls real tools. Writing an MCP server for an API you already have is tedious busywork — `mcp-forge` does it in one command by reading the API's own OpenAPI/Swagger spec at runtime and proxying the calls.

- 🔌 **Any REST API** with an OpenAPI 3 / Swagger spec → Claude tools
- ⚡ **Runtime, zero codegen** — no generated files to maintain
- 🧭 One tool per operation, typed inputs built from the spec's parameters
- 🔐 Pass auth headers through to the upstream API
- 📄 JSON **or** YAML specs, local file **or** URL

## Use it with Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "petstore": {
      "command": "npx",
      "args": ["-y", "mcp-forge", "https://petstore3.swagger.io/api/v3/openapi.json"]
    }
  }
}
```

With auth + an explicit base URL:

```json
{
  "mcpServers": {
    "myapi": {
      "command": "npx",
      "args": [
        "-y", "mcp-forge", "./openapi.yaml",
        "--base-url", "https://api.example.com/v1",
        "--header", "Authorization: Bearer YOUR_TOKEN"
      ]
    }
  }
}
```

## CLI

```
mcp-forge <openapi-spec-file-or-url> [options]

  --base-url URL        Override the server URL (else taken from spec.servers[0])
  --header "Key: Value"  Header added to every upstream request (repeatable)
  --name NAME           MCP server name
```

## As a library

```ts
import { loadSpec, openapiToTools, buildServer } from 'mcp-forge'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

const spec = await loadSpec('./openapi.json')
const tools = openapiToTools(spec) // -> ToolDef[]
const server = buildServer(tools, { baseUrl: 'https://api.example.com/v1' })
await server.connect(new StdioServerTransport())
```

## How it works

1. Load + parse the spec (JSON/YAML, local or remote).
2. Walk `paths` × HTTP methods → one tool per operation. The tool's input schema is built from the operation's `path`, `query`, and `header` parameters (plus a `body` for request bodies).
3. When Claude calls a tool, `mcp-forge` builds the real HTTP request — filling path/query/header params and the JSON body — sends it, and returns the status + response.

## Scope (v1)

Supports OpenAPI 3 operations with path/query/header params and JSON request bodies, and local `#/...` `$ref` resolution. Deep/remote `$ref`s, `oneOf`/`allOf` body schemas, and non-JSON bodies are simplified — PRs welcome.

## License

MIT © 2026 Neil Gilani
