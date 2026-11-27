import { Link } from "react-router-dom";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

export function SignInPage() {
  const signInUrl = new URL("/api/v1/auth/oidc/sign-in", apiBaseUrl);
  signInUrl.searchParams.set("return_to", "/");

  return (
    <main className="card sign-in-card">
      <p className="eyebrow">OrderFlow AI</p>
      <h1>Sign in</h1>
      <p>Use your OrderFlow account to continue to the right workspace.</p>
      <a className="primary-button" href={signInUrl.toString()}>
        Sign in with OrderFlow
      </a>
      <p className="hint">
        For the local demo, the identity provider offers the seeded demo
        accounts.
      </p>
      <Link to="/no-access">Why can&apos;t I access a workspace?</Link>
    </main>
  );
}
