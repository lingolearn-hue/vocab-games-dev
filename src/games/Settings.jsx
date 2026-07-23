import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import { leitnerStorageKeys } from '../engine/leitner'
import { isSupported as speechSupported, getVoicesForLanguage } from '../engine/speech'
import './Settings.css'

const VOICE_LANGS = [
  { code: 'zh', label: 'Chinese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'de', label: 'German' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'en', label: 'English' },
]

export default function Settings() {
  const { setScreen, goBack, settings, updateSettings } = useApp()

  const [voicesByLang, setVoicesByLang] = useState({})
  const [voicesLoading, setVoicesLoading] = useState(true)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') setScreen('setup') }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.all(VOICE_LANGS.map(async l => [l.code, await getVoicesForLanguage(l.code)]))
      .then(pairs => {
        if (cancelled) return
        setVoicesByLang(Object.fromEntries(pairs))
        setVoicesLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const cfg = settings

  function set(path, value) {
    updateSettings(s => {
      const parts = path.split('.')
      if (parts.length === 1) return { ...s, [path]: value }
      if (parts.length === 2) return { ...s, [parts[0]]: { ...s[parts[0]], [parts[1]]: value } }
      return s
    })
  }

  const BACKUP_KEYS = ['vocabScores', 'vocabSettings', 'vocabMnemonics', 'vocabMnemonicsSeeded', 'grammarScores', 'activeLanguage', 'rc-high', 'adventureProgress', 'vocabCustomPassage', ...leitnerStorageKeys()]

  function exportBackup() {
    const data = {}
    for (const key of BACKUP_KEYS) {
      const val = localStorage.getItem(key)
      if (val !== null) data[key] = val
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `vocab-games-backup-${new Date().toISOString().slice(0,10)}.json`
    a.click(); URL.revokeObjectURL(url)
  }

  function importBackup() {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = '.json'
    input.onchange = async e => {
      const file = e.target.files[0]; if (!file) return
      try {
        const text = await file.text()
        const data = JSON.parse(text)
        if (!confirm(`Import backup from ${file.name}? This will overwrite current progress.`)) return
        for (const [key, val] of Object.entries(data)) {
          if (BACKUP_KEYS.includes(key)) localStorage.setItem(key, val)
        }
        window.location.reload()
      } catch { alert('Invalid backup file.') }
    }
    input.click()
  }

  function resetAllScores() {
    if (!confirm('Reset ALL scores? This cannot be undone.')) return
    localStorage.removeItem('vocabScores')
    localStorage.removeItem('grammarScores')
    localStorage.removeItem('rc-high')
    localStorage.removeItem('adventureProgress')
    for (const key of leitnerStorageKeys()) localStorage.removeItem(key)
    window.location.reload()
  }

  return (
    <div className="st-screen">
      <div className="st-header">
        <button className="st-back" onClick={goBack}>← Back</button>
        <span className="st-title">Settings</span>
      </div>

      <div className="st-body">

        {/* ── Appearance ── */}
        <div className="st-row st-row--padded">
          <span className="st-label">Appearance</span>
          <div className="st-seg">
            {['auto', 'light', 'dark'].map(v => (
              <button key={v} className={`st-seg-btn ${cfg.darkMode === v ? 'active' : ''}`}
                onClick={() => set('darkMode', v)}>
                {v === 'auto' ? 'Auto' : v === 'light' ? '☀️' : '🌙'}
              </button>
            ))}
          </div>
        </div>

        {/* ── Voice ── */}
        <div className="st-section-label">Voice</div>
        {!speechSupported() ? (
          <p className="st-help-text">
            Text-to-speech isn't available on this device, so voice selection doesn't apply here.
          </p>
        ) : voicesLoading ? (
          <p className="st-help-text">Loading available voices…</p>
        ) : Object.values(voicesByLang).every(v => v.length === 0) ? (
          <p className="st-help-text">
            No installed text-to-speech voices were detected on this device.
          </p>
        ) : (
          <>
            {VOICE_LANGS.filter(l => (voicesByLang[l.code]?.length ?? 0) > 0).map(l => (
              <div className="st-row st-row--padded" key={l.code}>
                <span className="st-label">{l.label}</span>
                <select
                  className="st-voice-select"
                  value={cfg.voicePreferences?.[l.code] ?? ''}
                  onChange={e => set(`voicePreferences.${l.code}`, e.target.value || null)}
                >
                  <option value="">Default</option>
                  {voicesByLang[l.code].map(v => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name}{v.localService ? '' : ' (network)'}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <p className="st-help-text">
              Only languages with at least one installed voice are shown. "Default" lets the browser pick automatically.
            </p>
          </>
        )}

        {/* ── Data ── */}
        <div className="st-section-label">Data</div>
        <div className="st-row--padded">
          <div className="st-data-btns">
            <button className="st-data-btn" onClick={exportBackup}>⬇ Export backup</button>
            <button className="st-data-btn" onClick={importBackup}>⬆ Import backup</button>
          </div>
          <button className="st-danger-btn" onClick={resetAllScores}>Reset all scores</button>
        </div>

      </div>
    </div>
  )
}
