import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { LockGate } from './DeviceLock'
import Root from './Root.jsx'
import { exportBackup } from './storage'
import { recordError } from './errors'

class ErrorBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error) { recordError(error, 'screen') }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="screen" style={{ padding: 24 }}>
        <h2>Something went wrong · حدث خطأ ما</h2>
        <p>Your data is still on this device. · بياناتك ما زالت محفوظة على هذا الجهاز.</p>
        <div className="btn-row">
          <button className="btn-ghost" onClick={exportBackup}>Download backup · تنزيل نسخة احتياطية</button>
          <button className="btn-primary" onClick={() => window.location.reload()}>Reload · إعادة التحميل</button>
        </div>
      </div>
    )
  }
}

window.addEventListener('error', (e) => recordError(e, 'page'))
window.addEventListener('unhandledrejection', (e) => recordError(e, 'promise'))

// Asks the browser not to evict athlete data when disk space runs low.
navigator.storage?.persist?.()

// Offline use when hosted. Not for the single-file copy (file://) or the dev server.
if (import.meta.env.PROD && location.protocol.startsWith('http')) navigator.serviceWorker?.register('./sw.js')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LockGate>
      <ErrorBoundary>
        <Root />
      </ErrorBoundary>
    </LockGate>
  </StrictMode>,
)
