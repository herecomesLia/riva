import { ProgressOverview } from '../widgets/dashboard/ProgressOverview'
import { CurrentRoleCard } from '../widgets/dashboard/CurrentRoleCard'
import { RecommendationPanel } from '../widgets/dashboard/RecommendationPanel'
import { RecentPracticeList } from '../widgets/dashboard/RecentPracticeList'

export function DashboardPage() {
  return (
    <div className="dashboard-page" aria-labelledby="dashboard-title">
      <section className="dashboard-hero">
        <div>
          <p className="eyebrow">今日训练工作台</p>
          <h1 id="dashboard-title">把下一场面试准备得更有把握</h1>
          <p className="dashboard-hero__copy">
            Riva 已根据你的简历、目标岗位和最近练习表现整理出今天最值得推进的准备动作。
          </p>
        </div>
        <div className="dashboard-hero__actions" aria-label="主要操作">
          <button className="button button--primary" type="button">
            开始专项练习
          </button>
          <button className="button button--secondary" type="button">
            进入模拟面试
          </button>
        </div>
      </section>

      <ProgressOverview />

      <div className="dashboard-grid dashboard-grid--trio">
        <RecommendationPanel />
        <CurrentRoleCard />
        <RecentPracticeList />
      </div>
    </div>
  )
}
