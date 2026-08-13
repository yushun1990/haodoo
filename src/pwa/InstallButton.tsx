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

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as NavigatorWithStandalone).standalone === true
  )
}

function isCatalogRoute(): boolean {
  return window.location.hash === '' || window.location.hash === '#'
}

export function InstallButton() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent>()
  const [installed, setInstalled] = useState(isStandalone)
  const [onCatalog, setOnCatalog] = useState(isCatalogRoute)

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setPromptEvent(event as BeforeInstallPromptEvent)
    }

    const onAppInstalled = () => {
      setInstalled(true)
      setPromptEvent(undefined)
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

  if (installed || !onCatalog || !promptEvent) return null

  const install = async () => {
    const currentPrompt = promptEvent
    setPromptEvent(undefined)

    try {
      await currentPrompt.prompt()
      const choice = await currentPrompt.userChoice
      if (choice.outcome === 'accepted') setInstalled(true)
    } catch (error) {
      console.warn('PWA install prompt failed', error)
    }
  }

  return (
    <button className="install-pwa-button" type="button" onClick={() => void install()}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v11m0 0 4-4m-4 4-4-4M5 18v2h14v-2" />
      </svg>
      <span>安装 Haodoo</span>
    </button>
  )
}
