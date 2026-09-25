// The admin desk's tab row, under each admin page's title: ten pages in one row, which scrolls on a
// narrow window. The guide's Admin desk line and the account menu land on the first.

import { Tabs } from './ui'
import common from '../../copy/common.json'

const A = common.admin

const PAGES = [
  { key: 'seasons', label: A.tabSeasons, to: '/admin/seasons' },
  { key: 'runners', label: A.tabRunners, to: '/admin/runners' },
  { key: 'users', label: A.tabUsers, to: '/admin/users' },
  { key: 'comments', label: A.tabComments, to: '/admin/comments' },
  { key: 'announcements', label: A.tabAnnouncements, to: '/admin/announcements' },
  { key: 'notify', label: A.tabNotify, to: '/admin/notify' },
  { key: 'posts', label: A.tabPosts, to: '/admin/posts' },
  { key: 'stories', label: A.tabStories, to: '/admin/stories' },
  { key: 'picks', label: A.tabPicks, to: '/admin/picks' },
  { key: 'audit', label: A.tabAudit, to: '/admin/audit' },
] as const

export type AdminPage = (typeof PAGES)[number]['key']

export function AdminTabs({ current }: { current: AdminPage }) {
  return (
    <div className="admin-tabs">
      <Tabs label={A.tabs} current={current} items={[...PAGES]} />
    </div>
  )
}
