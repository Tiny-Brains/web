// STUB: replaced by the page's implementation.

import { Shell } from '../components/Shell'
import { PageHeader } from '../components/ui'
import { AdminTabs } from '../components/AdminTabs'
import T from '../../copy/admin-posts.json'

export default function PostsAdmin() {
  return (
    <Shell title={T.tab}>
      <PageHeader title={T.title} />
      <div className="wrap">
        <AdminTabs current="posts" />
      </div>
    </Shell>
  )
}
