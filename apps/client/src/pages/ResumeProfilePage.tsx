import { useEffect, useState, type FormEvent } from 'react'
import { getResumeProfile } from '../services/resume.service'
import type { AsyncState } from '../types/api'
import type { ResumeExperience, ResumeProfile, ResumeProject } from '../types/resume'

type ResumeProfilePageProps = {
  onSetupResume: () => void
}

type EditableListType = 'skills' | 'certificates'

function isEmptyProfile(data: { profile: ResumeProfile | null }) {
  return data.profile === null
}

function parseEditableList(value: string) {
  return Array.from(
    new Set(
      value
        .split(/\n+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  )
}

function getExperienceSourceText(item: ResumeExperience) {
  return (
    item.sourceText ||
    `公司：${item.organization}\n职位：${item.title}\n时间：${item.period}\n${item.description}`
  )
}

function summarizeExperienceSource(item: ResumeExperience, sourceText: string): ResumeExperience {
  const normalizedText = sourceText.trim()
  const lines = normalizedText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
  const organizationMatch = normalizedText.match(/(?:公司|组织|机构)[:：]\s*([^\n]+)/)
  const titleMatch = normalizedText.match(/(?:职位|岗位|职务)[:：]\s*([^\n]+)/)
  const periodMatch = normalizedText.match(/(?:时间|周期|任职时间|工作时长)[:：]\s*([^\n]+)/)
  const description = lines
    .filter((line) => !/^(公司|组织|机构|职位|岗位|职务|时间|周期|任职时间|工作时长)[:：]/.test(line))
    .join(' ')

  return {
    ...item,
    title: titleMatch?.[1].trim() || item.title,
    organization: organizationMatch?.[1].trim() || item.organization,
    period: periodMatch?.[1].trim() || item.period,
    description: description || item.description,
    sourceText: normalizedText,
  }
}

function ExperienceList({
  emptyText = '暂无经历信息',
  items,
  onEdit,
}: {
  emptyText?: string
  items: ResumeExperience[]
  onEdit?: (item: ResumeExperience) => void
}) {
  if (items.length === 0) {
    return <p className="panel--empty">{emptyText}</p>
  }

  return (
    <div className="resume-timeline">
      {items.map((item) => (
        <article key={item.id}>
          <div className="resume-experience-card__topbar">
            <span>{item.period}</span>
            {onEdit ? (
              <button className="resume-experience-card__edit" type="button" onClick={() => onEdit(item)}>
                编辑
              </button>
            ) : null}
          </div>
          <h3>{item.title}</h3>
          <strong>{item.organization}</strong>
          <p>{item.description}</p>
        </article>
      ))}
    </div>
  )
}

function getEducationTabLabel(item: ResumeExperience) {
  const parts = item.title.trim().split(/\s+/)
  return parts[parts.length - 1] || item.title
}

function EducationFocusBrowser({ items }: { items: ResumeExperience[] }) {
  const [activeEducationId, setActiveEducationId] = useState(items[0]?.id ?? '')

  if (items.length === 0) {
    return <p className="panel--empty">暂无教育经历</p>
  }

  const activeItem = items.find((item) => item.id === activeEducationId) ?? items[0]

  return (
    <div className="education-focus-browser">
      {items.length > 1 ? (
        <div className="education-focus-tabs" aria-label="切换教育经历">
          {items.map((item) => {
            const isActive = item.id === activeItem.id

            return (
              <button
                aria-pressed={isActive}
                className={`education-focus-tab${isActive ? ' education-focus-tab--active' : ''}`}
                key={item.id}
                type="button"
                onClick={() => setActiveEducationId(item.id)}
              >
                {getEducationTabLabel(item)}
              </button>
            )
          })}
        </div>
      ) : null}

      <article className="education-focus-card" key={activeItem.id}>
        <div className="education-focus-card__header">
          <div className="education-focus-card__identity">
            <div className="education-focus-card__title-row">
              <h3>{activeItem.organization}</h3>
              <span className="education-focus-card__period">{activeItem.period}</span>
            </div>
            <strong>{activeItem.title}</strong>
          </div>
        </div>
        <div className="education-focus-card__body">
          <p>{activeItem.description}</p>
        </div>
      </article>
    </div>
  )
}

function summarizeProjectSource(project: ResumeProject, sourceText: string): ResumeProject {
  const normalizedText = sourceText.trim()
  const lines = normalizedText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)

  const nameMatch = normalizedText.match(/(?:项目|项目名称)[:：]\s*([^\n]+)/)
  const roleMatch = normalizedText.match(/(?:角色|职责|担任)[:：]\s*([^\n]+)/)
  const body = lines
    .filter((line) => !/^(项目|项目名称|角色|职责|担任)[:：]/.test(line))
    .join(' ')
  const summarySource = body || normalizedText
  const summary = summarySource.length > 58 ? `${summarySource.slice(0, 58)}...` : summarySource
  const metricMatch = normalizedText.match(/(?:提升|降低|增长|沉淀|完成率|留存|转化率)[^，。；\n]*/)
  const highlightPool = [
    metricMatch?.[0],
    normalizedText.includes('策略') ? '更新项目策略' : '',
    normalizedText.includes('复盘') ? '完善复盘链路' : '',
    normalizedText.includes('推荐') ? '优化推荐逻辑' : '',
    normalizedText.includes('用户') ? '围绕用户体验优化' : '',
    normalizedText.includes('数据') || normalizedText.includes('埋点') ? '补充数据验证' : '',
  ].filter((highlight): highlight is string => Boolean(highlight))
  const highlights = Array.from(new Set(highlightPool)).slice(0, 3)

  return {
    ...project,
    name: nameMatch?.[1].trim() || project.name,
    role: roleMatch?.[1].trim() || project.role,
    summary: summary || project.summary,
    highlights: highlights.length ? highlights : project.highlights,
    sourceText: normalizedText,
  }
}

function ProjectList({ items, onEdit }: { items: ResumeProject[]; onEdit: (project: ResumeProject) => void }) {
  if (items.length === 0) {
    return <p className="panel--empty">暂无项目经历</p>
  }

  return (
    <div className="resume-project-list">
      {items.map((project) => (
        <article key={project.id}>
          <div className="resume-project-card__topbar">
            <div className="resume-project-card__title">
              <h3>{project.name}</h3>
              <span>{project.role}</span>
            </div>
            <button className="resume-project-card__edit" type="button" onClick={() => onEdit(project)}>
              编辑
            </button>
          </div>
          <p>{project.summary}</p>
          <div className="keyword-list">
            {project.highlights.map((highlight) => (
              <span className="jd-tag" key={highlight}>
                {highlight}
              </span>
            ))}
          </div>
        </article>
      ))}
    </div>
  )
}

export function ResumeProfilePage({ onSetupResume }: ResumeProfilePageProps) {
  const [state, setState] = useState<AsyncState<{ profile: ResumeProfile | null }>>({ status: 'loading' })
  const [projects, setProjects] = useState<ResumeProject[]>([])
  const [editingProjectId, setEditingProjectId] = useState('')
  const [projectDraft, setProjectDraft] = useState('')
  const [workExperiences, setWorkExperiences] = useState<ResumeExperience[]>([])
  const [editingWorkId, setEditingWorkId] = useState('')
  const [workDraft, setWorkDraft] = useState('')
  const [skills, setSkills] = useState<string[]>([])
  const [certificates, setCertificates] = useState<string[]>([])
  const [editingListType, setEditingListType] = useState<EditableListType | ''>('')
  const [listDraft, setListDraft] = useState('')

  function loadProfile() {
    setState({ status: 'loading' })

    getResumeProfile()
      .then((data) => {
        setState(isEmptyProfile(data) ? { status: 'empty' } : { status: 'success', data })
      })
      .catch((error) => {
        setState({ status: 'error', error: error instanceof Error ? error.message : '求职档案加载失败' })
      })
  }

  useEffect(() => {
    loadProfile()
  }, [])

  useEffect(() => {
    if (state.status === 'success' && state.data.profile) {
      setProjects(state.data.profile.projects)
      setWorkExperiences(state.data.profile.workExperience)
      setSkills(state.data.profile.skills)
      setCertificates(state.data.profile.certificates)
    }
  }, [state])

  function openProjectEditor(project: ResumeProject) {
    setEditingProjectId(project.id)
    setProjectDraft(project.sourceText)
  }

  function closeProjectEditor() {
    setEditingProjectId('')
    setProjectDraft('')
  }

  function handleProjectSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setProjects((currentProjects) =>
      currentProjects.map((project) =>
        project.id === editingProjectId ? summarizeProjectSource(project, projectDraft) : project,
      ),
    )
    closeProjectEditor()
  }

  function openWorkEditor(item: ResumeExperience) {
    setEditingWorkId(item.id)
    setWorkDraft(getExperienceSourceText(item))
  }

  function closeWorkEditor() {
    setEditingWorkId('')
    setWorkDraft('')
  }

  function handleWorkSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setWorkExperiences((currentItems) =>
      currentItems.map((item) => (item.id === editingWorkId ? summarizeExperienceSource(item, workDraft) : item)),
    )
    closeWorkEditor()
  }

  function openListEditor(type: EditableListType) {
    setEditingListType(type)
    setListDraft((type === 'skills' ? skills : certificates).join('\n'))
  }

  function closeListEditor() {
    setEditingListType('')
    setListDraft('')
  }

  function handleListSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const nextItems = parseEditableList(listDraft)
    if (editingListType === 'skills') {
      setSkills(nextItems)
    }
    if (editingListType === 'certificates') {
      setCertificates(nextItems)
    }
    closeListEditor()
  }

  if (state.status === 'loading' || state.status === 'idle') {
    return (
      <div className="dashboard-state" role="status">
        正在加载求职档案...
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="dashboard-state dashboard-state--error" role="alert">
        <h1>求职档案加载失败</h1>
        <p>{state.error}</p>
        <button className="button button--primary" type="button" onClick={loadProfile}>
          重试
        </button>
      </div>
    )
  }

  if (state.status === 'empty') {
    return (
      <div className="dashboard-state">
        <h1>还没有求职档案</h1>
        <p>先上传或粘贴简历，Riva 会生成结构化档案，并作为岗位匹配、题卡生成和模拟面试的上下文。</p>
        <button className="button button--primary" type="button" onClick={onSetupResume}>
          创建求职档案
        </button>
      </div>
    )
  }

  if (state.status !== 'success' || !state.data.profile) {
    return null
  }

  const { profile } = state.data
  const { basicInfo } = profile
  const completion = Math.min(100, Math.max(0, profile.completion))
  const editingProject = projects.find((project) => project.id === editingProjectId)
  const editingWork = workExperiences.find((item) => item.id === editingWorkId)
  const editingListTitle =
    editingListType === 'skills' ? '技能标签' : editingListType === 'certificates' ? '证书或奖项' : ''

  return (
    <div className="resume-page" aria-labelledby="resume-profile-title">
      <header className="page-header">
        <div className="page-header__content">
          <p className="eyebrow">当前档案</p>
          <h1 className="resume-profile-title" id="resume-profile-title">
            {basicInfo.name}
          </h1>
          <p>
            {basicInfo.location} · {basicInfo.yearsOfExperience}经验 · {profile.updatedAt} 更新
          </p>
        </div>
        <dl className="page-header__facts" aria-label="档案基础信息">
          <div>
            <dt>邮箱</dt>
            <dd>{basicInfo.email}</dd>
          </div>
          <div>
            <dt>电话</dt>
            <dd>{basicInfo.phone}</dd>
          </div>
          <div className="page-header__fact--direction">
            <dt>求职方向</dt>
            <dd>{basicInfo.jobDirection}</dd>
          </div>
        </dl>
        <div className="page-header__actions">
          <div className="resume-completion" aria-label={`档案完整度 ${profile.completion}%`}>
            <svg className="resume-completion__ring" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
              <circle className="resume-completion__track" cx="60" cy="60" r="48" pathLength={100} />
              <circle
                className="resume-completion__progress"
                cx="60"
                cy="60"
                r="48"
                pathLength={100}
                strokeDasharray={`${completion} ${100 - completion}`}
              />
            </svg>
            <div className="resume-completion__center">
              <strong>{profile.completion}%</strong>
              <span>完整度</span>
            </div>
          </div>
          <button className="button button--primary" type="button" onClick={onSetupResume}>
            更新简历
          </button>
        </div>
      </header>

      <div className="resume-profile-grid resume-profile-grid--wide resume-credential-grid">
        <section className="panel resume-scroll-panel">
          <div className="panel__header">
            <div>
              <h2>教育经历</h2>
              <p className="panel__copy">补充专业背景、课程和校园项目。</p>
            </div>
          </div>
          <EducationFocusBrowser items={profile.education} />
        </section>

        <div className="resume-side-stack">
          <section className="panel">
            <div className="panel__header">
              <div>
                <h2>技能标签</h2>
                <p className="panel__copy">用于生成专项题卡和训练复盘维度。</p>
              </div>
              <button className="resume-panel-edit" type="button" onClick={() => openListEditor('skills')}>
                编辑
              </button>
            </div>
            <div className="keyword-list">
              {skills.map((skill) => (
                <span className="jd-tag" key={skill}>
                  {skill}
                </span>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel__header">
              <div>
                <h2>证书或奖项</h2>
                <p className="panel__copy">可作为基础能力和附加证明材料。</p>
              </div>
              <button className="resume-panel-edit" type="button" onClick={() => openListEditor('certificates')}>
                编辑
              </button>
            </div>
            {certificates.length > 0 ? (
              <div className="keyword-list">
                {certificates.map((certificate) => (
                  <span className="jd-tag" key={certificate}>
                    {certificate}
                  </span>
                ))}
              </div>
            ) : (
              <p className="panel--empty">暂无内容</p>
            )}
          </section>
        </div>
      </div>

      <div className="resume-profile-grid resume-profile-grid--wide resume-experience-grid">
        <section className="panel resume-balanced-scroll-panel">
          <div className="panel__header">
            <div>
              <h2>项目经历</h2>
              <p className="panel__copy">项目亮点会用于项目深挖题和 STAR 结构复盘。</p>
            </div>
          </div>
          <ProjectList items={projects} onEdit={openProjectEditor} />
        </section>

        <section className="panel resume-balanced-scroll-panel">
          <div className="panel__header">
            <div>
              <h2>工作经历</h2>
              <p className="panel__copy">面试追问会优先围绕最近岗位和可量化结果展开。</p>
            </div>
          </div>
          <ExperienceList emptyText="暂无内容" items={workExperiences} onEdit={openWorkEditor} />
        </section>
      </div>

      {editingProject ? (
        <div className="resume-modal-backdrop">
          <form
            aria-labelledby="project-editor-title"
            aria-modal="true"
            className="resume-project-editor"
            role="dialog"
            onSubmit={handleProjectSave}
          >
            <div className="resume-project-editor__header">
              <div>
                <p id="project-editor-title">编辑 {editingProject.name}</p>
                <span>项目经历原文</span>
              </div>
            </div>
            <label className="resume-project-editor__field">
              <textarea
                aria-label="项目经历原文"
                className="resume-project-editor__textarea"
                value={projectDraft}
                onChange={(event) => setProjectDraft(event.target.value)}
              />
            </label>
            <div className="resume-project-editor__actions">
              <button className="button button--secondary" type="button" onClick={closeProjectEditor}>
                取消
              </button>
              <button className="button button--primary" type="submit" disabled={projectDraft.trim().length === 0}>
                确认
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {editingWork ? (
        <div className="resume-modal-backdrop">
          <form
            aria-labelledby="work-editor-title"
            aria-modal="true"
            className="resume-project-editor"
            role="dialog"
            onSubmit={handleWorkSave}
          >
            <div className="resume-project-editor__header">
              <div>
                <p id="work-editor-title">编辑 {editingWork.organization} 工作经历</p>
                <span>工作经历原文</span>
              </div>
            </div>
            <label className="resume-project-editor__field">
              <textarea
                aria-label="工作经历原文"
                className="resume-project-editor__textarea"
                value={workDraft}
                onChange={(event) => setWorkDraft(event.target.value)}
              />
            </label>
            <div className="resume-project-editor__actions">
              <button className="button button--secondary" type="button" onClick={closeWorkEditor}>
                取消
              </button>
              <button className="button button--primary" type="submit" disabled={workDraft.trim().length === 0}>
                确认
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {editingListType ? (
        <div className="resume-modal-backdrop">
          <form
            aria-labelledby="list-editor-title"
            aria-modal="true"
            className="resume-project-editor"
            role="dialog"
            onSubmit={handleListSave}
          >
            <div className="resume-project-editor__header">
              <div>
                <p id="list-editor-title">编辑{editingListTitle}</p>
                <span>每行填写一项</span>
              </div>
            </div>
            <label className="resume-project-editor__field">
              <textarea
                aria-label={`${editingListTitle}列表`}
                className="resume-project-editor__textarea resume-project-editor__textarea--compact"
                value={listDraft}
                onChange={(event) => setListDraft(event.target.value)}
              />
            </label>
            <div className="resume-project-editor__actions">
              <button className="button button--secondary" type="button" onClick={closeListEditor}>
                取消
              </button>
              <button className="button button--primary" type="submit">
                确认
              </button>
            </div>
          </form>
        </div>
      ) : null}

    </div>
  )
}
