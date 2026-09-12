// Spawns the built server over stdio with fake credentials and checks the tool list + delete gating.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const entry = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist", "index.js");

const rpc = (id, method, params = {}) => JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";

async function listTools(env) {
  const child = spawn(process.execPath, [entry], { env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.stdin.write(
    rpc(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke", version: "0" } }),
  );
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
  child.stdin.write(rpc(2, "tools/list"));
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const line = out.split("\n").find((l) => l.includes('"id":2'));
    if (line) {
      child.kill();
      return JSON.parse(line).result.tools.map((t) => t.name).sort();
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  child.kill();
  throw new Error("timed out waiting for tools/list; stdout was: " + out);
}

const base = { OUTLINE_URL: "http://127.0.0.1:9", OUTLINE_API_TOKEN: "fake" };

const tools = await listTools({ ...base, OUTLINE_ALLOW_DELETE: "" });
assert.deepEqual(tools, [
  "archive_document",
  "create_document",
  "get_collection",
  "get_document",
  "list_collections",
  "list_documents",
  "move_document",
  "search_documents",
  "update_document",
]);

const withDelete = await listTools({ ...base, OUTLINE_ALLOW_DELETE: "true" });
assert.ok(withDelete.includes("delete_document"), "delete_document should appear with OUTLINE_ALLOW_DELETE=true");

console.log(`ok - ${tools.length} tools listed, delete gating works`);
