/**
 * Thin wrapper around the Outline API.
 * Every endpoint is `POST <baseUrl>/api/<endpoint>` with a JSON body.
 */

export interface OutlineResponse<T> {
  data: T;
  pagination?: { limit: number; offset: number; nextPath?: string };
  policies?: unknown[];
}

export interface OutlineClient {
  baseUrl: string;
  post<T = unknown>(endpoint: string, body?: Record<string, unknown>): Promise<OutlineResponse<T>>;
}

export function makeClient(baseUrl: string, token: string): OutlineClient {
  const base = baseUrl.replace(/\/+$/, "");

  async function post<T>(endpoint: string, body: Record<string, unknown> = {}): Promise<OutlineResponse<T>> {
    const url = `${base}/api/${endpoint}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new Error(`POST ${endpoint} failed: ${(err as Error).message}`);
    }
    if (!res.ok) {
      const text = await res.text();
      let detail = text;
      try {
        const json = JSON.parse(text) as { message?: string; error?: string };
        detail = json.message || json.error || text;
      } catch {
        /* keep raw text */
      }
      throw new Error(`POST ${endpoint} → ${res.status}: ${detail}`);
    }
    return (await res.json()) as OutlineResponse<T>;
  }

  return { post, baseUrl: base };
}

export interface AuthInfo {
  user?: { id: string; name?: string; email?: string };
  team?: { id: string; name?: string; url?: string };
}

/** Cheap authenticated call used by `setup` to validate URL + token. */
export async function authInfo(baseUrl: string, token: string): Promise<AuthInfo> {
  const { post } = makeClient(baseUrl, token);
  const { data } = await post<AuthInfo>("auth.info");
  return data;
}
