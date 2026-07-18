import { useQuery } from "@tanstack/react-query"

import { api } from "@/lib/api"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type User = {
  id: string
  name: string
  email: string
  role: "admin" | "agent"
  createdAt: string
}

function Users() {
  const {
    data: users,
    isPending,
    isError,
  } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<User[]>("/api/users").then((res) => res.data),
  })

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
        Users
      </h1>

      <div className="mt-6 rounded-lg border border-gray-200 bg-white shadow-sm">
        {isError && (
          <p className="p-6 text-sm text-red-600">Failed to load users</p>
        )}

        {isPending && (
          <p className="p-6 text-sm text-gray-600">Loading users...</p>
        )}

        {users && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell className="capitalize">{user.role}</TableCell>
                  <TableCell>
                    {new Date(user.createdAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}

export default Users
