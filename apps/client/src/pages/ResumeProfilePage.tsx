import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type FormEvent,
  type PointerEvent,
  type WheelEvent,
} from 'react'
import editIconUrl from '../assets/edit.svg'
import { getResumeProfile } from '../services/resume.service'
import type { AsyncState } from '../types/api'
import type { ResumeExperience, ResumeProfile, ResumeProject } from '../types/resume'

type ResumeProfilePageProps = {
  onSetupResume: () => void
}

type EditableListType = 'skills' | 'certificates'
type EducationPickerType = 'degree' | 'endPeriod' | 'startPeriod'
type ProjectPickerType = 'endPeriod' | 'startPeriod'

type EducationDraft = {
  degree: string
  description: string
  endPeriod: string
  id: string
  organization: string
  startPeriod: string
  title: string
}

type ProjectDraft = {
  endPeriod: string
  id: string
  name: string
  role: string
  sourceText: string
  startPeriod: string
}

type WheelPickerProps = {
  label: string
  onChange: (value: string) => void
  options: string[]
  value: string
}

function isEmptyProfile(data: { profile: ResumeProfile | null }) {
  return data.profile === null
}

const EDUCATION_DEGREES = ['大专', '本科', '硕士', '博士']
const WHEEL_ITEM_HEIGHT = 36
const CURRENT_YEAR = new Date().getFullYear()
const PERIOD_YEARS = Array.from({ length: 16 }, (_, index) => String(CURRENT_YEAR - 10 + index))
const PERIOD_MONTHS = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'))

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

function parseEducationPeriod(period: string) {
  const [startPeriod = '2022.09', endPeriod = '2026.06'] = period
    .split('-')
    .map((value) => value.trim())

  return { startPeriod, endPeriod }
}

function parseEducationTitle(title: string, degree?: string) {
  if (degree) {
    return { degree, major: title }
  }

  const parts = title.trim().split(/\s+/)
  const possibleDegree = parts[parts.length - 1]

  if (EDUCATION_DEGREES.includes(possibleDegree)) {
    return {
      degree: possibleDegree,
      major: parts.slice(0, -1).join(' ') || title,
    }
  }

  return { degree: '本科', major: title }
}

function getEducationTitle(item: ResumeExperience) {
  const { degree, major } = parseEducationTitle(item.title, item.degree)
  return `${major} ${degree}`.trim()
}

function splitPeriodValue(period: string) {
  const [year = '', month = ''] = period.split('.')
  return { month, year }
}

function mergePeriodValue(year: string, month: string) {
  return `${year}.${month}`
}

function getEducationDraftLabel(draft: EducationDraft, index: number) {
  if (draft.title) {
    return `${draft.title} ${draft.degree}`.trim()
  }

  return draft.organization || `教育经历 ${index + 1}`
}

function createEducationDraft(item: ResumeExperience): EducationDraft {
  const { startPeriod, endPeriod } = parseEducationPeriod(item.period)
  const { degree, major } = parseEducationTitle(item.title, item.degree)

  return {
    degree,
    description: item.description,
    endPeriod,
    id: item.id,
    organization: item.organization,
    startPeriod,
    title: major,
  }
}

function createEmptyEducationDraft(): EducationDraft {
  return {
    degree: '',
    description: '',
    endPeriod: '',
    id: `edu_${Date.now()}`,
    organization: '',
    startPeriod: '',
    title: '',
  }
}

function educationDraftToExperience(draft: EducationDraft): ResumeExperience {
  return {
    degree: draft.degree,
    description: draft.description.trim(),
    id: draft.id,
    organization: draft.organization.trim(),
    period: `${draft.startPeriod} - ${draft.endPeriod}`,
    title: draft.title.trim(),
  }
}

function getProjectDraftLabel(draft: ProjectDraft, index: number) {
  return draft.name || `项目经历 ${index + 1}`
}

