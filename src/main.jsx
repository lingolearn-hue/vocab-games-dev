import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { installZoomGuard } from './engine/zoomGuard'
import { getVoices } from './engine/speech'

installZoomGuard()
// Warm the voices cache as early as possible, so by the time anyone taps a
// speak button the synchronous fast-path in speech.js's speak() can be used
// (some browsers require speechSynthesis.speak() to be called synchronously
// within the user-gesture handler or it gets silently ignored).
getVoices()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
