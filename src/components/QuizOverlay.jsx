import { useState, useEffect, useMemo } from 'react'
import { generateQuestion } from '../engine/grammarQuiz'
import './QuizOverlay.css'

const ROUNDS = 5

/**
 * Lightweight practice overlay for a single grammar point — a short run of
 * ROUNDS auto-generated multiple-choice questions, then a summary. Distinct
 * from GrammarTrainer's full exercise flow: no category/type navigation, no
 * persisted score history, just quick in-place practice for whichever
 * grammar point you tapped. Closing early is always fine — this is meant to
 * be a low-friction supplement, not a session you have to finish.
 */
export default function QuizOverlay({ quizType, title, vocabEntries, onClose }) {
  const [round, setRound] = useState(0)
  const [question, setQuestion] = useState(() => generateQuestion(quizType, vocabEntries))
  const [selected, setSelected] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const [correctCount, setCorrectCount] = useState(0)
  const done = round >= ROUNDS

  function choose(option) {
    if (feedback) return
    setSelected(option)
    const isCorrect = option === question.correctAnswer
    setFeedback(isCorrect ? 'correct' : 'wrong')
    if (isCorrect) setCorrectCount(c => c + 1)
  }

  function next() {
    const nextRound = round + 1
    setRound(nextRound)
    setSelected(null)
    setFeedback(null)
    if (nextRound < ROUNDS) {
      setQuestion(generateQuestion(quizType, vocabEntries))
    }
  }

  function playAgain() {
    setRound(0)
    setCorrectCount(0)
    setSelected(null)
    setFeedback(null)
    setQuestion(generateQuestion(quizType, vocabEntries))
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

        {!done ? (
          <>
            <div className="qo-progress">{round + 1} / {ROUNDS}</div>
            <div className="qo-prompt">{question.prompt}</div>
            <div className="qo-options">
              {question.options.map(opt => {
                const isSelected = selected === opt
                const isCorrectOpt = feedback && opt === question.correctAnswer
                const cls = feedback
                  ? (isCorrectOpt ? 'correct' : isSelected ? 'wrong' : '')
                  : ''
                return (
                  <button
                    key={opt}
                    className={`qo-option ${cls}`}
                    onClick={() => choose(opt)}
                    disabled={!!feedback}
                  >
                    {opt}
                  </button>
                )
              })}
            </div>
            {feedback && (
              <button className="qo-next-btn" onClick={next}>
                {round + 1 < ROUNDS ? 'Next →' : 'See results →'}
              </button>
            )}
          </>
        ) : (
          <div className="qo-summary">
            <div className="qo-summary-score">{correctCount} / {ROUNDS}</div>
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
