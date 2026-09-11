declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    JIRA_BASE_URL: string;
    JIRA_EMAIL: string;
    JIRA_API_TOKEN: string;
    JIRA_PROJECT_KEY: string;
    // Cloudflare Realtime TURN. Optional: when unset the voice client falls
    // back to STUN only, which still works outside symmetric NAT.
    TURN_KEY_ID?: string;
    TURN_KEY_API_TOKEN?: string;
    // Shared secret so only the scheduled handler can trigger the task sweep.
    CRON_SECRET?: string;
    // Power Automate connectors for the SharePoint spare workbook. The URLs
    // and token are secrets because trigger URLs can contain signatures.
    SPARES_SYNC_PUSH_URL?: string;
    SPARES_SYNC_PUSH_URL_ORIGINAL?: string;
    SPARES_SYNC_PULL_URL?: string;
    SPARES_SYNC_TOKEN?: string;
    // Workers AI, usado para ler a RAT. `Ai` e um tipo global de
    // @cloudflare/workers-types: importar aqui transformaria este .d.ts em
    // modulo e quebraria a declaracao de namespace.
    AI: Ai;
  }
}
