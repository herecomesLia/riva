const keywords = ['数据驱动', '业务理解', '跨团队推进', 'AI 产品落地']

export function CurrentRoleCard() {
  return (
    <section className="panel panel--role" id="roles" aria-labelledby="role-card-title">
      <div className="panel__header">
        <div>
          <p className="eyebrow">目标岗位</p>
          <h2 id="role-card-title">产品经理 · Riva AI</h2>
        </div>
        <span className="status-pill">准备中</span>
      </div>
      <p className="panel__copy">
        当前 JD 强调数据驱动、跨团队推进和 AI 产品落地。建议优先准备项目深挖与业务理解题。
      </p>
      <div className="keyword-list" aria-label="岗位高频关键词">
        {keywords.map((keyword) => (
          <span className="jd-tag" key={keyword}>
            {keyword}
          </span>
        ))}
      </div>
      <div className="role-readiness">
        <div>
          <span>JD 解析</span>
          <strong>已完成</strong>
        </div>
        <div>
          <span>匹配分析</span>
          <strong>可复盘</strong>
        </div>
        <div>
          <span>推荐题卡</span>
          <strong>12 道</strong>
        </div>
      </div>
    </section>
  )
}
