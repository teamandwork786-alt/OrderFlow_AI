import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { useCurrentUser, useSignOut } from "../controller/auth.js";
import {
  NoAccessPage,
  OrdersPlaceholder,
  RootLanding,
  ShopPlaceholder
} from "./landing-pages.js";
import { SignInPage } from "./sign-in-page.js";

function AuthenticatedRoute({
  children
}: {
  children: (
    user: NonNullable<ReturnType<typeof useCurrentUser>["data"]>
  ) => ReactNode;
}) {
  const query = useCurrentUser();
  if (query.isPending) {
    return (
      <p className="page-status" role="status">
        Checking your sign-in status…
      </p>
    );
  }
  if (query.isError && !query.data && isUnauthenticated(query.error)) {
    return <Navigate to="/sign-in" replace />;
  }
  if (query.isError && !query.data) {
    return (
      <p className="page-status" role="alert">
        Sign-in status could not be checked. Refresh the page to try again.
      </p>
    );
  }
  if (!query.data) return <Navigate to="/sign-in" replace />;
  return (
    <>
      {query.isRefetchError && (
        <p className="page-status" role="status">
          Showing the last confirmed sign-in state. The latest refresh failed.
        </p>
      )}
      {children(query.data)}
    </>
  );
}

function SignedInNavigation() {
  const query = useCurrentUser();
  const signOut = useSignOut();
  if (!query.data) return null;

  return (
    <nav className="topbar" aria-label="Account">
      <span>{query.data.name}</span>
      <button
        className="text-button"
        type="button"
        onClick={() => signOut.mutate()}
        disabled={signOut.isPending}
      >
        {signOut.isPending ? "Signing out…" : "Sign out"}
      </button>
      {signOut.isError && <span role="alert">Sign-out failed. Try again.</span>}
    </nav>
  );
}

function RoutedApp() {
  return (
    <>
      <SignedInNavigation />
      <Routes>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route
          path="/"
          element={
            <AuthenticatedRoute>
              {(user) => <RootLanding user={user} />}
            </AuthenticatedRoute>
          }
        />
        <Route
          path="/shop"
          element={
            <AuthenticatedRoute>
              {(user) => <ShopPlaceholder user={user} />}
            </AuthenticatedRoute>
          }
        />
        <Route
          path="/orders"
          element={
            <AuthenticatedRoute>
              {(user) => <OrdersPlaceholder user={user} />}
            </AuthenticatedRoute>
          }
        />
        <Route path="/no-access" element={<NoAccessPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

function isUnauthenticated(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    error.status === 401
  );
}

export function App() {
  return (
    <BrowserRouter>
      <RoutedApp />
    </BrowserRouter>
  );
}
