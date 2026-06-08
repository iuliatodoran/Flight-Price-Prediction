import { useState, useRef, useEffect } from "react"
import "./ChatWidget.css"

const API_BASE = "http://127.0.0.1:8000"

const SUGGESTIONS = [
  "Când e mai ieftin să zbor din Delhi spre Mumbai?",
  "Cu cât timp înainte ar trebui să cumpăr un bilet din Bangalore spre Chennai?",
  "Care e cel mai bun moment pentru un zbor Business din Hyderabad spre Kolkata?",
]

export default function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "Salut! Sunt asistentul AI SkyTiming. Întreabă-mă orice despre cel mai bun moment să cumperi un bilet — de exemplu „Când e mai eficient să cumpăr bilet spre Mumbai din Delhi?”.",
    },
  ])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading, open])

  async function sendMessage(text) {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    setMessages(prev => [...prev, { role: "user", text: trimmed }])
    setInput("")
    setLoading(true)

    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, { role: "assistant", text: data.reply }])
    } catch {
      setMessages(prev => [...prev, {
        role: "assistant",
        text: "Nu am putut contacta asistentul AI. Verifică dacă backend-ul rulează și încearcă din nou.",
      }])
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    sendMessage(input)
  }

  return (
    <div className="chat-widget">
      {open && (
        <div className="chat-panel">
          <div className="chat-header">
            <div className="chat-title">
              <span className="chat-icon">✦</span> Asistent AI
            </div>
            <button className="chat-close" onClick={() => setOpen(false)} aria-label="Închide">×</button>
          </div>

          <div className="chat-messages" ref={scrollRef}>
            {messages.map((m, i) => (
              <div key={i} className={`chat-bubble ${m.role}`}>{m.text}</div>
            ))}
            {loading && (
              <div className="chat-bubble assistant chat-typing">
                <span /><span /><span />
              </div>
            )}
            {messages.length === 1 && (
              <div className="chat-suggestions">
                {SUGGESTIONS.map((s, i) => (
                  <button key={i} className="chat-suggestion" onClick={() => sendMessage(s)}>{s}</button>
                ))}
              </div>
            )}
          </div>

          <form className="chat-input-row" onSubmit={handleSubmit}>
            <input
              className="chat-input"
              type="text"
              placeholder="Scrie o întrebare despre prețuri..."
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={loading}
            />
            <button className="chat-send" type="submit" disabled={loading || !input.trim()}>→</button>
          </form>
        </div>
      )}

      <button className="chat-toggle" onClick={() => setOpen(o => !o)} aria-label="Deschide asistentul AI">
        {open ? "×" : "✦"}
      </button>
    </div>
  )
}
