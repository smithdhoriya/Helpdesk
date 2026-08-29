import axios from "axios"

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000"

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
})

// Pull the server's `{ error: string }` message out of a failed request,
// falling back to a caller-supplied default. Use this in mutation catch
// blocks rather than re-checking `axios.isAxiosError` by hand.
export function getApiErrorMessage(error: unknown, fallback: string): string {
  const message = axios.isAxiosError(error)
    ? (error.response?.data as { error?: string } | undefined)?.error
    : undefined
  return message ?? fallback
}
