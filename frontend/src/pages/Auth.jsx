import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabaseClient"
import { useAuth } from "../lib/AuthContext"
import Nav from "../components/Nav"
import "./Home.css"

export default function Auth() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [mode, setMode] = useState("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [registered, setRegistered] = useState(false)

  useEffect(() => {
    if (user) navigate("/")
  }, [user])

  async function handleSubmit() {
    setError("")
    setLoading(true)
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        navigate("/")
      } else {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setRegistered(true)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="home">
      <Nav />

      <div style={{ display: "flex", justifyContent: "center", padding: "64px 32px" }}>
        <div style={{
          background: "rgba(255,255,255,0.02)",
          border: "0.5px solid rgba(255,255,255,0.08)",
          borderRadius: "20px",
          padding: "40px",
          width: "100%",
          maxWidth: "380px",
        }}>
          {registered ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "32px", marginBottom: "16px" }}>✉️</div>
              <div style={{ fontSize: "18px", fontWeight: 500, marginBottom: "8px" }}>
                Verifică-ți emailul
              </div>
              <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)", marginBottom: "24px", lineHeight: 1.6 }}>
                Am trimis un link de confirmare la<br />
                <strong style={{ color: "rgba(255,255,255,0.7)" }}>{email}</strong>
              </div>
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.25)", marginBottom: "24px" }}>
                După confirmare, te poți conecta.
              </div>
              <button
                onClick={() => { setRegistered(false); setMode("login"); setPassword("") }}
                style={{
                  background: "rgba(79,142,247,0.1)", border: "0.5px solid rgba(79,142,247,0.2)",
                  borderRadius: "10px", padding: "10px 24px", color: "#7eaafc",
                  fontSize: "13px", cursor: "pointer", fontFamily: "inherit"
                }}
              >
                Mergi la Conectare
              </button>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: "28px" }}>
                <div style={{ fontSize: "20px", fontWeight: 500, marginBottom: "6px" }}>
                  {mode === "login" ? "Bun venit înapoi" : "Creează cont"}
                </div>
                <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.35)" }}>
                  {mode === "login"
                    ? "Conectează-te pentru a accesa prețurile tale salvate."
                    : "Înregistrează-te pentru a salva zboruri și alerte."}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>
                <div className="field-group">
                  <div className="field-label">Email</div>
                  <input
                    className="field-input"
                    type="email"
                    placeholder="email@exemplu.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                  />
                </div>
                <div className="field-group">
                  <div className="field-label">Parolă</div>
                  <input
                    className="field-input"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleSubmit()}
                  />
                </div>
              </div>

              {error && (
                <div style={{
                  background: "rgba(226,75,74,0.1)",
                  border: "0.5px solid rgba(226,75,74,0.25)",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  fontSize: "13px",
                  color: "#e24b4a",
                  marginBottom: "12px"
                }}>
                  {error}
                </div>
              )}

              <button
                className="search-btn"
                style={{ marginBottom: "16px" }}
                onClick={handleSubmit}
                disabled={loading}
              >
                {loading ? "Se procesează..." : mode === "login" ? "Conectare" : "Înregistrare"}
              </button>

              <div style={{ textAlign: "center", fontSize: "12px", color: "rgba(255,255,255,0.3)" }}>
                {mode === "login" ? "Nu ai cont? " : "Ai deja cont? "}
                <span
                  style={{ color: "#7eaafc", cursor: "pointer" }}
                  onClick={() => { setMode(mode === "login" ? "register" : "login"); setError("") }}
                >
                  {mode === "login" ? "Înregistrează-te" : "Conectează-te"}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
