import { useState } from 'react'
import {
  CHALLENGE_TYPES, FLAVORS, typeLabel, challengeKey,
  getState, changeTask, changeFlavor, acceptChallenge,
  cancelChallenge, finishChallenge, markTodayDone, toggleFavorite, pickTask,
} from '../engine/dailyChallenge'
import { getExamples } from '../engine/dailyChallengeExamples'
import './DailyChallenge.css'

const TABS = [
  { id: 'today',     label: 'Task of the day', icon: '☀️' },
  { id: 'open',      label: 'Open challenges',  icon: '📋' },
  { id: 'grid',      label: 'Browse all',       icon: '🗓️' },
  { id: 'favorites', label: 'Favorite tasks',   icon: '⭐' },
]

export default function DailyChallenge({ lang, onClose }) {
  const [tab, setTab] = useState('today')
  const [state, setState] = useState(() => getState(lang))
  const [flavorSpinning, setFlavorSpinning] = useState(false)

  const todayKey = challengeKey(state.todayType, state.todayFlavorIndex)
  const todayFlavor = FLAVORS[state.todayType]?.[state.todayFlavorIndex] ?? ''
  const todayExamples = getExamples(state.todayType, state.todayFlavorIndex, lang)
  const todayIsOpen = !!state.open[todayKey]
  const todayIsFavorite = !!state.favorites[todayKey]

  function handleChangeTask() {
    setState(changeTask(lang))
  }

  function handleChangeFlavor() {
    setFlavorSpinning(true)
    setTimeout(() => {
      setState(changeFlavor(lang))
      setFlavorSpinning(false)
    }, 550) // matches CSS orb-glow animation duration
  }

  function handleAccept() {
    setState(acceptChallenge(lang, state.todayType, state.todayFlavorIndex))
  }

  function handleMarkDone() {
    setState(markTodayDone(lang))
  }

  function handleToggleFavorite(key) {
    setState(toggleFavorite(lang, key))
  }

  function handleCancelOpen(key) {
    setState(cancelChallenge(lang, key))
  }

  function handleFinishOpen(key) {
    setState(finishChallenge(lang, key))
  }

  const openList = Object.entries(state.open) // [key, {typeId, flavorIndex, acceptedAt}]
  const favoriteList = Object.keys(state.favorites)

  return (
    <div className="dc-screen" onClick={onClose}>
      <div className="dc-panel" onClick={e => e.stopPropagation()}>
        <button className="dc-close" onClick={onClose}>✕</button>
        <h1 className="dc-title">Daily Challenge</h1>
        <p className="dc-subtitle">Real-world practice — no phone, no checking, no pressure.</p>

        <div className="dc-body">
          <div className="dc-rail">
            {TABS.map(t => (
              <button
                key={t.id}
                className={`dc-rail-btn ${tab === t.id ? 'active' : ''}`}
                onClick={() => setTab(t.id)}
                title={t.label}
              >
                <span className="dc-rail-icon">{t.icon}</span>
                <span className="dc-rail-label">{t.label}</span>
              </button>
            ))}
          </div>

          <div className="dc-content">
            {tab === 'today' && (
              <div className="dc-today">
                <div className="dc-today-type">{typeLabel(state.todayType)}</div>
                <div className={`dc-today-flavor ${flavorSpinning ? 'dc-orb-active' : ''}`}>
                  {flavorSpinning
                    ? <span className="dc-orb"><span className="dc-orb-glow" /></span>
                    : <span>{todayFlavor}</span>}
                </div>

                {!flavorSpinning && todayExamples.length > 0 && (
                  <div className="dc-examples">
                    {todayExamples.map((ex, i) => (
                      <div key={i} className="dc-example-line">{ex}</div>
                    ))}
                  </div>
                )}

                <div className="dc-today-actions">
                  <button className="dc-btn dc-btn-ghost" onClick={handleChangeTask}>Change task</button>
                  <button className="dc-btn dc-btn-ghost" onClick={handleChangeFlavor} disabled={flavorSpinning}>
                    Change flavor
                  </button>
                </div>

                <div className="dc-today-main-actions">
                  <button
                    className={`dc-star ${todayIsFavorite ? 'on' : ''}`}
                    onClick={() => handleToggleFavorite(todayKey)}
                    title="Favorite this challenge"
                  >★</button>
                  {!todayIsOpen && (
                    <button className="dc-btn dc-btn-primary" onClick={handleAccept}>Accept challenge</button>
                  )}
                  {todayIsOpen && (
                    <span className="dc-accepted-badge">Accepted — find it in Open challenges</span>
                  )}
                  <button className="dc-btn dc-btn-primary" onClick={handleMarkDone}>Mark done</button>
                </div>

                {state.counts[todayKey] > 0 && (
                  <div className="dc-done-count">Completed {state.counts[todayKey]}× before</div>
                )}
              </div>
            )}

            {tab === 'open' && (
              <div className="dc-list">
                {openList.length === 0 && <p className="dc-empty">No open challenges. Accept today's task to add one.</p>}
                {openList.map(([key, item]) => (
                  <div key={key} className="dc-list-row">
                    <div className="dc-list-row-text">
                      <div className="dc-list-row-type">{typeLabel(item.typeId)}</div>
                      <div className="dc-list-row-flavor">{FLAVORS[item.typeId]?.[item.flavorIndex]}</div>
                      {getExamples(item.typeId, item.flavorIndex, lang).map((ex, i) => (
                        <div key={i} className="dc-example-line dc-example-line-small">{ex}</div>
                      ))}
                    </div>
                    <div className="dc-list-row-actions">
                      <button className="dc-btn dc-btn-small" onClick={() => handleFinishOpen(key)}>Finished</button>
                      <button className="dc-btn dc-btn-small dc-btn-ghost" onClick={() => handleCancelOpen(key)}>Cancel</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === 'grid' && (
              <div className="dc-grid-wrap">
                <div className="dc-grid">
                  {CHALLENGE_TYPES.map(type => (
                    <div key={type.id} className="dc-grid-col">
                      <div className="dc-grid-col-header">{type.weekday}<br /><span>{type.label}</span></div>
                      {FLAVORS[type.id].map((flavor, idx) => {
                        const key = challengeKey(type.id, idx)
                        const isFav = !!state.favorites[key]
                        const count = state.counts[key] || 0
                        return (
                          <button
                            key={key}
                            className={`dc-grid-cell ${isFav ? 'dc-grid-cell-fav' : ''}`}
                            onClick={() => { setState(pickTask(lang, type.id, idx)); setTab('today') }}
                            title={flavor}
                          >
                            <span className="dc-grid-cell-text">{flavor}</span>
                            {count > 0 && <span className="dc-grid-cell-count">×{count}</span>}
                          </button>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === 'favorites' && (
              <div className="dc-list">
                {favoriteList.length === 0 && <p className="dc-empty">No favorites yet. Tap the star on a challenge to save it here.</p>}
                {favoriteList.map(key => {
                  const [typeId, flavorIndexStr] = key.split('::')
                  const flavorIndex = Number(flavorIndexStr)
                  const count = state.counts[key] || 0
                  return (
                    <div key={key} className="dc-list-row">
                      <div className="dc-list-row-text">
                        <div className="dc-list-row-type">{typeLabel(typeId)}</div>
                        <div className="dc-list-row-flavor">{FLAVORS[typeId]?.[flavorIndex]}</div>
                        {count > 0 && <div className="dc-done-count">Completed {count}×</div>}
                      </div>
                      <div className="dc-list-row-actions">
                        <button className="dc-btn dc-btn-small dc-btn-ghost" onClick={() => handleToggleFavorite(key)}>Unfavorite</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
