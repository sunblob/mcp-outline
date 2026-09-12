import * as p from "@clack/prompts";
import { saveConfig, deleteConfig, configPath, readConfigFile, PACKAGE_NAME, type StoredConfig } from "./config.js";
import { authInfo } from "./client.js";
import { clientSnippets, ENV_URL, ENV_TOKEN, type MissingEnv } from "./snippets.js";

function abort(): never {
  p.cancel("Setup aborted.");
  process.exit(1);
}

function printSnippets(missing: MissingEnv): void {
  for (const s of clientSnippets(missing)) p.note(s.body, s.title);
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

  if (Object.keys(missing).length > 0) {
    p.log.warn(
      `Still needed: ${Object.keys(missing).join(", ")}. Add them to the env block below, or run setup again.`,
    );
  }
  printSnippets(missing);
  p.outro(`Saved to ${file}`);
}
