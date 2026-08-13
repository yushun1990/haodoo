import { useEffect, useState } from 'react'

type InstallChoice = {
  outcome: 'accepted' | 'dismissed'
  platform: string
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<InstallChoice>
}

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean
}

type InstallGuideKind = 'ios' | 'firefox-android' | 'android' | 'generic'

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as NavigatorWithStandalone).standalone === true
  )
}

function isCatalogRoute(): boolean {
  return window.location.hash === '' || window.location.hash === '#'
}

function installGuideKind(): InstallGuideKind {
  const ua = navigator.userAgent
  const isIOS =
    /iPad|iPhone|iPod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

  if (isIOS) return 'ios'
  if (/Android/i.test(ua) && /Firefox/i.test(ua)) return 'firefox-android'
  if (/Android/i.test(ua)) return 'android'
  return 'generic'
}

function InstallGuide({ kind, onClose }: { kind: InstallGuideKind; onClose: () => void }) {
  const content = {
    ios: {
      title: '在 iPhone / iPad 上安装',
      steps: ['打开浏览器的分享菜单。', '选择「添加到主屏幕」。'],
      note: '添加后，从主屏幕图标打开 Haodoo，会以独立 Web App 方式运行。',
    },
    'firefox-android': {
      title: '在 Firefox 中安装',
      steps: ['点 Firefox 的 ⋮ 菜单。', '选择「安装」，再确认添加到主屏幕。'],
      note: 'Firefox 支持安装 Web App，但目前不会让网页直接弹出安装确认框。',
    },
    android: {
      title: '添加 Haodoo 到设备',
      steps: [
        '打开当前浏览器的菜单。',
        '寻找「安装应用」「添加到主屏幕」或「添加到桌面」。',
      ],
      note: '不同 Android 浏览器的安装方式不同；有些浏览器只会创建网页快捷方式。',
    },
    generic: {
      title: '安装 Haodoo',
      steps: ['打开浏览器菜单。', '寻找「安装应用」「添加到主屏幕」或类似选项。'],
      note: '当前浏览器没有提供网页可直接调用的安装接口。',
    },
  }[kind]

  return (
    <div className="install-guide-backdrop" onClick={onClose}>
      <section
        className="install-guide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-guide-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="install-guide__close" type="button" onClick={onClose} aria-label="关闭安装说明">
          ×
        </button>
        <div className="install-guide__mark" aria-hidden="true">
          好
        </div>
        <h2 id="install-guide-title">{content.title}</h2>
        <ol>
          {content.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="install-guide__note">{content.note}</p>
        <button className="install-guide__done" type="button" onClick={onClose}>
          知道了
        </button>
      </section>
    </div>
  )
}

export function InstallButton() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent>()
  const [installed, setInstalled] = useState(isStandalone)
  const [onCatalog, setOnCatalog] = useState(isCatalogRoute)
  const [guideOpen, setGuideOpen] = useState(false)

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setPromptEvent(event as BeforeInstallPromptEvent)
    }

    const onAppInstalled = () => {
      setInstalled(true)
      setPromptEvent(undefined)
      setGuideOpen(false)
    }

    const onHashChange = () => setOnCatalog(isCatalogRoute())

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)
    window.addEventListener('hashchange', onHashChange)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
      window.removeEventListener('hashchange', onHashChange)
    }
  }, [])

  useEffect(() => {
    if (!guideOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setGuideOpen(false)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [guideOpen])

  if (installed || !onCatalog) return null

  const install = async () => {
    const currentPrompt = promptEvent

    if (!currentPrompt) {
      setGuideOpen(true)
      return
    }

    setPromptEvent(undefined)

    try {
      await currentPrompt.prompt()
      const choice = await currentPrompt.userChoice
      if (choice.outcome === 'accepted') {
        setInstalled(true)
      } else {
        setGuideOpen(true)
      }
    } catch (error) {
      console.warn('PWA install prompt failed', error)
      setGuideOpen(true)
    }
  }

  return (
    <>
      <button className="install-pwa-button" type="button" onClick={() => void install()}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3v11m0 0 4-4m-4 4-4-4M5 18v2h14v-2" />
        </svg>
        <span>安装</span>
      </button>
      {guideOpen && <InstallGuide kind={installGuideKind()} onClose={() => setGuideOpen(false)} />}
    </>
  )
}
