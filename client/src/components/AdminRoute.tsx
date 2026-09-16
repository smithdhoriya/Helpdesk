import { Navigate, Outlet } from "react-router"

import { authClient } from "../lib/auth-client"
import { UserRole } from "../lib/users"

function AdminRoute() {
  const { data: session, isPending } = authClient.useSession()

  if (isPending) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background text-sm text-muted-foreground">
        <div
          role="status"
          aria-label="Loading"
          className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary"
        />
        Loading...
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  if (session.user.role !== UserRole.admin) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}

export default AdminRoute
