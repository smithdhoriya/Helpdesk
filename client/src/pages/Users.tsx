import { useQuery } from "@tanstack/react-query"

import CreateUserDialog from "@/components/CreateUserDialog"
import UsersTable from "@/components/UsersTable"
import { fetchUsers, usersQueryKey } from "@/lib/users"

function Users() {
  const {
    data: users,
    isPending,
    isError,
  } = useQuery({
    queryKey: usersQueryKey,
    queryFn: fetchUsers,
  })

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Users
        </h1>
        <CreateUserDialog />
      </div>

      <UsersTable users={users} isPending={isPending} isError={isError} />
    </div>
  )
}

export default Users
