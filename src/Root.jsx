import { useEffect, useState } from 'react'
import App from './App.jsx'
import Welcome from './Welcome.jsx'
import ArcherApp from './ArcherApp.jsx'
import { t } from './i18n'
import { account, loadRole, finishLinkSignIn, configured, awayTooLong, markSeen, signOut } from './sync'
import { myLink, inviteFrom } from './archer'
import { getUi, setUi, appRole } from './ui'
import { watchDigits } from './digits'

// Who is using this device decides which app opens: the coach's, the archer's, or the welcome screen that asks.
export default function Root() {
  const [lang, setLangState] = useState(() => (getUi().lang === 'ar' ? 'ar' : 'en'))
  const setLang = (l) => { setUi({ lang: l }); setLangState(l) }
  const [, setTick] = useState(0)
  const again = () => setTick((n) => n + 1)
  const [open, setOpen] = useState('') // the coach arrives on their profile after an emailed link
  const [ready, setReady] = useState(false)
  useEffect(() => watchDigits(lang), [lang, ready])
  useEffect(() => { // back after more than 45 minutes away: signed out (the device lock and the data stay as they are)
    const back = () => { if (awayTooLong()) signOut(); markSeen() }
    const shown = () => (document.visibilityState === 'hidden' ? markSeen() : back())
    const beat = setInterval(() => document.visibilityState === 'visible' && markSeen(), 60_000)
    document.addEventListener('visibilitychange', shown)
    window.addEventListener('pagehide', () => markSeen())
    return () => { clearInterval(beat); document.removeEventListener('visibilitychange', shown) }
  }, [])
  useEffect(() => { // arriving from an emailed link (confirm address, reset password): the account says whose app this is
    const away = awayTooLong()
    markSeen()
    const invite = inviteFrom(location.search) // opened from a coach's invite link or QR code
    if (invite) { setUi({ invite, role: 'archer' }); history.replaceState(null, '', location.pathname + location.hash) };
    (away ? signOut() : Promise.resolve()).then(finishLinkSignIn)
      .then(async (r) => { if (r === true) { if ((await loadRole()) === 'coach') setOpen('settings') } else if (r) window.alert(r) })
      .catch((e) => console.warn('Sign-in link failed', e))
      .finally(() => setReady(true))
  }, [])
  useEffect(() => { // signed out (here, on another device, or the session ran out): back to the sign-in page
    window.addEventListener('racm-signed-out', again)
    return () => window.removeEventListener('racm-signed-out', again)
  }, [])
  if (!ready) return null
  const tr = t[lang], who = appRole(configured)
  if (who === 'archer') {
    return account() && myLink()
      ? <ArcherApp tr={tr} lang={lang} setLang={setLang} onLeft={again} />
      : <Welcome tr={tr} lang={lang} setLang={setLang} start="archer" onDone={again} />
  }
  if (who === 'coach') return <App tr={tr} lang={lang} setLang={setLang} open={open} />
  return <Welcome tr={tr} lang={lang} setLang={setLang} start={getUi().role === 'archer' ? 'archer' : getUi().role === 'coach' ? 'coach' : ''} onDone={again} />
}
