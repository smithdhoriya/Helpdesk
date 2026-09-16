import { LayoutDashboard, Moon, Sun, Ticket, Users as UsersIcon } from "lucide-react"
import { Link, NavLink, useNavigate } from "react-router"

import { authClient } from "../lib/auth-client"
import { Theme, useTheme } from "../lib/theme"
import { UserRole } from "../lib/users"
import { cn } from "@/lib/utils"

const navLinkClassName = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    isActive
      ? "bg-primary/10 text-primary"
      : "text-muted-foreground hover:bg-muted hover:text-foreground"
  )

function NavBar() {
  const navigate = useNavigate()
  const { data: session } = authClient.useSession()
  const { theme, toggleTheme } = useTheme()

  async function handleSignOut() {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => navigate("/login", { replace: true }),
      },
    })
  }

  return (
    <nav className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-6 py-3">
      <div className="flex items-center gap-6">
        <Link
          to="/"
          className="flex items-center gap-2.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
            H
          </span>
          <span className="text-lg font-semibold tracking-tight text-foreground">
            Helpdesk
          </span>
        </Link>

        <div className="flex items-center gap-1">
          <NavLink to="/" end className={navLinkClassName}>
            <LayoutDashboard aria-hidden="true" className="size-4" />
            Dashboard
          </NavLink>
          <NavLink to="/tickets" className={navLinkClassName}>
            <Ticket aria-hidden="true" className="size-4" />
            Tickets
          </NavLink>
          {session?.user.role === UserRole.admin && (
            <NavLink to="/users" className={navLinkClassName}>
              <UsersIcon aria-hidden="true" className="size-4" />
              Users
            </NavLink>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={
            theme === Theme.dark ? "Switch to light theme" : "Switch to dark theme"
          }
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {theme === Theme.dark ? (
            <Sun aria-hidden="true" className="size-4" />
          ) : (
            <Moon aria-hidden="true" className="size-4" />
          )}
        </button>

        <span className="border-l border-border pl-3 text-sm text-muted-foreground">
          {session?.user.name}
        </span>

        <button
          type="button"
          onClick={handleSignOut}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Sign out
        </button>
      </div>
    </nav>
  )
}

export default NavBar
