import { Outlet } from "react-router"

import NavBar from "./NavBar"

function Layout() {
  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <Outlet />
    </div>
  )
}

export default Layout
