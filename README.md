# @fswap/mcp-outline

An [MCP](https://modelcontextprotocol.io) server for [Outline](https://www.getoutline.com) that lets Claude Desktop, Claude Code, Cursor and other MCP clients search, read, create and update your wiki.

Runs locally over stdio. No install step — clients launch it with `npx`.

## Quick start

1. Create an API token in Outline under **Settings → API**.
2. Run the interactive setup once:

   ```bash
   npx -y @fswap/mcp-outline setup
   ```

   It asks for your Outline URL and token, verifies them against `auth.info`, and stores them in your OS config directory (mode `0600`).

3. Add the server to your client. Every value asked in `setup` can be skipped with Enter; anything you skip goes into the `env` block shown below instead. `setup --print` shows these snippets again at any time.

   **Claude Desktop** (`claude_desktop_config.json`) and **Cursor** (`~/.cursor/mcp.json` or `<project>/.cursor/mcp.json`):

   ```json
   {
     "mcpServers": {
       "outline": {
         "command": "npx",
         "args": ["-y", "@fswap/mcp-outline"]
       }
     }
   }
   ```

   **Codex** (`~/.codex/config.toml`):

   ```toml
   [mcp_servers.outline]
   command = "npx"
   args = ["-y", "@fswap/mcp-outline"]
   ```

   **Claude Code**:

   ```bash
   claude mcp add outline -- npx -y @fswap/mcp-outline
   ```

### Without `setup` (environment variables)

Environment variables take precedence over the config file, so you can skip `setup` entirely (or skip individual values in it and set them here):

```json
{
  "mcpServers": {
    "outline": {
      "command": "npx",
      "args": ["-y", "@fswap/mcp-outline"],
      "env": {
        "OUTLINE_URL": "https://app.getoutline.com",
        "OUTLINE_API_TOKEN": "ol_api_..."
      }
    }
  }
}
```

Codex equivalent:

```toml
[mcp_servers.outline]
command = "npx"
args = ["-y", "@fswap/mcp-outline"]
[mcp_servers.outline.env]
OUTLINE_URL = "https://app.getoutline.com"
OUTLINE_API_TOKEN = "ol_api_..."
```

| Variable | Purpose |
|---|---|
| `OUTLINE_URL` | Outline base URL (cloud or self-hosted) |
| `OUTLINE_API_TOKEN` | API token |
| `OUTLINE_ALLOW_DELETE` | `true` to expose `delete_document` |
| `OUTLINE_DEFAULT_COLLECTION` | Optional default collection name |

## Tools

| Tool | Outline endpoint | Notes |
|---|---|---|
| `list_collections` | `collections.list` | id, name, description, url |
| `get_collection` | `collections.info` | includes document tree |
| `search_documents` | `documents.search` | query, optional `collectionId`; returns snippets, not bodies |
| `get_document` | `documents.info` | full markdown body; accepts id or URL slug |
| `list_documents` | `documents.list` | filter by `collectionId` / `parentDocumentId` |
| `create_document` | `documents.create` | title, markdown, collection, optional parent; published by default |
| `update_document` | `documents.update` | title/text; `append=true` appends instead of replacing |
| `move_document` | `documents.move` | change collection and/or parent |
| `archive_document` | `documents.archive` | reversible |
| `delete_document` | `documents.delete` | only when delete is allowed (setup answer or `OUTLINE_ALLOW_DELETE=true`) |

API errors are returned to the model as `isError` results rather than crashing the server.

## Development

TypeScript source in `src/`, bundled to `dist/` with [tsdown](https://tsdown.dev). Only `dist/` is published.

```bash
npm install
npm run build        # tsdown → dist/index.js
npm run lint         # eslint (typescript-eslint)
npm run typecheck    # tsc --noEmit
npm test             # builds, then spawns the server and checks the tool list
npm run check        # all of the above (also runs on prepublishOnly)
OUTLINE_URL=... OUTLINE_API_TOKEN=... npm run inspect   # MCP Inspector UI against dist/
```

Never write to stdout from server code — it is the protocol channel. Use `console.error`.

## Reset

```bash
npx -y @fswap/mcp-outline setup --reset
```

## License

MIT
