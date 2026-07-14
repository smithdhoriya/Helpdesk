import { createAuthClient } from "better-auth/react"
import { inferAdditionalFields } from "better-auth/client/plugins"

export const authClient = createAuthClient({
  baseURL: "http://localhost:4000",
  plugins: [
    inferAdditionalFields({
      user: {
        role: { type: ["admin", "agent"] },
      },
    }),
  ],
})
