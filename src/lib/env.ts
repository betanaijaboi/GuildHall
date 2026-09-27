export const env = {
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  github: {
    appId: process.env.GITHUB_APP_ID ?? "",
    appSlug: process.env.GITHUB_APP_SLUG ?? "",
    clientId: process.env.GITHUB_CLIENT_ID ?? "",
    clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET ?? "",
    privateKey: (process.env.GITHUB_APP_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
  },
};

export function githubConfigured(): boolean {
  const g = env.github;
  return Boolean(g.appId && g.clientId && g.clientSecret && g.privateKey);
}

export function devLoginEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.ENABLE_DEV_LOGIN === "true";
}

export function githubInstallUrl(): string | null {
  return env.github.appSlug ? `https://github.com/apps/${env.github.appSlug}/installations/new` : null;
}
