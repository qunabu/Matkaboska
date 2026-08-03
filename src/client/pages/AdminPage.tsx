import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi, authApi } from '../lib/api'
import pl from '../i18n/pl'

function relDate(unix: number | null): string {
  if (!unix) return '—'
  const days = Math.floor((Date.now() / 1000 - unix) / 86400)
  if (days <= 0) return pl.admin.today
  if (days === 1) return pl.admin.yesterday
  return pl.admin.daysAgo(days)
}

export default function AdminPage() {
  const qc = useQueryClient()
  const { data: me } = useQuery({ queryKey: ['auth'], queryFn: authApi.me, retry: false })
  const { data, isLoading, isError } = useQuery({ queryKey: ['admin-users'], queryFn: () => adminApi.users(), retry: false })

  const del = useMutation({
    mutationFn: (email: string) => adminApi.deleteUser(email),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
    onError: (e) => alert((e as Error).message),
  })

  if (me && me.isAdmin === false) {
    return (
      <div className="mx-auto max-w-2xl p-6 text-center">
        <p className="text-sm text-red-500">{pl.admin.forbidden}</p>
        {me?.email && <p className="mt-2 text-xs text-gray-400">{pl.admin.loggedInAs}: <span className="font-mono">{me.email}</span></p>}
        <p className="mt-1 text-xs text-gray-400">{pl.admin.adminHint}</p>
      </div>
    )
  }
  if (isError) {
    return <div className="mx-auto max-w-2xl p-6 text-center text-sm text-red-500">{pl.common.error}</div>
  }

  const users = data?.users ?? []
  const admins = new Set(data?.admins ?? [])

  return (
    <div className="mx-auto max-w-4xl p-4">
      <h1 className="mb-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{pl.admin.title}</h1>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">{pl.admin.subtitle(users.length)}</p>

      {isLoading ? (
        <p className="text-gray-500">{pl.common.loading}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400 dark:border-gray-700">
                <th className="px-3 py-2">{pl.admin.user}</th>
                <th className="px-2 py-2 text-center">{pl.admin.recipes}</th>
                <th className="px-2 py-2 text-center">{pl.admin.products}</th>
                <th className="px-2 py-2 text-center">{pl.admin.plan}</th>
                <th className="px-2 py-2 text-center">{pl.admin.log}</th>
                <th className="px-2 py-2 text-center">{pl.admin.devices}</th>
                <th className="px-2 py-2 text-center">{pl.admin.lastActive}</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {users.map((u) => {
                const isAdminRow = admins.has(u.email.toLowerCase())
                const isMe = me?.email?.toLowerCase() === u.email.toLowerCase()
                return (
                  <tr key={u.email} className="text-gray-700 dark:text-gray-300">
                    <td className="px-3 py-2">
                      <span className="font-medium text-gray-900 dark:text-gray-100">{u.email}</span>
                      {isAdminRow && <span className="ml-1.5 rounded bg-primary-100 px-1.5 py-0.5 text-[10px] font-semibold text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">admin</span>}
                      {isMe && <span className="ml-1.5 text-[10px] text-gray-400">({pl.admin.you})</span>}
                    </td>
                    <td className="px-2 py-2 text-center">{u.recipes}</td>
                    <td className="px-2 py-2 text-center">{u.products}</td>
                    <td className="px-2 py-2 text-center">{u.planEntries}</td>
                    <td className="px-2 py-2 text-center">{u.foodLogs}</td>
                    <td className="px-2 py-2 text-center">{u.pushDevices}</td>
                    <td className="px-2 py-2 text-center whitespace-nowrap text-xs text-gray-400">{relDate(u.lastLogAt)}</td>
                    <td className="px-2 py-2 text-right">
                      <button
                        onClick={() => {
                          if (window.confirm(pl.admin.confirmDelete(u.email))) del.mutate(u.email)
                        }}
                        disabled={del.isPending}
                        className="rounded-lg bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-40 dark:bg-red-900/20 dark:text-red-400"
                      >
                        🗑 {pl.admin.delete}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
