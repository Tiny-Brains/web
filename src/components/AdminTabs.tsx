// The admin pages, as tabs under each one's title. The account menu's Admin group is how an
// administrator reaches the first; these move between them.

import { Tabs } from './ui'

const PAGES = [
  { key: 'seasons', label: 'Seasons', to: '/admin/seasons' },
  { key: 'runners', label: 'Runners', to: '/admin/runners' },
  { key: 'users', label: 'Users', to: '/admin/users' },
]

export function AdminTabs({ current }: { current: 'seasons' | 'runners' | 'users' }) {
  return (
    <div style={{ marginTop: 14 }}>
      <Tabs label="Admin pages" current={current} items={PAGES} />
    </div>
  )
}
