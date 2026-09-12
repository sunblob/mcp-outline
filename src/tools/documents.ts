import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { OutlineClient } from "../client.js";
import { ok, guard, stripUndefined } from "./_shared.js";

interface Document {
  id: string;
  title: string;
  url: string;
  urlId: string;
  text?: string;
  collectionId: string;
  parentDocumentId?: string | null;
  updatedAt: string;
  publishedAt?: string | null;
  archivedAt?: string | null;
}

interface SearchHit {
  document: Document;
  context: string;
  ranking: number;
}

function summarize(d: Document) {
  return {
    id: d.id,
    title: d.title,
    url: d.url,
    urlId: d.urlId,
    collectionId: d.collectionId,
    parentDocumentId: d.parentDocumentId ?? null,
    updatedAt: d.updatedAt,
    publishedAt: d.publishedAt ?? null,
    archivedAt: d.archivedAt ?? null,
  };
}

export interface DocumentToolOptions {
  allowDelete?: boolean;
}

export function registerDocumentTools(
  server: McpServer,
  outline: OutlineClient,
  { allowDelete = false }: DocumentToolOptions = {},
): void {
  server.registerTool(
    "search_documents",
    {
      title: "Search documents",
      description:
        "Full-text search across Outline documents. Returns id, title, url and a short context snippet per hit. " +
        "Does NOT return document bodies — call get_document with an id to read one.",
      inputSchema: {
        query: z.string().min(1).describe("Search terms"),
        collectionId: z.string().optional().describe("Restrict results to one collection"),
        limit: z.number().int().min(1).max(50).default(10).describe("Max results"),
        offset: z.number().int().min(0).default(0).describe("Pagination offset"),
      },
    },
    guard(async ({ query, collectionId, limit, offset }) => {
      const { data } = await outline.post<SearchHit[]>(
        "documents.search",
        stripUndefined({ query, collectionId, limit, offset }),
      );
      return ok(
        data.map((r) => ({
          id: r.document.id,
          title: r.document.title,
          url: r.document.url,
          collectionId: r.document.collectionId,
          updatedAt: r.document.updatedAt,
          snippet: r.context,
          ranking: r.ranking,
        })),
      );
    }),
  );

  server.registerTool(
    "get_document",
    {
      title: "Get document",
      description:
        "Fetch a single Outline document including its full markdown body. " +
        "Accepts a document id, a urlId (the slug part of the URL) or a share id.",
      inputSchema: {
        id: z.string().describe("Document id, urlId or share id"),
      },
    },
    guard(async ({ id }) => {
      const { data } = await outline.post<Document>("documents.info", { id });
      return ok({ ...summarize(data), text: data.text ?? "" });
    }),
  );

  server.registerTool(
    "list_documents",
    {
      title: "List documents",
      description:
        "List documents, optionally filtered by collection and/or parent document. Returns id, title, url and " +
        "timestamps (no bodies). Sorted by most recently updated by default.",
      inputSchema: {
        collectionId: z.string().optional().describe("Only documents in this collection"),
        parentDocumentId: z.string().optional().describe("Only direct children of this document"),
        sort: z.enum(["updatedAt", "createdAt", "title", "index"]).default("updatedAt"),
        direction: z.enum(["ASC", "DESC"]).default("DESC"),
        limit: z.number().int().min(1).max(100).default(25),
        offset: z.number().int().min(0).default(0),
      },
    },
    guard(async ({ collectionId, parentDocumentId, sort, direction, limit, offset }) => {
      const { data } = await outline.post<Document[]>(
        "documents.list",
        stripUndefined({ collectionId, parentDocumentId, sort, direction, limit, offset }),
      );
      return ok(data.map(summarize));
    }),
  );

  server.registerTool(
    "create_document",
    {
      title: "Create document",
      description:
        "Create a new Outline document from markdown. Published by default; pass publish=false to save a draft. " +
        "Requires a collectionId (use list_collections). Optionally nest under a parent document.",
      inputSchema: {
        title: z.string().min(1).describe("Document title"),
        text: z.string().default("").describe("Document body in markdown"),
        collectionId: z.string().describe("Collection to create the document in"),
        parentDocumentId: z.string().optional().describe("Nest under this document"),
        publish: z.boolean().default(true).describe("Publish immediately (false = draft)"),
      },
    },
    guard(async ({ title, text, collectionId, parentDocumentId, publish }) => {
      const { data } = await outline.post<Document>(
        "documents.create",
        stripUndefined({ title, text, collectionId, parentDocumentId, publish }),
      );
      return ok(summarize(data));
    }),
  );

  server.registerTool(
    "update_document",
    {
      title: "Update document",
      description:
        "Update an existing document's title and/or markdown body. By default `text` REPLACES the body; " +
        "set append=true to add `text` to the end instead. Only the fields you pass are changed.",
      inputSchema: {
        id: z.string().describe("Document id"),
        title: z.string().optional().describe("New title"),
        text: z.string().optional().describe("New markdown body (or text to append when append=true)"),
        append: z.boolean().default(false).describe("Append `text` to the existing body instead of replacing it"),
        publish: z.boolean().optional().describe("Publish a draft as part of this update"),
        done: z.boolean().optional().describe("Mark the editing session as finished (triggers notifications)"),
      },
    },
    guard(async ({ id, title, text, append, publish, done }) => {
      if (title === undefined && text === undefined && publish === undefined) {
        throw new Error("Nothing to update: pass title, text or publish.");
      }
      const { data } = await outline.post<Document>(
        "documents.update",
        stripUndefined({ id, title, text, append: text !== undefined ? append : undefined, publish, done }),
      );
      return ok(summarize(data));
    }),
  );

  server.registerTool(
    "move_document",
    {
      title: "Move document",
      description:
        "Move a document to another collection and/or under a different parent document. " +
        "Omit parentDocumentId to move it to the top level of the collection.",
      inputSchema: {
        id: z.string().describe("Document id"),
        collectionId: z.string().optional().describe("Target collection id"),
        parentDocumentId: z.string().optional().describe("Target parent document id"),
        index: z.number().int().min(0).optional().describe("Position among siblings"),
      },
    },
    guard(async ({ id, collectionId, parentDocumentId, index }) => {
      if (!collectionId && !parentDocumentId) {
        throw new Error("Pass collectionId and/or parentDocumentId.");
      }
      const { data } = await outline.post<{ documents?: Document[] }>(
        "documents.move",
        stripUndefined({ id, collectionId, parentDocumentId, index }),
      );
      return ok({ documents: (data.documents ?? []).map(summarize) });
    }),
  );

  server.registerTool(
    "archive_document",
    {
      title: "Archive document",
      description:
        "Archive a document (reversible; it disappears from the collection but can be restored from the archive). " +
        "Prefer this over delete_document.",
      inputSchema: { id: z.string().describe("Document id") },
    },
    guard(async ({ id }) => {
      const { data } = await outline.post<Document>("documents.archive", { id });
      return ok(summarize(data));
    }),
  );

  if (allowDelete) {
    server.registerTool(
      "delete_document",
      {
        title: "Delete document",
        description:
          "Move a document to the trash. Documents in the trash are permanently deleted after 30 days. " +
          "Only use when the user explicitly asks to delete; archive_document is the safer alternative.",
        inputSchema: {
          id: z.string().describe("Document id"),
          permanent: z.boolean().default(false).describe("Permanently delete instead of trashing (irreversible)"),
        },
      },
      guard(async ({ id, permanent }) => {
        await outline.post("documents.delete", { id, permanent });
        return ok({ deleted: id, permanent });
      }),
    );
  }
}
