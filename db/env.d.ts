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
    // Google Gemini API para assistente genérico.
    GEMINI_API_KEY?: string;
    // Power Automate connectors for the SharePoint spare workbook. The URLs
    // and token are secrets because trigger URLs can contain signatures.
    SPARES_SYNC_PUSH_URL?: string;
    SPARES_SYNC_PUSH_URL_ORIGINAL?: string;
    SPARES_SYNC_PULL_URL?: string;
    SPARES_SYNC_TOKEN?: string;
    // WhatsApp Cloud API. Nunca expor no cliente nem registrar em logs.
    WHATSAPP_VERIFY_TOKEN?: string;
    META_APP_SECRET?: string;
    WHATSAPP_ACCESS_TOKEN?: string;
    WHATSAPP_PHONE_NUMBER_ID?: string;
    // Non-official bridge (whatsapp-bridge/, Baileys) as an alternative to the
    // Meta Cloud API above — same phone number stays usable on the phone app.
    // When set, the send route uses the bridge instead of the Graph API.
    WHATSAPP_BRIDGE_URL?: string;
    WHATSAPP_BRIDGE_SECRET?: string;
    // Segunda conta ("Whatsapp Caju"): outra instância do bridge, com a sessão
    // de outro número. Sem estas, a conta aparece na tela como não configurada.
    WHATSAPP_BRIDGE_URL_CAJU?: string;
    WHATSAPP_BRIDGE_SECRET_CAJU?: string;
    // JSON [{ name, phone }] of people added to every new WhatsApp group
    // (lib/whatsapp-group-name.ts). Secret: the repository is public.
    WHATSAPP_GROUP_DEFAULT_PARTICIPANTS?: string;
    // Workers AI, usado para ler a RAT. `Ai` e um tipo global de
    // @cloudflare/workers-types: importar aqui transformaria este .d.ts em
    // modulo e quebraria a declaracao de namespace.
    AI: Ai;
    // Conta de serviço do Firebase (Console → Configurações do projeto →
    // Contas de serviço → Gerar nova chave privada), só para assinar o custom
    // token do login por PIN (lib/server/firebase-custom-token.ts). Sem isso,
    // /api/auth/pin/unlock responde 503 e o app continua funcionando por senha.
    FIREBASE_SERVICE_ACCOUNT_EMAIL?: string;
    FIREBASE_SERVICE_ACCOUNT_KEY?: string;
  }
}
