import { useEffect, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { useNavigate } from "react-router"
import { z } from "zod"

import { authClient } from "../lib/auth-client"

const loginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Invalid email"),
  password: z.string().min(1, "Password is required"),
})

type LoginForm = z.infer<typeof loginSchema>

function Login() {
  const navigate = useNavigate()
  const { data: session } = authClient.useSession()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })

  // signIn.email() resolving doesn't mean useSession()'s store has picked up
  // the new session yet (it refetches in the background), so redirect
  // reactively once the session actually shows up rather than right after submit.
  useEffect(() => {
    if (session) navigate("/", { replace: true })
  }, [session, navigate])

  async function onSubmit(data: LoginForm) {
    setError(null)

    const { error } = await authClient.signIn.email(data)

    if (error) {
      setError(error.message ?? "Failed to sign in")
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 shadow-md">
        <div className="mb-6 flex flex-col items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-500 text-base font-bold text-white">
            H
          </span>
          <h1 className="text-center text-2xl font-semibold tracking-tight text-gray-900">
            Helpdesk Login
          </h1>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              {...register("email")}
              className={`w-full rounded-md border px-3 py-2 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${
                errors.email
                  ? "border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500"
                  : "border-gray-300 focus-visible:border-blue-500 focus-visible:ring-blue-500"
              }`}
            />
            {errors.email && (
              <p className="mt-1 text-sm text-red-600">
                {errors.email.message}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              {...register("password")}
              className={`w-full rounded-md border px-3 py-2 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${
                errors.password
                  ? "border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500"
                  : "border-gray-300 focus-visible:border-blue-500 focus-visible:ring-blue-500"
              }`}
            />
            {errors.password && (
              <p className="mt-1 text-sm text-red-600">
                {errors.password.message}
              </p>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50"
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  )
}

export default Login
