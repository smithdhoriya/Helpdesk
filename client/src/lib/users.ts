import { api } from "@/lib/api"

export type User = {
  id: string
  name: string
  email: string
  role: "admin" | "agent"
  createdAt: string
}

export type CreateUserInput = {
  name: string
  email: string
  password: string
}

export const usersQueryKey = ["users"] as const

export function fetchUsers() {
  return api.get<User[]>("/api/users").then((res) => res.data)
}

export function createUser(data: CreateUserInput) {
  return api.post<User>("/api/users", data).then((res) => res.data)
}
