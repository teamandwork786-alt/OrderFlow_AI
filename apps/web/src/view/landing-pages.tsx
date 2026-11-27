import { Link, Navigate } from "react-router-dom";
import { useCurrentUser } from "../controller/auth.js";
import { usePageTitle } from "../controller/page.js";
import type { CurrentUser } from "../model/api-client.js";
import { PageFrame, type FrameVariant } from "./page-frame.js";

export function RootLanding({ user }: { user: CurrentUser }) {
  return <Navigate to={user.landing_path} replace />;
}

export function OrdersPlaceholder({ user }: { user: CurrentUser }) {
  usePageTitle("Orders · OrderFlow Operations");
  if (user.roles.includes("customer"))
    return <Navigate to="/no-access" replace />;
  return (
    <PageFrame variant="operations" user={user}>
      <WorkspaceCard
        title="Orders"
        user={user}
        message="Workspace arrives in a later slice"
      />
    </PageFrame>
  );
}

export function NoAccessPage() {
  usePageTitle("No access");
  const { data: user } = useCurrentUser();
  const isCustomerView = !user || user.roles.includes("customer");
  const variant: FrameVariant = isCustomerView ? "customer" : "operations";

  return (
    <PageFrame variant={variant} user={user}>
      <main className="auth-panel">
        <div className="auth-card">
          <p className="eyebrow">Access</p>
          <h1>No access</h1>
          <p className="lead">
            Your account does not have permission to open this page. Nothing was
            changed.
          </p>
          <Link
            className="button button-primary"
            to={isCustomerView ? "/shop" : "/orders"}
          >
            {isCustomerView ? "Back to the shop" : "Back to your workspace"}
          </Link>
        </div>
      </main>
    </PageFrame>
  );
}

function WorkspaceCard({
  title,
  user,
  message
}: {
  title: string;
  user: CurrentUser;
  message: string;
}) {
  return (
    <main className="content">
      <section className="card workspace-card">
        <header className="workspace-header">
          <h1>{title}</h1>
          <p className="account-name">Signed in as {user.name}</p>
        </header>
        <p className="status-message" role="status">
          {message}
        </p>
      </section>
    </main>
  );
}
