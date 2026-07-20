import { Link, useNavigate } from "react-router"

import { authClient } from "../lib/auth-client"

function NavBar() {
  const navigate = useNavigate()
  const { data: session } = authClient.useSession()

  async function handleSignOut() {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => navigate("/login", { replace: true }),
      },
    })
  }

  return (
    <nav className="sticky top-0 z-10 flex items-center justify-between bg-slate-900 px-6 py-4 shadow-md">
      <Link
        to="/"
        className="flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500 text-sm font-bold text-white">
          H
        </span>
        <span className="text-lg font-semibold tracking-tight text-white">
          Helpdesk
        </span>
      </Link>
      <div className="flex items-center gap-4">
        {session?.user.role === "admin" && (
          <Link
            to="/users"
            className="text-sm font-medium text-slate-300 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
          >
            Users
          </Link>
        )}
        <span className="text-sm text-slate-300">{session?.user.name}</span>
        <button
          type="button"
          onClick={handleSignOut}
          className="rounded-md border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
        >
          Sign out
        </button>
      </div>
    </nav>
  )
}

export default NavBar
