import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { OutlineClient } from "../client.js";
import { ok, guard } from "./_shared.js";

interface Collection {
  id: string;
  name: string;
  description?: string | null;
  url: string;
  documents?: unknown[];
}

export function registerCollectionTools(server: McpServer, outline: OutlineClient): void {
  server.registerTool(
    "list_collections",
    {
      title: "List collections",
      description:
        "List Outline collections (top-level groupings of documents). Returns id, name, description and url. " +
        "Use the id with search_documents, list_documents or create_document.",
      inputSchema: {
        query: z.string().optional().describe("Filter collections by name (substring match)"),
        limit: z.number().int().min(1).max(100).default(25).describe("Max collections to return"),
      },
    },
    guard(async ({ query, limit }) => {
      const body: Record<string, unknown> = { limit, sort: "name", direction: "ASC" };
      if (query) body.query = query;
      const { data } = await outline.post<Collection[]>("collections.list", body);
      return ok(
        data.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description || null,
          url: c.url,
        })),
      );
    }),
  );

  server.registerTool(
    "get_collection",
    {
      title: "Get collection",
      description:
        "Get one Outline collection including its document tree (ids, titles and nesting). " +
        "Useful to understand how a collection is organised before creating or moving documents.",
      inputSchema: {
        id: z.string().describe("Collection id"),
      },
    },
    guard(async ({ id }) => {
      const { data } = await outline.post<Collection>("collections.info", { id });
      return ok({
        id: data.id,
        name: data.name,
        description: data.description || null,
        url: data.url,
        documents: data.documents ?? [],
      });
    }),
  );
}
