import { useNavigate } from "react-router"

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
    <nav className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
      <span className="text-lg font-semibold text-gray-900">Helpdesk</span>
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-700">{session?.user.name}</span>
        <button
          type="button"
          onClick={handleSignOut}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Sign out
        </button>
      </div>
    </nav>
  )
}

export default NavBar
