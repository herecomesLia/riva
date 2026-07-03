import type { CurrentRole } from '../../types/dashboard'

type CurrentRoleCardProps = {
  role: CurrentRole
}

export function CurrentRoleCard({ role }: CurrentRoleCardProps) {
  return (
    <section className="panel panel--role" id="roles" aria-labelledby="role-card-title">
      <div className="panel__header">
        <div>
          <p className="eyebrow">目标岗位</p>
          <h2 id="role-card-title">
            {role.title} · {role.company}
          </h2>
        </div>
        <span className="status-pill">{role.status}</span>
      </div>
      <p className="panel__copy">{role.summary}</p>
      <div className="keyword-list" aria-label="岗位高频关键词">
        {role.keywords.map((keyword) => (
          <span className="jd-tag" key={keyword}>
            {keyword}
          </span>
        ))}
      </div>
      <div className="role-readiness">
        {role.readiness.map((item) => (
          <div key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
    </section>
  )
}
