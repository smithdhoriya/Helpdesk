import { useState } from "react"
import { useQuery } from "@tanstack/react-query"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import DeleteUserDialog from "@/components/DeleteUserDialog"
import UserForm from "@/components/UserForm"
import UsersTable from "@/components/UsersTable"
import { fetchUsers, usersQueryKey, type User } from "@/lib/users"

function Users() {
  const {
    data: users,
    isPending,
    isError,
  } = useQuery({
    queryKey: usersQueryKey,
    queryFn: fetchUsers,
  })

  const [dialogTarget, setDialogTarget] = useState<User | "new" | null>(null)
  const editingUser = dialogTarget && dialogTarget !== "new" ? dialogTarget : null

  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)

  return (
    <>
      <Dialog
        open={dialogTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDialogTarget(null)
        }}
      >
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
              Users
            </h1>
            <DialogTrigger onClick={() => setDialogTarget("new")} render={<Button />}>
              Create User
            </DialogTrigger>
          </div>

          <UsersTable
            users={users}
            isPending={isPending}
            isError={isError}
            onEdit={setDialogTarget}
            onDelete={setDeleteTarget}
          />
        </div>

        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUser ? "Edit User" : "Create User"}</DialogTitle>
            <DialogDescription>
              {editingUser
                ? `Update ${editingUser.name}'s account details.`
                : "Add a new agent to the helpdesk."}
            </DialogDescription>
          </DialogHeader>

          <UserForm
            user={editingUser ?? undefined}
            onSuccess={() => setDialogTarget(null)}
          />
        </DialogContent>
      </Dialog>

      <DeleteUserDialog
        user={deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      />
    </>
  )
}

export default Users
