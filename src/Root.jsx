import { useEffect, useState } from 'react'
import App from './App.jsx'
import Welcome from './Welcome.jsx'
import ArcherApp from './ArcherApp.jsx'
import { t } from './i18n'
import { account, role, finishLinkSignIn } from './sync'
import { myLink } from './archer'
import { getUi, setUi, appRole } from './ui'

// Who is using this device decides which app opens: the coach's, the archer's, or the welcome screen that asks.
export default function Root() {
  const [lang, setLangState] = useState(() => (getUi().lang === 'ar' ? 'ar' : 'en'))
  const setLang = (l) => { setUi({ lang: l }); setLangState(l) }
  const [, setTick] = useState(0)
  const again = () => setTick((n) => n + 1)
  const [open, setOpen] = useState('') // the coach arrives on their profile after an emailed link
  const [ready, setReady] = useState(false)
  useEffect(() => { // arriving from an emailed link (confirm address, reset password): the account says whose app this is
    finishLinkSignIn()
      .then((r) => { if (r === true) { setUi({ role: role() }); if (role() === 'coach') setOpen('settings') } else if (r) window.alert(r) })
      .catch((e) => console.warn('Sign-in link failed', e))
      .finally(() => setReady(true))
  }, [])
  if (!ready) return null
  const tr = t[lang], who = appRole()
  if (who === 'archer') {
    return account() && myLink()
      ? <ArcherApp tr={tr} lang={lang} setLang={setLang} onLeft={again} />
      : <Welcome tr={tr} lang={lang} setLang={setLang} start="archer" onDone={again} />
  }
  if (who === 'coach') return <App tr={tr} lang={lang} setLang={setLang} open={open} />
  return <Welcome tr={tr} lang={lang} setLang={setLang} onDone={again} />
}
