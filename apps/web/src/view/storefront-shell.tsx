import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useCurrentUser, useSignOut } from "../controller/auth.js";
import { useCart } from "../controller/cart-store.js";
import { BagDrawer } from "./bag-drawer.js";
import { BotanicalMark } from "./storefront-art.js";

/** Common frame for every customer page: header, bag, account, footer. */
export function StorefrontShell({ children }: { children: ReactNode }) {
  const { data: user } = useCurrentUser();
  const signOut = useSignOut();
  const cart = useCart();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="sf">
      <header className="sf-header">
        <div className="sf-header-inner">
          <Link className="sf-brand" to="/shop">
            <BotanicalMark />
            <span>Ghar ki Ronak</span>
          </Link>
          <nav className="sf-nav" aria-label="Shop">
            <Link to="/shop">Shop</Link>
            <Link to="/my-orders">My orders</Link>
          </nav>
          <div className="sf-actions">
            <button
              type="button"
              className="sf-bag-button"
              aria-haspopup="dialog"
              onClick={() => setDrawerOpen(true)}
            >
              Bag ({cart.count})
            </button>
            {user ? (
              <>
                <span className="sf-account">Signed in as {user.name}</span>
                <button
                  type="button"
                  className="sf-link-button"
                  onClick={() => signOut.mutate()}
                  disabled={signOut.isPending}
                >
                  {signOut.isPending ? "Signing out…" : "Sign out"}
                </button>
              </>
            ) : (
              <Link className="sf-link-button" to="/sign-in">
                Sign in
              </Link>
            )}
          </div>
        </div>
        {signOut.isError && (
          <p className="form-error sf-wrap" role="alert">
            Sign-out failed. Try again.
          </p>
        )}
      </header>
      {drawerOpen && <BagDrawer onClose={() => setDrawerOpen(false)} />}
      <div className="sf-body">{children}</div>
      <footer className="sf-footer">
        <p>© Ghar ki Ronak · Considered pieces for the home</p>
      </footer>
    </div>
  );
}
