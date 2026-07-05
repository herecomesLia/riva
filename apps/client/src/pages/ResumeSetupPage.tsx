import { useEffect, useState } from 'react'
import { getResumeSetup, parseResume } from '../services/resume.service'
import type { AsyncState } from '../types/api'
import type { ResumeSetupGuide } from '../types/resume'

type ResumeSetupPageProps = {
  onOpenProfile: () => void
}

function isEmptySetup(data: ResumeSetupGuide) {
  return data.profile === null && data.status === 'not_started'
}

export function ResumeSetupPage({ onOpenProfile }: ResumeSetupPageProps) {
  const [state, setState] = useState<AsyncState<ResumeSetupGuide>>({ status: 'loading' })
  const [resumeText, setResumeText] = useState('')
  const [fileName, setFileName] = useState('')
  const [parseError, setParseError] = useState('')
  const [isParsing, setIsParsing] = useState(false)

  function loadSetup() {
    setState({ status: 'loading' })
    setParseError('')

    getResumeSetup()
      .then((data) => {
        setResumeText(data.sampleText)
        setState(isEmptySetup(data) ? { status: 'empty' } : { status: 'success', data })
      })
      .catch((error) => {
        setState({ status: 'error', error: error instanceof Error ? error.message : '简历录入信息加载失败' })
      })
  }

  useEffect(() => {
    loadSetup()
  }, [])

  async function handleParse() {
    setIsParsing(true)
    setParseError('')

    try {
      const { profile } = await parseResume({
        source: fileName ? 'upload' : 'paste',
        text: resumeText.trim() || undefined,
        fileName: fileName || undefined,
      })

      if (state.status === 'success' || state.status === 'empty') {
        const nextData: ResumeSetupGuide = {
          ...(state.status === 'success'
            ? state.data
            : {
                status: 'parsed' as const,
                acceptedFormats: [],
                sampleText: resumeText,
                steps: [],
                profile: null,
              }),
          status: 'parsed',
          profile,
        }
        setState({ status: 'success', data: nextData })
      }
    } catch (error) {
      setParseError(error instanceof Error ? error.message : '简历解析失败')
    } finally {
      setIsParsing(false)
    }
  }

  if (state.status === 'loading' || state.status === 'idle') {
    return (
      <div className="dashboard-state" role="status">
        正在加载简历录入流程...
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="dashboard-state dashboard-state--error" role="alert">
        <h1>简历录入加载失败</h1>
        <p>{state.error}</p>
        <button className="button button--primary" type="button" onClick={loadSetup}>
          重试
        </button>
      </div>
    )
  }

  const data = state.status === 'success' ? state.data : null
  const acceptedFormats = data?.acceptedFormats ?? []
  const steps = data?.steps ?? []

  return (
    <div className="resume-page" aria-labelledby="resume-setup-title">
      <header className="page-header page-header--setup">
        <div className="page-header__content">
          <p className="eyebrow">求职档案录入</p>
          <h1 className="resume-setup-title" id="resume-setup-title">
            上传或粘贴简历，生成结构化档案
          </h1>
          <p>Riva 会识别基础信息、教育经历、工作经历、项目经历、技能标签和求职方向。</p>
        </div>
        <div className="page-header__actions">
          <button className="button button--primary" type="button" onClick={onOpenProfile}>
            查看档案
          </button>
        </div>
      </header>

      <div className="resume-setup-grid">
        <section className="panel resume-input-panel">
          <div className="panel__header">
            <div>
              <h2>简历来源</h2>
              <p className="panel__copy">上传文件或粘贴文本，Riva 会识别结构化档案内容。</p>
            </div>
          </div>

          <label className="resume-dropzone">
            <span>{fileName || '选择简历文件'}</span>
            <small>{acceptedFormats.length > 0 ? `支持 ${acceptedFormats.join(' / ')}` : '支持常见简历文档和文本'}</small>
            <input
              aria-label="选择简历文件"
              type="file"
              accept=".pdf,.doc,.docx,.txt"
              onChange={(event) => setFileName(event.currentTarget.files?.[0]?.name ?? '')}
            />
          </label>

          <label className="form-field">
            粘贴简历文本
            <textarea
              className="resume-textarea"
              value={resumeText}
              placeholder="粘贴你的简历内容，或使用示例文本测试解析流程。"
              onChange={(event) => setResumeText(event.target.value)}
            />
          </label>

          {parseError ? (
            <div className="form-error" role="alert">
              {parseError}
            </div>
          ) : null}

          <button className="button button--primary button--full" type="button" disabled={isParsing} onClick={handleParse}>
            {isParsing ? '正在解析...' : '识别并生成档案'}
          </button>
        </section>

        <aside className="panel resume-step-panel" aria-label="录入流程">
          <div className="panel__header">
            <div>
              <h2>录入流程</h2>
              <p className="panel__copy">解析后请确认关键信息，再保存为后续训练上下文。</p>
            </div>
          </div>

          {steps.length > 0 ? (
            <ol className="resume-step-list">
              {steps.map((step) => (
                <li className={`resume-step resume-step--${step.status}`} key={step.id}>
                  <span aria-hidden="true" />
                  <div>
                    <strong>{step.title}</strong>
                    <p>{step.description}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="panel--empty">暂无流程数据</p>
          )}
        </aside>
      </div>

    </div>
  )
}
