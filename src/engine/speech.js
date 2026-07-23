/**
 * Web Speech API — Text-to-Speech
 * Language codes map from our internal language IDs to BCP-47 tags.
 */

const LANG_CODES = {
  zh: 'zh-CN',
  ja: 'ja-JP',
  de: 'de-DE',
  es: 'es-ES',
  fr: 'fr-FR',
  en: 'en-US',
}

export function isSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

// Voices often aren't available synchronously on first call — most browsers
// load them asynchronously and fire 'voiceschanged' once ready. Without
// waiting for that, getVoices() can return an empty array even on a device
// that has plenty installed, especially on the very first call after page load.
let _cachedVoices = null
let _voicesPromise = null
export function getVoices() {
  if (!isSupported()) return Promise.resolve([])
  if (_cachedVoices) return Promise.resolve(_cachedVoices)
  if (_voicesPromise) return _voicesPromise
  _voicesPromise = new Promise(resolve => {
    const existing = window.speechSynthesis.getVoices()
    if (existing.length > 0) { _cachedVoices = existing; resolve(existing); return }
    const onChange = () => {
      const voices = window.speechSynthesis.getVoices()
      if (voices.length > 0) {
        window.speechSynthesis.removeEventListener('voiceschanged', onChange)
        _cachedVoices = voices
        resolve(voices)
      }
    }
    window.speechSynthesis.addEventListener('voiceschanged', onChange)
    // Some browsers never fire voiceschanged if there simply are no voices —
    // don't hang forever waiting for one.
    setTimeout(() => {
      window.speechSynthesis.removeEventListener('voiceschanged', onChange)
      resolve(window.speechSynthesis.getVoices())
    }, 2000)
  })
  return _voicesPromise
}

/** Voices matching a given internal language code (by BCP-47 prefix, e.g. 'de' matches 'de-DE'/'de-AT'). */
export async function getVoicesForLanguage(language) {
  const voices = await getVoices()
  const prefix = (LANG_CODES[language] ?? '').split('-')[0]
  return voices.filter(v => v.lang.toLowerCase().startsWith(prefix.toLowerCase()))
}

function applyVoice(utterance, language, voiceURI, voices) {
  if (!voiceURI) return
  const match = voices.find(v => v.voiceURI === voiceURI)
  if (!match) return  // stored preference no longer exists on this device — fall back to lang-only default
  try {
    utterance.voice = match
  } catch {
    // Some engines can reject a voice reference (stale list, cross-origin
    // voice restrictions, etc.) — better to still speak with the plain
    // lang-only utterance than to let this throw and silently drop the
    // whole utterance.
  }
}

/**
 * Speak text in the given language.
 * @param {string} text - The text to speak
 * @param {string} language - Internal language code (zh, ja, de, es, en)
 * @param {object} options - Optional overrides: rate (0.1–2), pitch (0–2), voiceURI
 */
export function speak(text, language, options = {}) {
  if (!isSupported() || !text) return
  // Cancel any current speech first
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang  = LANG_CODES[language] ?? 'zh-CN'
  utterance.rate  = options.rate  ?? 0.9   // slightly slower than default for learners
  utterance.pitch = options.pitch ?? 1.0
  if (options.voiceURI && !_cachedVoices) {
    // Voices haven't loaded yet at all (rare — usually resolved well before
    // anyone taps a speak button, since Settings/Listening call getVoices()
    // eagerly). Falling back to async here risks missing the synchronous
    // user-gesture window some browsers (notably iOS Safari) require for
    // speechSynthesis.speak() to actually play — but no voice preference
    // can be honored yet either way if we haven't loaded the list, so
    // speaking with the plain lang-only utterance now is the better trade.
    window.speechSynthesis.speak(utterance)
    return
  }
  if (options.voiceURI) applyVoice(utterance, language, options.voiceURI, _cachedVoices)
  window.speechSynthesis.speak(utterance)
}

/**
 * Same as speak(), but returns a Promise that resolves once the utterance
 * finishes (or immediately if unsupported/empty) — needed for sequencing
 * several utterances back-to-back (e.g. word → translation → example
 * sentence in the Listening game) without stepping on each other, since
 * speak() calls speechSynthesis.cancel() on every call and would cut off
 * anything still in progress.
 */
export async function speakAndWait(text, language, options = {}) {
  if (!isSupported() || !text) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang  = LANG_CODES[language] ?? 'zh-CN'
  utterance.rate  = options.rate  ?? 0.9
  utterance.pitch = options.pitch ?? 1.0
  if (options.voiceURI) {
    const voices = await getVoices()
    applyVoice(utterance, language, options.voiceURI, voices)
  }
  await new Promise(resolve => {
    utterance.onend = () => resolve()
    utterance.onerror = () => resolve()  // don't let a TTS glitch hang the whole sequence
    window.speechSynthesis.speak(utterance)
  })
}

export function stop() {
  if (isSupported()) window.speechSynthesis.cancel()
}
