import { api } from "@/lib/api"

export const UserRole = {
  admin: "admin",
  agent: "agent",
} as const

export type UserRole = (typeof UserRole)[keyof typeof UserRole]

export type User = {
  id: string
  name: string
  email: string
  role: UserRole
  createdAt: string
}

export type CreateUserInput = {
  name: string
  email: string
  password: string
}

export type UpdateUserInput = {
  name: string
  email: string
  password?: string
}

export const usersQueryKey = ["users"] as const

export function fetchUsers() {
  return api.get<User[]>("/api/users").then((res) => res.data)
}

export function createUser(data: CreateUserInput) {
  return api.post<User>("/api/users", data).then((res) => res.data)
}

export function updateUser(id: string, data: UpdateUserInput) {
  return api.patch<User>(`/api/users/${id}`, data).then((res) => res.data)
}

export function deleteUser(id: string) {
  return api.delete(`/api/users/${id}`)
}
