// Minimal Odoo JSON-RPC client (works with Odoo 12–18; Odoo 19+ still serves /jsonrpc but marks it deprecated).
// Use an API key as the password: Odoo → My Profile → Account Security → New API key.

export type OdooConfig = { url: string; db: string; user: string; password: string };
type Domain = unknown[];

export class Odoo {
  private uid = 0;
  private fieldCache = new Map<string, Set<string>>();
  constructor(private cfg: OdooConfig) { this.cfg.url = cfg.url.replace(/\/$/, ""); }

  private async rpc<T>(service: string, method: string, args: unknown[]): Promise<T> {
    const res = await fetch(`${this.cfg.url}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", id: Date.now(), params: { service, method, args } }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`Odoo HTTP ${res.status} (${service}.${method})`);
    const j = (await res.json()) as { result?: T; error?: { message: string; data?: { message?: string } } };
    if (j.error) throw new Error(`Odoo: ${j.error.data?.message ?? j.error.message}`);
    return j.result as T;
  }

  async login() {
    const uid = await this.rpc<number | false>("common", "login", [this.cfg.db, this.cfg.user, this.cfg.password]);
    if (!uid) throw new Error("Odoo login failed — check ODOO_DB, ODOO_USER and ODOO_PASSWORD (API key).");
    this.uid = uid;
    const v = await this.rpc<{ server_version: string }>("common", "version", []).catch(() => ({ server_version: "?" }));
    return { uid, version: v.server_version };
  }

  call<T>(model: string, method: string, args: unknown[], kw: Record<string, unknown> = {}) {
    return this.rpc<T>("object", "execute_kw", [this.cfg.db, this.uid, this.cfg.password, model, method, args, kw]);
  }

  /** does this model exist on the server (e.g. helpdesk.ticket is Enterprise-only)? */
  async hasModel(model: string) {
    const r = await this.call<number>("ir.model", "search_count", [[["model", "=", model]]]).catch(() => 0);
    return r > 0;
  }

  /** keep only the fields this Odoo version actually has (field names change between versions) */
  async fields(model: string, wanted: string[]) {
    let have = this.fieldCache.get(model);
    if (!have) {
      have = new Set(Object.keys(await this.call<Record<string, unknown>>(model, "fields_get", [], { attributes: ["type"] })));
      this.fieldCache.set(model, have);
    }
    return wanted.filter((f) => have!.has(f));
  }

  /** search_read in pages, including archived records */
  async *all<T = Record<string, unknown>>(model: string, domain: Domain, wanted: string[], batch = 400): AsyncGenerator<T[]> {
    const fields = await this.fields(model, wanted);
    for (let offset = 0; ; offset += batch) {
      const rows = await this.call<T[]>(model, "search_read", [domain], { fields, offset, limit: batch, order: "id asc", context: { active_test: false, lang: "en_US" } });
      if (!rows.length) return;
      yield rows;
      if (rows.length < batch) return;
    }
  }

  count(model: string, domain: Domain) {
    return this.call<number>(model, "search_count", [domain], { context: { active_test: false } });
  }
}
