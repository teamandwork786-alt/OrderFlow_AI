import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation
} from "react-router-dom";
import type { ReactNode } from "react";
import { useCurrentUser } from "../controller/auth.js";
import {
  NoAccessPage,
  OrdersPlaceholder,
  RootLanding
} from "./landing-pages.js";
import { CartPage } from "./cart-page.js";
import { CheckoutPage } from "./checkout-page.js";
import { OrderDetailPage, MyOrdersPage } from "./my-orders-pages.js";
import { ShopPage } from "./shop-page.js";
import { AdminSignInPage } from "./admin-sign-in-page.js";
import { SignInPage } from "./sign-in-page.js";

function AuthenticatedRoute({
  children,
  signInPath = "/sign-in"
}: {
  signInPath?: string;
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
    return <Navigate to={signInPath} replace />;
  }
  if (query.isError && !query.data) {
    return (
      <p className="page-status" role="alert">
        Sign-in status could not be checked. Refresh the page to try again.
      </p>
    );
  }
  if (!query.data) return <Navigate to={signInPath} replace />;
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

/** A signed-in customer page; visitors are sent to sign in and then back. */
function CustomerRoute({ children }: { children: ReactNode }) {
  const location = useLocation();
  const returnTo = encodeURIComponent(`${location.pathname}${location.search}`);
  return (
    <AuthenticatedRoute signInPath={`/sign-in?return_to=${returnTo}`}>
      {(user) =>
        user.roles.includes("customer") ? (
          children
        ) : (
          <Navigate to="/no-access" replace />
        )
      }
    </AuthenticatedRoute>
  );
}

function RoutedApp() {
  return (
    <>
      <Routes>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/admin/sign-in" element={<AdminSignInPage />} />
        <Route
          path="/"
          element={
            <AuthenticatedRoute>
              {(user) => <RootLanding user={user} />}
            </AuthenticatedRoute>
          }
        />
        <Route path="/shop" element={<ShopPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route
          path="/checkout"
          element={
            <CustomerRoute>
              <CheckoutPage />
            </CustomerRoute>
          }
        />
        <Route
          path="/my-orders"
          element={
            <CustomerRoute>
              <MyOrdersPage />
            </CustomerRoute>
          }
        />
        <Route
          path="/my-orders/:orderNumber"
          element={
            <CustomerRoute>
              <OrderDetailPage />
            </CustomerRoute>
          }
        />
        <Route
          path="/orders"
          element={
            <AuthenticatedRoute signInPath="/admin/sign-in">
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