function getProjectHighlights(sourceText: string, fallback: string[]) {
  const normalizedText = sourceText.trim()
  const metricMatch = normalizedText.match(/(?:提升|降低|增长|沉淀|完成率|留存|转化率)[^，。；\n]*/)
  const highlightPool = [
    metricMatch?.[0],
    normalizedText.includes('策略') ? '更新项目策略' : '',
    normalizedText.includes('复盘') ? '完善复盘链路' : '',
    normalizedText.includes('推荐') ? '优化推荐逻辑' : '',
    normalizedText.includes('用户') ? '围绕用户体验优化' : '',
    normalizedText.includes('数据') || normalizedText.includes('埋点') ? '补充数据验证' : '',
  ].filter((highlight): highlight is string => Boolean(highlight))

  return Array.from(new Set(highlightPool)).slice(0, 3).length
    ? Array.from(new Set(highlightPool)).slice(0, 3)
    : fallback
}

function getProjectSummary(sourceText: string, fallback: string) {
  const normalizedText = sourceText.trim()
  const lines = normalizedText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
  const body = lines
    .filter((line) => !/^(项目|项目名称|角色|职责|担任|时间|项目时间)[:：]/.test(line))
    .join(' ')
  const summarySource = body || normalizedText

  if (!summarySource) {
    return fallback
  }

  return summarySource.length > 58 ? `${summarySource.slice(0, 58)}...` : summarySource
}

function createProjectDraft(project: ResumeProject): ProjectDraft {
  const { startPeriod, endPeriod } = parseEducationPeriod(project.period)

  return {
    endPeriod,
    id: project.id,
    name: project.name,
    role: project.role,
    sourceText: project.sourceText,
    startPeriod,
  }
}

function createEmptyProjectDraft(): ProjectDraft {
  return {
    endPeriod: '',
    id: `project_${Date.now()}`,
    name: '',
    role: '',
    sourceText: '',
    startPeriod: '',
  }
}

function projectDraftToProject(draft: ProjectDraft, originalProject?: ResumeProject): ResumeProject {
  const sourceText = draft.sourceText.trim()

  return {
    highlights: getProjectHighlights(sourceText, originalProject?.highlights || []),
    id: draft.id,
    name: draft.name.trim(),
    period: `${draft.startPeriod} - ${draft.endPeriod}`,
    role: draft.role.trim(),
    sourceText,
    summary: getProjectSummary(sourceText, originalProject?.summary || ''),
  }
}

function EditIcon() {
  return <img alt="" aria-hidden="true" className="resume-edit-icon" src={editIconUrl} />
}

