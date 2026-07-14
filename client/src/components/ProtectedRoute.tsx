import { Navigate, Outlet } from "react-router"

import { authClient } from "../lib/auth-client"

function ProtectedRoute() {
  const { data: session, isPending } = authClient.useSession()

  if (isPending) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-gray-50 text-sm text-gray-500">
        <div
          role="status"
          aria-label="Loading"
          className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600"
        />
        Loading...
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}

export default ProtectedRoute
