declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    JIRA_BASE_URL: string;
    JIRA_EMAIL: string;
    JIRA_API_TOKEN: string;
    JIRA_PROJECT_KEY: string;
  }
}
