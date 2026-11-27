import { Navigate } from "react-router-dom";
import type { CurrentUser } from "../model/api-client.js";

export function RootLanding({ user }: { user: CurrentUser }) {
  return <Navigate to={user.landing_path} replace />;
}

export function ShopPlaceholder({ user }: { user: CurrentUser }) {
  if (!user.roles.includes("customer"))
    return <Navigate to="/no-access" replace />;
  return (
    <WorkspacePage
      title="Shop"
      user={user}
      message="The storefront arrives in a later slice."
    />
  );
}

export function OrdersPlaceholder({ user }: { user: CurrentUser }) {
  if (user.roles.includes("customer"))
    return <Navigate to="/no-access" replace />;
  return (
    <WorkspacePage
      title="Orders"
      user={user}
      message="Workspace arrives in a later slice"
    />
  );
}

export function NoAccessPage() {
  return (
    <main className="card">
      <p className="eyebrow">OrderFlow AI</p>
      <h1>No access</h1>
      <p>Your account does not have permission to open this page.</p>
      <a href="/">Return to your workspace</a>
    </main>
  );
}

function WorkspacePage({
  title,
  user,
  message
}: {
  title: string;
  user: CurrentUser;
  message: string;
}) {
  return (
    <main className="card workspace-card">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">OrderFlow AI</p>
          <h1>{title}</h1>
        </div>
        <p className="account-name">Signed in as {user.name}</p>
      </header>
      <p className="status-message" role="status">
        {message}
      </p>
    </main>
  );
}
