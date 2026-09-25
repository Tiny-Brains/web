// STUB: replaced by the page's implementation.

import { Shell } from '../components/Shell'
import { PageHeader } from '../components/ui'
import { AdminTabs } from '../components/AdminTabs'
import T from '../../copy/admin-user.json'

export default function UserDesk() {
  return (
    <Shell title={T.tab}>
      <PageHeader title={T.title} />
      <div className="wrap">
        <AdminTabs current="users" />
      </div>
    </Shell>
  )
}
