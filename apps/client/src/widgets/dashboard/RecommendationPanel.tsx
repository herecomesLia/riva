const recommendations = [
  {
    title: '重练项目深挖题',
    reason: '上次回答缺少个人贡献和量化结果，建议用 STAR 结构重答。',
    action: '重练当前题',
  },
  {
    title: '进入业务理解专项',
    reason: '岗位高频关键词中「商业化」覆盖不足，先补 2 道业务题。',
    action: '开始专项',
  },
  {
    title: '本周末模拟一面',
    reason: '基础题表现稳定，可以进入连续问答场景检查节奏。',
    action: '安排模拟',
  },
]

export function RecommendationPanel() {
  return (
    <section className="panel" aria-labelledby="recommendation-title">
      <div className="panel__header">
        <div>
          <p className="eyebrow">下一步推荐</p>
          <h2 id="recommendation-title">今天最值得做的 3 件事</h2>
        </div>
      </div>
      <div className="recommendation-list">
        {recommendations.map((item, index) => (
          <article className="recommendation-item" key={item.title}>
            <span className="recommendation-item__index">{index + 1}</span>
            <div>
              <h3>{item.title}</h3>
              <p>{item.reason}</p>
            </div>
            <button className="button button--small" type="button">
              {item.action}
            </button>
          </article>
        ))}
      </div>
    </section>
  )
}
