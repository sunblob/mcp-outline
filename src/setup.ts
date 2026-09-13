import * as p from "@clack/prompts";
import { saveConfig, deleteConfig, configPath, readConfigFile, PACKAGE_NAME, type StoredConfig } from "./config.js";
import { authInfo } from "./client.js";
import { clientSnippets, ENV_URL, ENV_TOKEN, SERVER_KEY, type MissingEnv } from "./snippets.js";
import { defaultSelection, detectClients, hasEntry, installClient, type ClientId } from "./install.js";

function abort(): never {
  p.cancel("Setup aborted.");
  process.exit(1);
}

/** Plain stdout, no box drawing, so the snippets can be selected and copied (or piped to a file). */
function printSnippets(missing: MissingEnv): void {
  for (const s of clientSnippets(missing)) {
    console.log(`\n# ${s.title}\n`);
    console.log(s.body);
  }
  console.log();
}

export async function runSetup(args: string[] = []): Promise<void> {
  if (args.includes("--reset")) {
    const removed = deleteConfig();
    console.log(removed ? `Removed ${configPath()}` : `Nothing to remove (${configPath()} does not exist)`);
    return;
  }

  const existing = readConfigFile() ?? {};

  if (args.includes("--print")) {
    const missing: MissingEnv = {};
    if (!existing.url) missing[ENV_URL] = "https://app.getoutline.com";
    if (!existing.token) missing[ENV_TOKEN] = "ol_api_...";
    printSnippets(missing);
    return;
  }

  p.intro(`${PACKAGE_NAME} setup`);
  p.log.info("Press Enter to skip any value. Skipped values can be supplied later via the env block of your MCP client config.");

  const answers = await p.group(
    {
      url: () =>
        p.text({
          message: `Outline URL (${ENV_URL})`,
          placeholder: "https://app.getoutline.com  — Enter to skip",
          initialValue: existing.url ?? "",
          validate: (v) => (!v || /^https?:\/\/\S+$/.test(v) ? undefined : "Must start with http:// or https://"),
        }),
      token: () =>
        p.password({
          message: `API token (${ENV_TOKEN}; Settings → API in Outline) — Enter to skip`,
          mask: "▪",
        }),
      defaultCollection: () =>
        p.text({
          message: "Default collection name (optional)",
          initialValue: existing.defaultCollection ?? "",
          defaultValue: "",
        }),
      allowDelete: () => p.confirm({ message: "Allow delete tools?", initialValue: Boolean(existing.allowDelete) }),
    },
    { onCancel: abort },
  );

  const url = (answers.url ?? "").trim().replace(/\/+$/, "") || undefined;
  const token = (answers.token ?? "").trim() || existing.token || undefined;

  if (url && token) {
    const s = p.spinner();
    s.start("Checking connection");
    try {
      const me = await authInfo(url, token);
      const who = me.user?.email ?? me.user?.name ?? "unknown user";
      s.stop(`ok (logged in as ${who} on ${me.team?.name ?? url})`);
    } catch (err) {
      s.stop("failed");
      p.cancel(`Could not authenticate: ${(err as Error).message}`);
      process.exit(1);
    }
  } else {
    p.log.warn("Skipping connection check because URL and/or token were not provided.");
  }

  const config: StoredConfig = {
    defaultCollection: (answers.defaultCollection ?? "").trim(),
    allowDelete: Boolean(answers.allowDelete),
  };
  if (url) config.url = url;
  if (token) config.token = token;
  const file = saveConfig(config);

  const missing: MissingEnv = {};
  if (!url) missing[ENV_URL] = "https://app.getoutline.com";
  if (!token) missing[ENV_TOKEN] = "ol_api_...";

  const updated = await addToClients(missing);

  if (Object.keys(missing).length > 0) {
    const where = updated ? "env block of the client config updated above" : "env block below";
    p.log.warn(`Still needed: ${Object.keys(missing).join(", ")}. Replace the placeholders in the ${where}, or run setup again.`);
  }
  p.outro(`Saved to ${file}`);
  if (updated) {
    console.log("Re-print MCP client config snippets any time with: setup --print");
    return;
  }
  console.log("Add one of these to your MCP client (plain text, safe to copy). Re-print any time with: setup --print");
  printSnippets(missing);
}

/** Offers to register the server in MCP clients. Returns true when at least one client was updated. */
async function addToClients(missing: MissingEnv): Promise<boolean> {
  const clients = detectClients();
  const selected = await p.multiselect<ClientId>({
    message: "Add to MCP clients? (Space to toggle, Enter to confirm, none to skip)",
    options: clients.map((c) => ({
      value: c.id,
      label: c.label,
      hint: [c.hint, c.detected ? "detected" : "not found"].filter(Boolean).join(" — "),
    })),
    initialValues: defaultSelection(clients),
    required: false,
  });
  if (typeof selected === "symbol") abort();

  let updated = false;
  for (const client of clients.filter((c) => selected.includes(c.id))) {
    try {
      if (hasEntry(client.id)) {
        const replace = await p.confirm({
          message: `${client.label} already has a "${SERVER_KEY}" server. Replace it?`,
          initialValue: false,
        });
        if (typeof replace === "symbol") abort();
        if (!replace) {
          p.log.info(`${client.label}: skipped, existing entry kept`);
          continue;
        }
      }
      const result = installClient(client.id, missing);
      const restart = client.id === "claude-desktop" ? " — restart Claude Desktop to load it" : "";
      p.log.success(`${client.label}: ${result.status} (${result.location})${restart}`);
      updated = true;
    } catch (err) {
      p.log.error(`${client.label}: failed — ${(err as Error).message}`);
    }
  }
  return updated;
}
