import type { MockAccount, Portal } from "./accounts.js";

interface LoginPageOptions {
  portal: Portal;
  accounts: MockAccount[];
  interactionUrl: string;
  mode?: LoginMode | undefined;
  error?: string | undefined;
}

export type LoginMode = "sign-in" | "sign-up";

const themes = {
  customer: {
    title: "Ghar ki Ronak — Customer Account Sign-In",
    brand: "Ghar ki Ronak",
    mark: "G",
    page: "#faf8f5",
    accent: "#b4532a",
    accentStrong: "#8f3f1d",
    tint: "#fbefe7",
    line: "#e4e0d8",
    header: "#ffffff",
    headerInk: "#8f3f1d",
    markBg: "#b4532a",
    brandFont: 'Georgia, "Times New Roman", serif'
  },
  staff: {
    title: "OrderFlow Operations — Internal Identity Sign-In",
    brand: "OrderFlow Operations",
    mark: "O",
    page: "#f1f5f8",
    accent: "#0e5f78",
    accentStrong: "#0a4a5e",
    tint: "#e6f3f7",
    line: "#d6e0e7",
    header: "#123447",
    headerInk: "#ffffff",
    markBg: "#1d7f9d",
    brandFont: "inherit"
  }
} as const;

/**
 * The customer page must never contain staff account names or wording, so the
 * copy and the account list depend only on the portal. The caller supplies the
 * accounts already filtered for that portal.
 */
export function renderLoginPage({
  portal,
  accounts,
  interactionUrl,
  mode,
  error
}: LoginPageOptions): string {
  const theme = themes[portal];
  const pageTitle =
    portal === "customer" && mode === "sign-up"
      ? "Ghar ki Ronak — Create a Customer Account"
      : theme.title;
  const errorMessage = error
    ? `<p class="error" role="alert">${escapeHtml(error)}</p>`
    : "";
  const showSignIn = portal === "staff" || mode !== "sign-up";
  const showCreateAccount = portal === "customer" && mode !== "sign-in";

  const staffAccounts = accounts.filter((account) => account.kind === "staff");
  const customerAccounts = accounts.filter(
    (account) => account.kind === "customer"
  );
  const options =
    portal === "staff"
      ? `${optionGroup("Staff and administrators", staffAccounts)}${optionGroup("Customer accounts", customerAccounts)}`
      : customerAccounts.map(optionTag).join("");

  const createAccount = showCreateAccount
    ? `
      <section class="section" aria-labelledby="create-account-heading">
        <h2 id="create-account-heading">Create a Customer Account</h2>
        <form method="post" action="${escapeHtml(`${interactionUrl}/create-account`)}">
          <label for="new-name">Name</label>
          <input id="new-name" name="name" autocomplete="name" required maxlength="200">
          <label for="new-email">Email</label>
          <input id="new-email" name="email" type="email" autocomplete="email" required maxlength="320">
          <label for="new-password">Password</label>
          <input id="new-password" name="password" type="password" autocomplete="new-password" required minlength="6">
          <button class="secondary" type="submit">Create account</button>
        </form>
      </section>`
    : "";

  const intro =
    portal === "staff"
      ? "Choose a demo account to sign in to the operations workspace."
      : mode === "sign-in"
        ? "Sign in with your customer account."
        : mode === "sign-up"
          ? "Create your customer account to continue."
          : "Choose a demo customer account to continue, or create a new one.";
  const signInForm = showSignIn
    ? `
        <form method="post" action="${escapeHtml(`${interactionUrl}/login`)}">
          <label for="account_id">Demo account</label>
          <select id="account_id" name="account_id">${options}</select>
          <label for="password">Password</label>
          <input id="password" name="password" type="password" autocomplete="current-password" required>
          <button type="submit">Sign in</button>
        </form>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>${escapeHtml(pageTitle)}</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; color: #1f2933; background: ${theme.page};
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      header { background: ${theme.header}; border-bottom: 1px solid ${theme.line}; }
      .bar { display: flex; align-items: center; gap: 0.65rem; width: min(100% - 2rem, 64rem);
        min-height: 4rem; margin: 0 auto; color: ${theme.headerInk}; font-weight: 700;
        font-size: 1.2rem; font-family: ${theme.brandFont}; }
      .mark { display: inline-grid; place-items: center; width: 2.2rem; height: 2.2rem;
        border-radius: 0.6rem; color: #fff; background: ${theme.markBg}; font-family: Georgia, serif; }
      main { display: grid; place-items: start center; padding: clamp(2rem, 8vw, 5rem) 1rem; }
      .card { width: min(100%, 28rem); padding: clamp(1.5rem, 5vw, 2.5rem); border: 1px solid ${theme.line};
        border-radius: 1rem; background: #fff; box-shadow: 0 1rem 2.5rem rgb(31 41 51 / 7%); }
      h1 { margin: 0 0 0.75rem; font-size: clamp(1.4rem, 4.5vw, 1.75rem); line-height: 1.25; }
      h2 { margin: 0 0 0.75rem; font-size: 1.1rem; }
      p { margin: 0 0 1.25rem; color: #52606d; line-height: 1.55; }
      label { display: block; margin: 1rem 0 0.35rem; font-size: 0.9rem; font-weight: 600; }
      select, input { width: 100%; min-height: 2.75rem; padding: 0.5rem 0.75rem; border: 1.5px solid ${theme.line};
        border-radius: 0.6rem; background: #fff; color: inherit; font: inherit; }
      button { width: 100%; min-height: 2.75rem; margin-top: 1.25rem; padding: 0.6rem 1.25rem;
        border: 1.5px solid ${theme.accent}; border-radius: 0.6rem; color: #fff; background: ${theme.accent};
        font: inherit; font-weight: 650; cursor: pointer; }
      button:hover { background: ${theme.accentStrong}; border-color: ${theme.accentStrong}; }
      button.secondary { color: ${theme.accentStrong}; background: #fff; }
      button.secondary:hover { color: #fff; }
      .section { margin-top: 1.75rem; padding-top: 1.5rem; border-top: 1px solid ${theme.line}; }
      .error { padding: 0.75rem 1rem; border-left: 0.3rem solid #b42318; border-radius: 0.25rem; color: #7a271a; background: #fef3f2; }
      :focus-visible { outline: 3px solid #1d4ed8; outline-offset: 2px; }
    </style>
  </head>
  <body>
    <header><div class="bar"><span class="mark" aria-hidden="true">${escapeHtml(theme.mark)}</span><span>${escapeHtml(theme.brand)}</span></div></header>
    <main>
      <div class="card">
        <h1>${escapeHtml(pageTitle)}</h1>
        <p>${escapeHtml(intro)}</p>
        ${errorMessage}
        ${signInForm}${createAccount}
      </div>
    </main>
  </body>
</html>`;
}

function optionTag(account: MockAccount): string {
  return `<option value="${escapeHtml(account.subject)}">${escapeHtml(account.name)}</option>`;
}

function optionGroup(label: string, accounts: MockAccount[]): string {
  if (accounts.length === 0) return "";
  return `<optgroup label="${escapeHtml(label)}">${accounts.map(optionTag).join("")}</optgroup>`;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
