import { useEffect, useState } from 'react'
import { ProgressOverview } from '../widgets/dashboard/ProgressOverview'
import { CurrentRoleCard } from '../widgets/dashboard/CurrentRoleCard'
import { RecommendationPanel } from '../widgets/dashboard/RecommendationPanel'
import { RecentPracticeList } from '../widgets/dashboard/RecentPracticeList'
import { getDashboardSummary } from '../services/dashboard.api'
import type { AsyncState } from '../types/api'
import type { DashboardSummary } from '../types/dashboard'

function isEmptyDashboard(data: DashboardSummary) {
  return (
    data.progress.length === 0 &&
    data.currentRole === null &&
    data.recommendations.length === 0 &&
    data.recentPractice.length === 0
  )
}

export function DashboardPage() {
  const [state, setState] = useState<AsyncState<DashboardSummary>>({ status: 'loading' })

  function loadDashboard() {
    setState({ status: 'loading' })

    getDashboardSummary()
      .then((data) => {
        setState(isEmptyDashboard(data) ? { status: 'empty' } : { status: 'success', data })
      })
      .catch((error) => {
        setState({ status: 'error', error: error instanceof Error ? error.message : '工作台数据加载失败' })
      })
  }

  useEffect(() => {
    loadDashboard()
  }, [])

  if (state.status === 'loading' || state.status === 'idle') {
    return (
      <div className="dashboard-state" role="status">
        正在加载工作台数据...
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="dashboard-state dashboard-state--error" role="alert">
        <h1>工作台加载失败</h1>
        <p>{state.error}</p>
        <button className="button button--primary" type="button" onClick={loadDashboard}>
          重试
        </button>
      </div>
    )
  }

  if (state.status === 'empty') {
    return (
      <div className="dashboard-state">
        <h1>还没有可展示的训练数据</h1>
        <p>先上传简历并添加目标岗位，Riva 会为你生成匹配分析、题卡和下一步训练建议。</p>
        <button className="button button--primary" type="button">
          创建求职档案
        </button>
      </div>
    )
  }

  if (state.status !== 'success') {
    return null
  }

  const { data } = state

  return (
    <div className="dashboard-page" aria-labelledby="dashboard-title">
      <section className="dashboard-hero">
        <div>
          <p className="eyebrow">{data.hero.eyebrow}</p>
          <h1 id="dashboard-title">{data.hero.title}</h1>
          <p className="dashboard-hero__copy">{data.hero.description}</p>
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

      {data.progress.length > 0 ? (
        <ProgressOverview metrics={data.progress} />
      ) : (
        <section className="panel panel--empty">暂无进度指标</section>
      )}

      <div className="dashboard-grid dashboard-grid--trio">
        <RecommendationPanel recommendations={data.recommendations} />
        {data.currentRole ? (
          <CurrentRoleCard role={data.currentRole} />
        ) : (
          <section className="panel panel--empty" id="roles">
            暂无目标岗位
          </section>
        )}
        <RecentPracticeList records={data.recentPractice} />
      </div>
    </div>
  )
}
