// The admin pages, as tabs under each one's title. The account menu's Admin group is how an
// administrator reaches the first; these move between them.

import { Tabs } from './ui'
import common from '../../copy/common.json'

const A = common.admin

const PAGES = [
  { key: 'seasons', label: A.tabSeasons, to: '/admin/seasons' },
  { key: 'runners', label: A.tabRunners, to: '/admin/runners' },
  { key: 'users', label: A.tabUsers, to: '/admin/users' },
]

export function AdminTabs({ current }: { current: 'seasons' | 'runners' | 'users' }) {
  return (
    <div style={{ marginTop: 14 }}>
      <Tabs label={A.tabs} current={current} items={PAGES} />
    </div>
  )
}
