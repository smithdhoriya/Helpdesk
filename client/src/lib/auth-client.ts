import { createAuthClient } from "better-auth/react"
import { inferAdditionalFields } from "better-auth/client/plugins"

import { UserRole } from "@/lib/users"

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:4000",
  plugins: [
    inferAdditionalFields({
      user: {
        role: { type: Object.values(UserRole) },
      },
    }),
  ],
})
