import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { useSignOut } from "../controller/auth.js";
import type { CurrentUser } from "../model/api-client.js";

export type FrameVariant = "customer" | "operations";

interface PageFrameProps {
  variant: FrameVariant;
  user?: CurrentUser | undefined;
  children: ReactNode;
}

const brand = {
  customer: { name: "Ghar ki Ronak", home: "/shop", mark: "G" },
  operations: { name: "OrderFlow Operations", home: "/orders", mark: "O" }
} as const;

export function PageFrame({ variant, user, children }: PageFrameProps) {
  const { name, home, mark } = brand[variant];
  return (
    <div className={`frame frame-${variant}`}>
      <header className="site-header">
        <div className="site-header-inner">
          {user ? (
            <Link className="brand" to={home}>
              <BrandMark mark={mark} />
              <span>{name}</span>
            </Link>
          ) : (
            <span className="brand">
              <BrandMark mark={mark} />
              <span>{name}</span>
            </span>
          )}
          {user && <AccountMenu user={user} />}
        </div>
      </header>
      <div className="frame-body">{children}</div>
      {variant === "customer" && (
        <footer className="site-footer">
          <p>© Ghar ki Ronak</p>
        </footer>
      )}
    </div>
  );
}

function BrandMark({ mark }: { mark: string }) {
  return (
    <span className="brand-mark" aria-hidden="true">
      {mark}
    </span>
  );
}

function AccountMenu({ user }: { user: CurrentUser }) {
  const signOut = useSignOut();
  return (
    <nav className="account-menu" aria-label="Account">
      <span className="account-menu-name">{user.name}</span>
      <button
        className="button button-outline"
        type="button"
        onClick={() => signOut.mutate()}
        disabled={signOut.isPending}
      >
        {signOut.isPending ? "Signing out…" : "Sign out"}
      </button>
      {signOut.isError && (
        <span className="form-error" role="alert">
          Sign-out failed. Try again.
        </span>
      )}
    </nav>
  );
}
