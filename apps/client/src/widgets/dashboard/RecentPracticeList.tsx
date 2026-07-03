const records = [
  { title: '项目深挖 · 增长实验复盘', time: '今天 10:30', score: '7.8' },
  { title: '行为面试 · 跨团队冲突', time: '昨天 21:15', score: '7.2' },
  { title: '业务理解 · AI 产品落地', time: '周二 19:40', score: '8.1' },
]

export function RecentPracticeList() {
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
      <div className="record-list">
        {records.map((record) => (
          <article className="record-item" key={record.title}>
            <div>
              <h3>{record.title}</h3>
              <p>{record.time}</p>
            </div>
            <strong>{record.score}</strong>
          </article>
        ))}
      </div>
    </section>
  )
}
