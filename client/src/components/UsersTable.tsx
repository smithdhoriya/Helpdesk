import { PencilIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DialogTrigger } from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import type { User } from "@/lib/users"

interface UsersTableProps {
  users: User[] | undefined
  isPending: boolean
  isError: boolean
  onEdit: (user: User) => void
}

function UsersTable({ users, isPending, isError, onEdit }: UsersTableProps) {
  return (
    <div className="mt-6 rounded-lg border border-gray-200 bg-white shadow-sm">
      {isError && (
        <p className="p-6 text-sm text-red-600">Failed to load users</p>
      )}

      {(isPending || users) && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-40" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-8" />
                  </TableCell>
                </TableRow>
              ))}

            {users?.map((user) => (
              <TableRow key={user.id}>
                <TableCell>{user.name}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell className="capitalize">{user.role}</TableCell>
                <TableCell>
                  {new Date(user.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <DialogTrigger
                    onClick={() => onEdit(user)}
                    render={<Button variant="ghost" size="icon-sm" />}
                  >
                    <PencilIcon />
                    <span className="sr-only">Edit {user.name}</span>
                  </DialogTrigger>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

export default UsersTable