function WheelPicker({ label, onChange, options, value }: WheelPickerProps) {
  const selectedIndex = Math.max(options.indexOf(value), 0)
  const [scrollPosition, setScrollPosition] = useState(selectedIndex)
  const [isDragging, setIsDragging] = useState(false)
  const [isSnapping, setIsSnapping] = useState(false)
  const dragStartRef = useRef({ position: selectedIndex, y: 0 })
  const hasDraggedRef = useRef(false)
  const scrollPositionRef = useRef(selectedIndex)
  const snapTimerRef = useRef<number | undefined>(undefined)
  const wheelStepLockRef = useRef(false)

  useEffect(() => {
    if (!isDragging && !isSnapping) {
      const boundedSelectedIndex = Math.min(Math.max(selectedIndex, 0), options.length - 1)

      scrollPositionRef.current = boundedSelectedIndex
      setScrollPosition(boundedSelectedIndex)
    }
  }, [isDragging, isSnapping, options.length, selectedIndex])

  useEffect(
    () => () => {
      if (snapTimerRef.current) {
        window.clearTimeout(snapTimerRef.current)
      }
    },
    [],
  )

  useEffect(() => {
    scrollPositionRef.current = scrollPosition
  }, [scrollPosition])

  function clampPosition(position: number) {
    return Math.min(Math.max(position, 0), options.length - 1)
  }

  function clearSnapTimer() {
    if (snapTimerRef.current) {
      window.clearTimeout(snapTimerRef.current)
      snapTimerRef.current = undefined
    }
  }

  function updateScrollPosition(position: number) {
    const boundedPosition = clampPosition(position)

    scrollPositionRef.current = boundedPosition
    setScrollPosition(boundedPosition)
  }

  function snapToNearest(position = scrollPositionRef.current) {
    const nearestIndex = Math.round(clampPosition(position))

    clearSnapTimer()
    setIsSnapping(true)
    updateScrollPosition(nearestIndex)

    snapTimerRef.current = window.setTimeout(() => {
      if (options[nearestIndex] !== value) {
        onChange(options[nearestIndex])
      }

      setIsSnapping(false)
      wheelStepLockRef.current = false
    }, 190)
  }

  function handleOptionClick(index: number) {
    if (isDragging || hasDraggedRef.current) {
      hasDraggedRef.current = false
      return
    }

    snapToNearest(index)
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    clearSnapTimer()
    setIsDragging(true)
    setIsSnapping(false)
    hasDraggedRef.current = false
    dragStartRef.current = {
      position: scrollPositionRef.current,
      y: event.clientY,
    }
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!isDragging) {
      return
    }

    event.preventDefault()
    const dragDistance = event.clientY - dragStartRef.current.y

    if (Math.abs(dragDistance) > 3) {
      hasDraggedRef.current = true
    }

    updateScrollPosition(dragStartRef.current.position - dragDistance / WHEEL_ITEM_HEIGHT)
  }

  function handlePointerEnd(event: PointerEvent<HTMLDivElement>) {
    if (!isDragging) {
      return
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    setIsDragging(false)
    snapToNearest()
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()

    if (wheelStepLockRef.current || isSnapping) {
      return
    }

    clearSnapTimer()
    wheelStepLockRef.current = true
    snapToNearest(Math.round(scrollPositionRef.current) + (event.deltaY > 0 ? 1 : -1))
  }

  const activeIndex = Math.round(clampPosition(scrollPosition))

  return (
    <div
      className={`wheel-picker${isDragging ? ' wheel-picker--dragging' : ''}${
        isSnapping ? ' wheel-picker--snapping' : ''
      }`}
      aria-label={label}
      onPointerCancel={handlePointerEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onWheel={handleWheel}
    >
      <div className="wheel-picker__track">
        {options.map((option, index) => {
          const distance = index - scrollPosition
          const absoluteDistance = Math.abs(distance)
          const isActive = index === activeIndex
          const optionStyle = {
            opacity: absoluteDistance > 3.25 ? 0 : Math.max(0.22, 1 - absoluteDistance * 0.22),
            pointerEvents: absoluteDistance > 3.25 ? 'none' : 'auto',
            transform: `translateY(-50%) scale(${Math.max(0.82, 1 - absoluteDistance * 0.08)}) rotateX(${
              distance * -18
            }deg)`,
            top: `calc(50% + ${distance * WHEEL_ITEM_HEIGHT}px)`,
          } satisfies CSSProperties

          return (
            <button
              aria-pressed={isActive}
              className={`wheel-picker__option${isActive ? ' wheel-picker__option--active' : ''}`}
              key={option}
              type="button"
              style={optionStyle}
              onClick={() => handleOptionClick(index)}
            >
              {option}
            </button>
          )
        })}
      </div>
    </div>
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
              <button
                aria-label={`编辑${item.organization}工作经历`}
                className="resume-experience-card__edit"
                title="编辑"
                type="button"
                onClick={() => onEdit(item)}
              >
                <EditIcon />
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
  return parseEducationTitle(item.title, item.degree).degree
}

function EducationFocusBrowser({
  items,
  onViewDescription,
}: {
  items: ResumeExperience[]
  onViewDescription: (item: ResumeExperience) => void
}) {
  const [activeEducationId, setActiveEducationId] = useState(items[0]?.id ?? '')

  if (items.length === 0) {
    return <p className="panel--empty">暂无教育经历</p>
  }

  const activeItem = items.find((item) => item.id === activeEducationId) ?? items[0]
  const shouldShowFullButton = Boolean(activeItem.description)

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
            <strong>{getEducationTitle(activeItem)}</strong>
          </div>
        </div>
        <div className="education-focus-card__body">
          <p className={shouldShowFullButton ? 'education-focus-card__copy--clamped' : undefined}>
            {activeItem.description}
          </p>
          {shouldShowFullButton ? (
            <button className="education-focus-card__read" type="button" onClick={() => onViewDescription(activeItem)}>
              查看完整在校经历
            </button>
          ) : null}
        </div>
      </article>
    </div>
  )
}

function ProjectList({ items }: { items: ResumeProject[] }) {
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
            <span className="resume-project-card__period">{project.period}</span>
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
  const [isEditingProjects, setIsEditingProjects] = useState(false)
  const [projectDrafts, setProjectDrafts] = useState<ProjectDraft[]>([])
  const [activeProjectDraftId, setActiveProjectDraftId] = useState('')
  const [projectPickerType, setProjectPickerType] = useState<ProjectPickerType | ''>('')
  const [projectPickerYear, setProjectPickerYear] = useState('')
  const [projectPickerMonth, setProjectPickerMonth] = useState('')
  const [workExperiences, setWorkExperiences] = useState<ResumeExperience[]>([])
  const [editingWorkId, setEditingWorkId] = useState('')
  const [workDraft, setWorkDraft] = useState('')
  const [skills, setSkills] = useState<string[]>([])
  const [certificates, setCertificates] = useState<string[]>([])
  const [editingListType, setEditingListType] = useState<EditableListType | ''>('')
  const [listDraft, setListDraft] = useState('')
  const [education, setEducation] = useState<ResumeExperience[]>([])
  const [isEditingEducation, setIsEditingEducation] = useState(false)
  const [educationDrafts, setEducationDrafts] = useState<EducationDraft[]>([])
  const [activeEducationDraftId, setActiveEducationDraftId] = useState('')
  const [viewingEducationId, setViewingEducationId] = useState('')
  const [educationPickerType, setEducationPickerType] = useState<EducationPickerType | ''>('')
  const [educationPickerDegree, setEducationPickerDegree] = useState('')
  const [educationPickerYear, setEducationPickerYear] = useState('')
  const [educationPickerMonth, setEducationPickerMonth] = useState('')

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
      setEducation(state.data.profile.education)
    }
  }, [state])

  function openProjectEditor() {
    const drafts = projects.length ? projects.map(createProjectDraft) : [createEmptyProjectDraft()]

    setProjectDrafts(drafts)
    setActiveProjectDraftId(drafts[0]?.id || '')
    setIsEditingProjects(true)
  }

  function closeProjectEditor() {
    setIsEditingProjects(false)
    setProjectDrafts([])
    setActiveProjectDraftId('')
    setProjectPickerType('')
  }

  function handleProjectSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setProjects((currentProjects) =>
      projectDrafts.map((draft) =>
        projectDraftToProject(
          draft,
          currentProjects.find((project) => project.id === draft.id),
        ),
      ),
    )
    closeProjectEditor()
  }

  function updateProjectDraft(id: string, patch: Partial<ProjectDraft>) {
    setProjectDrafts((currentDrafts) =>
      currentDrafts.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)),
    )
  }

  function addProjectDraft() {
    const draft = createEmptyProjectDraft()

    setProjectDrafts((currentDrafts) => [...currentDrafts, draft])
    setActiveProjectDraftId(draft.id)
  }

  function deleteProjectDraft(id: string) {
    setProjectDrafts((currentDrafts) => {
      const nextDrafts =
        currentDrafts.length > 1 ? currentDrafts.filter((draft) => draft.id !== id) : [createEmptyProjectDraft()]

      if (!nextDrafts.some((draft) => draft.id === activeProjectDraftId)) {
        setActiveProjectDraftId(nextDrafts[0]?.id || '')
      }

      return nextDrafts
    })
  }

  function openProjectPicker(type: ProjectPickerType) {
    const activeDraft = projectDrafts.find((draft) => draft.id === activeProjectDraftId)

    if (!activeDraft) {
      return
    }

    const { month, year } = splitPeriodValue(type === 'startPeriod' ? activeDraft.startPeriod : activeDraft.endPeriod)

    setProjectPickerType(type)
    setProjectPickerYear(year || String(CURRENT_YEAR))
    setProjectPickerMonth(month || '01')
  }

  function closeProjectPicker() {
    setProjectPickerType('')
  }

  function handleStructuredEditorTextFocus(event: FocusEvent<HTMLDivElement>) {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      closeProjectPicker()
      closeEducationPicker()
    }
  }

  function confirmProjectPicker() {
    const activeDraft = projectDrafts.find((draft) => draft.id === activeProjectDraftId)

    if (!activeDraft || !projectPickerType) {
      return
    }

    updateProjectDraft(activeDraft.id, {
      [projectPickerType]: mergePeriodValue(projectPickerYear, projectPickerMonth),
    })
    closeProjectPicker()
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

  function openEducationEditor() {
    const drafts = education.map(createEducationDraft)
    const nextDrafts = drafts.length > 0 ? drafts : [createEmptyEducationDraft()]

    setEducationDrafts(nextDrafts)
    setActiveEducationDraftId(nextDrafts[0].id)
    setIsEditingEducation(true)
  }

  function closeEducationEditor() {
    setIsEditingEducation(false)
    setEducationDrafts([])
    setActiveEducationDraftId('')
    closeEducationPicker()
  }

  function addEducationDraft() {
    const nextDraft = createEmptyEducationDraft()
    setEducationDrafts((currentDrafts) => [...currentDrafts, nextDraft])
    setActiveEducationDraftId(nextDraft.id)
  }

  function deleteEducationDraft(id: string) {
    const nextDrafts = educationDrafts.filter((draft) => draft.id !== id)
    const fallbackDrafts = nextDrafts.length > 0 ? nextDrafts : [createEmptyEducationDraft()]

    setEducationDrafts(fallbackDrafts)
    setActiveEducationDraftId(fallbackDrafts[0].id)
  }

  function updateEducationDraft(id: string, patch: Partial<EducationDraft>) {
    setEducationDrafts((currentDrafts) =>
      currentDrafts.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)),
    )
  }

  function handleEducationSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setEducation(
      educationDrafts
        .map(educationDraftToExperience)
        .filter((item) => item.organization || item.title || item.description),
    )
    closeEducationEditor()
  }

  function openEducationPicker(type: EducationPickerType) {
    if (!activeEducationDraft) {
      return
    }

    setEducationPickerType(type)
    if (type === 'degree') {
      setEducationPickerDegree(activeEducationDraft.degree || '本科')
      return
    }

    const periodValue = type === 'startPeriod' ? activeEducationDraft.startPeriod : activeEducationDraft.endPeriod
    const { month, year } = splitPeriodValue(periodValue)
    setEducationPickerYear(year || '2022')
    setEducationPickerMonth(month || '09')
  }

  function closeEducationPicker() {
    setEducationPickerType('')
    setEducationPickerDegree('')
    setEducationPickerYear('')
    setEducationPickerMonth('')
  }

  function confirmEducationPicker() {
    if (!activeEducationDraft || !educationPickerType) {
      return
    }

    if (educationPickerType === 'degree') {
      updateEducationDraft(activeEducationDraft.id, { degree: educationPickerDegree })
    } else {
      updateEducationDraft(activeEducationDraft.id, {
        [educationPickerType]: mergePeriodValue(educationPickerYear, educationPickerMonth),
      })
    }
    closeEducationPicker()
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
  const editingWork = workExperiences.find((item) => item.id === editingWorkId)
  const editingListTitle =
    editingListType === 'skills' ? '技能标签' : editingListType === 'certificates' ? '证书或奖项' : ''
  const activeProjectDraft = projectDrafts.find((draft) => draft.id === activeProjectDraftId)
  const projectPickerTitle = projectPickerType === 'startPeriod' ? '项目开始时间' : '项目结束时间'
  const activeEducationDraft = educationDrafts.find((draft) => draft.id === activeEducationDraftId)
  const viewingEducation = education.find((item) => item.id === viewingEducationId)
  const educationPickerTitle =
    educationPickerType === 'degree' ? '学历' : educationPickerType === 'startPeriod' ? '入学时间' : '毕业时间'

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
            <button
              aria-label="编辑教育经历"
              className="resume-panel-edit resume-panel-edit--title"
              title="编辑"
              type="button"
              onClick={openEducationEditor}
            >
              <EditIcon />
            </button>
          </div>
          <EducationFocusBrowser items={education} onViewDescription={(item) => setViewingEducationId(item.id)} />
        </section>

        <div className="resume-side-stack">
          <section className="panel">
            <div className="panel__header">
              <div>
                <h2>技能标签</h2>
                <p className="panel__copy">用于生成专项题卡和训练复盘维度。</p>
              </div>
              <button
                aria-label="编辑技能标签"
                className="resume-panel-edit"
                title="编辑"
                type="button"
                onClick={() => openListEditor('skills')}
              >
                <EditIcon />
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
              <button
                aria-label="编辑证书或奖项"
                className="resume-panel-edit"
                title="编辑"
                type="button"
                onClick={() => openListEditor('certificates')}
              >
                <EditIcon />
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
            <button
              aria-label="编辑项目经历"
              className="resume-panel-edit"
              title="编辑"
              type="button"
              onClick={openProjectEditor}
            >
              <EditIcon />
            </button>
          </div>
          <ProjectList items={projects} />
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

      {isEditingProjects && activeProjectDraft ? (
        <div className="resume-modal-backdrop">
          <form
            aria-labelledby="project-editor-title"
            aria-modal="true"
            className="resume-project-editor resume-education-editor"
            role="dialog"
            onSubmit={handleProjectSave}
          >
            <div className="resume-project-editor__header">
              <div>
                <p id="project-editor-title">编辑项目经历</p>
                <span>维护结构化信息，项目概述和标签由 Riva 根据原文生成</span>
              </div>
            </div>

            <div className="resume-education-editor__body">
              <div className="resume-education-editor__nav" aria-label="选择项目经历">
                {projectDrafts.map((draft, index) => (
                  <button
                    aria-pressed={draft.id === activeProjectDraft.id}
                    className={`resume-education-editor__nav-item${
                      draft.id === activeProjectDraft.id ? ' resume-education-editor__nav-item--active' : ''
                    }`}
                    key={draft.id}
                    type="button"
                    onClick={() => setActiveProjectDraftId(draft.id)}
                  >
                    {getProjectDraftLabel(draft, index)}
                  </button>
                ))}
                <button
                  aria-label="新增项目经历"
                  className="resume-education-editor__add"
                  type="button"
                  onClick={addProjectDraft}
                >
                  +
                </button>
              </div>

              <div className="resume-education-editor__form" onFocusCapture={handleStructuredEditorTextFocus}>
                <label className="form-field">
                  项目名称
                  <input
                    placeholder="请填写项目名称"
                    value={activeProjectDraft.name}
                    onChange={(event) => updateProjectDraft(activeProjectDraft.id, { name: event.target.value })}
                  />
                </label>

                <label className="form-field">
                  担任角色
                  <input
                    placeholder="请填写担任角色"
                    value={activeProjectDraft.role}
                    onChange={(event) => updateProjectDraft(activeProjectDraft.id, { role: event.target.value })}
                  />
                </label>

                <div className="resume-education-editor__periods">
                  <div className="form-field">
                    开始时间
                    <button
                      className={`resume-education-editor__field-button${
                        activeProjectDraft.startPeriod ? '' : ' resume-education-editor__field-button--empty'
                      }`}
                      type="button"
                      onClick={() => openProjectPicker('startPeriod')}
                    >
                      {activeProjectDraft.startPeriod || '请选择'}
                    </button>
                  </div>

                  <div className="form-field">
                    结束时间
                    <button
                      className={`resume-education-editor__field-button${
                        activeProjectDraft.endPeriod ? '' : ' resume-education-editor__field-button--empty'
                      }`}
                      type="button"
                      onClick={() => openProjectPicker('endPeriod')}
                    >
                      {activeProjectDraft.endPeriod || '请选择'}
                    </button>
                  </div>
                </div>

                <label className="form-field">
                  项目描述
                  <textarea
                    className="resume-project-editor__textarea resume-project-editor__textarea--compact"
                    placeholder="请填写项目描述"
                    value={activeProjectDraft.sourceText}
                    onChange={(event) =>
                      updateProjectDraft(activeProjectDraft.id, { sourceText: event.target.value })
                    }
                  />
                </label>

                <button
                  className="resume-education-editor__delete"
                  type="button"
                  onClick={() => deleteProjectDraft(activeProjectDraft.id)}
                >
                  删除这段项目经历
                </button>
              </div>
            </div>

            <div className="resume-project-editor__actions">
              <button className="button button--secondary" type="button" onClick={closeProjectEditor}>
                取消
              </button>
              <button className="button button--primary" type="submit">
                确认
              </button>
            </div>
          </form>

          {projectPickerType ? (
            <div className="education-picker-sheet" role="dialog" aria-label={`选择${projectPickerTitle}`}>
              <div className="education-picker-sheet__header">
                <button type="button" onClick={closeProjectPicker}>
                  取消
                </button>
                <strong>{projectPickerTitle}</strong>
                <button type="button" onClick={confirmProjectPicker}>
                  确定
                </button>
              </div>
              <div className="wheel-picker-group">
                <WheelPicker
                  label={`选择${projectPickerTitle}年份`}
                  options={PERIOD_YEARS}
                  value={projectPickerYear}
                  onChange={setProjectPickerYear}
                />
                <WheelPicker
                  label={`选择${projectPickerTitle}月份`}
                  options={PERIOD_MONTHS}
                  value={projectPickerMonth}
                  onChange={setProjectPickerMonth}
                />
              </div>
            </div>
          ) : null}
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

      {isEditingEducation && activeEducationDraft ? (
        <div className="resume-modal-backdrop">
          <form
            aria-labelledby="education-editor-title"
            aria-modal="true"
            className="resume-project-editor resume-education-editor"
            role="dialog"
            onSubmit={handleEducationSave}
          >
            <div className="resume-project-editor__header">
              <div>
                <p id="education-editor-title">编辑教育经历</p>
                <span>维护学校、时间、专业和在校经历</span>
              </div>
            </div>

            <div className="resume-education-editor__body">
              <div className="resume-education-editor__nav" aria-label="选择教育经历">
                {educationDrafts.map((draft, index) => (
                  <button
                    aria-pressed={draft.id === activeEducationDraft.id}
                    className={`resume-education-editor__nav-item${
                      draft.id === activeEducationDraft.id ? ' resume-education-editor__nav-item--active' : ''
                    }`}
                    key={draft.id}
                    type="button"
                    onClick={() => setActiveEducationDraftId(draft.id)}
                  >
                    {getEducationDraftLabel(draft, index)}
                  </button>
                ))}
                <button
                  aria-label="新增教育经历"
                  className="resume-education-editor__add"
                  type="button"
                  onClick={addEducationDraft}
                >
                  +
                </button>
              </div>

              <div className="resume-education-editor__form" onFocusCapture={handleStructuredEditorTextFocus}>
                <label className="form-field">
                  学校
                  <input
                    placeholder="请填写学校"
                    value={activeEducationDraft.organization}
                    onChange={(event) =>
                      updateEducationDraft(activeEducationDraft.id, { organization: event.target.value })
                    }
                  />
                </label>

                <div className="form-field">
                  学历
                  <button
                    className={`resume-education-editor__field-button${
                      activeEducationDraft.degree ? '' : ' resume-education-editor__field-button--empty'
                    }`}
                    type="button"
                    onClick={() => openEducationPicker('degree')}
                  >
                    {activeEducationDraft.degree || '请选择'}
                  </button>
                </div>

                <label className="form-field">
                  就读专业
                  <input
                    placeholder="请填写就读专业"
                    value={activeEducationDraft.title}
                    onChange={(event) => updateEducationDraft(activeEducationDraft.id, { title: event.target.value })}
                  />
                </label>

                <div className="resume-education-editor__periods">
                  <div className="form-field">
                    入学时间
                    <button
                      className={`resume-education-editor__field-button${
                        activeEducationDraft.startPeriod ? '' : ' resume-education-editor__field-button--empty'
                      }`}
                      type="button"
                      onClick={() => openEducationPicker('startPeriod')}
                    >
                      {activeEducationDraft.startPeriod || '请选择'}
                    </button>
                  </div>

                  <div className="form-field">
                    毕业时间
                    <button
                      className={`resume-education-editor__field-button${
                        activeEducationDraft.endPeriod ? '' : ' resume-education-editor__field-button--empty'
                      }`}
                      type="button"
                      onClick={() => openEducationPicker('endPeriod')}
                    >
                      {activeEducationDraft.endPeriod || '请选择'}
                    </button>
                  </div>
                </div>

                <label className="form-field">
                  在校经历
                  <textarea
                    className="resume-project-editor__textarea resume-project-editor__textarea--compact"
                    placeholder="请填写在校经历"
                    value={activeEducationDraft.description}
                    onChange={(event) =>
                      updateEducationDraft(activeEducationDraft.id, { description: event.target.value })
                    }
                  />
                </label>

                <button
                  className="resume-education-editor__delete"
                  type="button"
                  onClick={() => deleteEducationDraft(activeEducationDraft.id)}
                >
                  删除这段教育经历
                </button>
              </div>
            </div>

            <div className="resume-project-editor__actions">
              <button className="button button--secondary" type="button" onClick={closeEducationEditor}>
                取消
              </button>
              <button className="button button--primary" type="submit">
                确认
              </button>
            </div>
          </form>

          {educationPickerType ? (
            <div className="education-picker-sheet" role="dialog" aria-label={`选择${educationPickerTitle}`}>
              <div className="education-picker-sheet__header">
                <button type="button" onClick={closeEducationPicker}>
                  取消
                </button>
                <strong>{educationPickerTitle}</strong>
                <button type="button" onClick={confirmEducationPicker}>
                  确定
                </button>
              </div>

              {educationPickerType === 'degree' ? (
                <WheelPicker
                  label="选择学历"
                  options={EDUCATION_DEGREES}
                  value={educationPickerDegree}
                  onChange={setEducationPickerDegree}
                />
              ) : (
                <div className="wheel-picker-group">
                  <WheelPicker
                    label={`选择${educationPickerTitle}年份`}
                    options={PERIOD_YEARS}
                    value={educationPickerYear}
                    onChange={setEducationPickerYear}
                  />
                  <WheelPicker
                    label={`选择${educationPickerTitle}月份`}
                    options={PERIOD_MONTHS}
                    value={educationPickerMonth}
                    onChange={setEducationPickerMonth}
                  />
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {viewingEducation ? (
        <div className="resume-modal-backdrop">
          <section
            aria-labelledby="education-viewer-title"
            aria-modal="true"
            className="resume-project-editor resume-education-viewer"
            role="dialog"
          >
            <div className="resume-project-editor__header">
              <div>
                <p id="education-viewer-title">在校经历</p>
                <span>{viewingEducation.organization}</span>
              </div>
            </div>
            <p className="resume-education-viewer__copy">{viewingEducation.description}</p>
            <div className="resume-project-editor__actions">
              <button className="button button--primary" type="button" onClick={() => setViewingEducationId('')}>
                关闭
              </button>
            </div>
          </section>
        </div>
      ) : null}

    </div>
  )
}
