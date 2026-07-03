import type { RecentPractice } from '../../types/dashboard'

type RecentPracticeListProps = {
  records: RecentPractice[]
}

export function RecentPracticeList({ records }: RecentPracticeListProps) {
  return (
    <section className="panel" id="history" aria-labelledby="recent-practice-title">
      <div className="panel__header">
        <div>
          <p className="eyebrow">训练记录</p>
          <h2 id="recent-practice-title">最近练习</h2>
        </div>
        <button className="button button--ghost" type="button">
          查看全部
        </button>
      </div>
      {records.length > 0 ? (
        <div className="record-list">
          {records.map((record) => (
            <article className="record-item" key={record.id}>
              <div>
                <h3>{record.title}</h3>
                <p>{record.displayTime}</p>
              </div>
              <strong>{record.score.toFixed(1)}</strong>
            </article>
          ))}
        </div>
      ) : (
        <p className="panel__copy">暂无练习记录。</p>
      )}
    </section>
  )
}
