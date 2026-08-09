import { useState, useEffect, useRef } from 'react'
import { generateQuestion } from '../engine/grammarQuiz'
import './QuizOverlay.css'

const AUTO_ADVANCE_MS = 700

/**
 * Lightweight practice overlay for a single grammar point — an open-ended
 * run of auto-generated multiple-choice questions. Distinct from Grammar
 * Trainer's full exercise flow: no category/type navigation, no persisted
 * score history, just quick in-place practice for whichever grammar point
 * you tapped. There's no round limit — it keeps going for as long as the
 * user wants; they stop it themselves (✕ or "Stop") whenever they're done,
 * and see a running tally either way. A wrong pick turns that option red
 * and stays on the same question — other options remain pickable — so the
 * user keeps retrying until they get it right. A correct answer auto-
 * advances to the next question after a brief "correct" flash.
 */
export default function QuizOverlay({ quizType, title, level, vocabEntries, onClose }) {
  const [round, setRound] = useState(1)
  const [question, setQuestion] = useState(() => generateQuestion(quizType, vocabEntries, level))
  const [wrongOptions, setWrongOptions] = useState([])
  const [feedback, setFeedback] = useState(null) // null | 'correct' | 'wrong'
  const [correctCount, setCorrectCount] = useState(0)
  const [stopped, setStopped] = useState(false)
  const answered = round - 1 // rounds fully completed so far
  const advanceTimer = useRef(null)

  useEffect(() => () => clearTimeout(advanceTimer.current), [])

  function choose(option) {
    if (feedback === 'correct' || wrongOptions.includes(option)) return
    const isCorrect = option === question.correctAnswer
    if (isCorrect) {
      setFeedback('correct')
      setCorrectCount(c => c + 1)
      advanceTimer.current = setTimeout(next, AUTO_ADVANCE_MS)
    } else {
      setFeedback('wrong')
      setWrongOptions(w => [...w, option])
    }
  }

  function next() {
    setRound(r => r + 1)
    setWrongOptions([])
    setFeedback(null)
    setQuestion(generateQuestion(quizType, vocabEntries, level))
  }

  function playAgain() {
    setRound(1)
    setCorrectCount(0)
    setWrongOptions([])
    setFeedback(null)
    setStopped(false)
    setQuestion(generateQuestion(quizType, vocabEntries, level))
  }

  if (!question) {
    return (
      <div className="qo-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
        <div className="qo-panel">
          <div className="qo-header">
            <span className="qo-title">{title}</span>
            <button className="qo-close" onClick={onClose}>✕</button>
          </div>
          <p className="qo-empty">Not enough vocab loaded to practise this right now.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="qo-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="qo-panel">
        <div className="qo-header">
          <span className="qo-title">{title}</span>
          <button className="qo-close" onClick={onClose}>✕</button>
        </div>

        {!stopped ? (
          <>
            <div className="qo-progress">Round {round} · {correctCount} correct</div>
            <div className="qo-prompt">{question.prompt}</div>
            <div className="qo-options">
              {question.options.map(opt => {
                const isWrongPick = wrongOptions.includes(opt)
                const isCorrectPick = feedback === 'correct' && opt === question.correctAnswer
                const cls = isCorrectPick ? 'correct' : isWrongPick ? 'wrong' : ''
                return (
                  <button
                    key={opt}
                    className={`qo-option ${cls}`}
                    onClick={() => choose(opt)}
                    disabled={feedback === 'correct' || isWrongPick}
                  >
                    {opt}
                  </button>
                )
              })}
            </div>
            {feedback === 'wrong' && (
              <div className="qo-round-actions">
                <span className="qo-feedback-msg qo-feedback-wrong">Not quite — try again</span>
                <button className="qo-stop-btn" onClick={() => { clearTimeout(advanceTimer.current); setStopped(true) }}>Stop</button>
              </div>
            )}
          </>
        ) : (
          <div className="qo-summary">
            <div className="qo-summary-score">{correctCount} / {answered}</div>
            <p className="qo-summary-label">correct</p>
            <div className="qo-summary-actions">
              <button className="qo-again-btn" onClick={playAgain}>↺ Play again</button>
              <button className="qo-done-btn" onClick={onClose}>Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
