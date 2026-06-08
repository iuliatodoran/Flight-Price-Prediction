import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabaseClient"
import { useAuth } from "../lib/AuthContext"
import Nav from "../components/Nav"
import "./Home.css"

const RATES = { INR: 1, EUR: 0.011, RON: 0.054 }

const AIRLINE_LABELS = { "Air_India": "Air India", "GO_FIRST": "GO FIRST", "Indigo": "IndiGo" }
const airlineLabel = a => AIRLINE_LABELS[a] || a

function formatDate(ts) {
  return new Date(ts).toLocaleDateString("ro-RO", { day: "numeric", month: "short" })
}

function formatMoney(x, currency = "RON") {
  if (!x && x !== 0) return "—"
  const converted = x * RATES[currency]
  return new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 }).format(converted) + " " + currency
}

export default function Favorites() {
  const navigate = useNavigate()
  const { user, loading } = useAuth()
  const [favorites, setFavorites] = useState([])
  const [fetching, setFetching] = useState(true)
  const [alertModal, setAlertModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [currency, setCurrency] = useState("RON")

  useEffect(() => {
    if (!user) { setFetching(false); return }
    supabase
      .from("favorites")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setFavorites(data || [])
        setFetching(false)
      })
  }, [user])

  async function deleteFavorite(id) {
    setFavorites(prev => prev.filter(f => f.id !== id))
    await supabase.from("favorites").delete().eq("id", id)
  }

  async function saveAlert() {
    if (!alertModal?.targetPrice) return
    setSaving(true)
    const threshold = Math.round(Number(alertModal.targetPrice) / RATES[currency])
    await supabase.from("favorites")
      .update({ price_threshold: threshold })
      .eq("id", alertModal.fav.id)
    setFavorites(prev => prev.map(f =>
      f.id === alertModal.fav.id ? { ...f, price_threshold: threshold } : f
    ))
    setSaving(false)
    setAlertModal(null)
  }

  if (loading || fetching) {
    return (
      <div className="home">
        <Nav active="favorites" />
        <div style={{ padding: "80px 32px", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: "13px" }}>
          Se încarcă...
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="home">
        <Nav active="favorites" />
        <div style={{ padding: "80px 32px", textAlign: "center" }}>
          <div style={{ fontSize: "40px", marginBottom: "16px", opacity: 0.3 }}>♡</div>
          <div style={{ fontSize: "16px", color: "rgba(255,255,255,0.5)", marginBottom: "8px" }}>
            Nu ai zboruri salvate
          </div>
          <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.25)", marginBottom: "32px" }}>
            Conectează-te pentru a salva și urmări zboruri favorite.
          </div>
          <button onClick={() => navigate("/auth")} style={{
            background: "#4f8ef7", border: "none", borderRadius: "10px",
            padding: "10px 24px", color: "#fff", fontSize: "13px",
            fontWeight: 500, cursor: "pointer", fontFamily: "inherit"
          }}>
            Conectare
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="home">
      <Nav active="favorites" />

      {alertModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 100, backdropFilter: "blur(4px)"
        }}>
          <div style={{
            background: "#0d1526", border: "0.5px solid rgba(255,255,255,0.1)",
            borderRadius: "20px", padding: "32px", width: "100%", maxWidth: "360px"
          }}>
            <div style={{ fontSize: "16px", fontWeight: 500, marginBottom: "4px" }}>
              Alertă preț — {airlineLabel(alertModal.fav.airline)}
            </div>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.35)", marginBottom: "24px" }}>
              {alertModal.fav.source_city} → {alertModal.fav.destination_city} · {alertModal.fav.class}
            </div>
            <div className="field-group" style={{ marginBottom: "20px" }}>
              <div className="field-label">Alertă când prețul scade sub ({currency})</div>
              <input
                className="field-input"
                type="number"
                placeholder={`ex: ${Math.round(4500 * RATES[currency])}`}
                value={alertModal.targetPrice}
                onChange={e => setAlertModal(prev => ({ ...prev, targetPrice: e.target.value }))}
                autoFocus
              />
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={() => setAlertModal(null)}
                style={{
                  flex: 1, background: "transparent",
                  border: "0.5px solid rgba(255,255,255,0.1)",
                  borderRadius: "10px", padding: "10px", color: "rgba(255,255,255,0.5)",
                  fontSize: "13px", cursor: "pointer", fontFamily: "inherit"
                }}
              >
                Anulează
              </button>
              <button
                onClick={saveAlert}
                disabled={saving || !alertModal.targetPrice}
                style={{
                  flex: 1, background: "#4f8ef7", border: "none",
                  borderRadius: "10px", padding: "10px", color: "#fff",
                  fontSize: "13px", fontWeight: 500, cursor: "pointer",
                  fontFamily: "inherit",
                  opacity: (!alertModal.targetPrice || saving) ? 0.5 : 1
                }}
              >
                {saving ? "Se salvează..." : "Setează alertă"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: "32px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
          <div>
            <div style={{ fontSize: "20px", fontWeight: 500 }}>Zboruri favorite</div>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)", marginTop: "4px" }}>
              {favorites.length} {favorites.length === 1 ? "zbor salvat" : "zboruri salvate"}
            </div>
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            {["EUR", "RON"].map(c => (
              <button key={c} onClick={() => setCurrency(c)} style={{
                background: currency === c ? "rgba(79,142,247,0.12)" : "rgba(255,255,255,0.04)",
                border: `0.5px solid ${currency === c ? "rgba(79,142,247,0.3)" : "rgba(255,255,255,0.1)"}`,
                borderRadius: "6px", padding: "5px 12px",
                color: currency === c ? "#7eaafc" : "rgba(255,255,255,0.4)",
                fontSize: "12px", cursor: "pointer", fontFamily: "inherit"
              }}>{c}</button>
            ))}
          </div>
        </div>

        {favorites.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: "40px", opacity: 0.2, marginBottom: "12px" }}>♡</div>
            <div style={{ fontSize: "14px", color: "rgba(255,255,255,0.35)", marginBottom: "20px" }}>
              Nu ai salvat niciun zbor încă.
            </div>
            <button onClick={() => navigate("/")} style={{
              background: "rgba(79,142,247,0.1)", border: "0.5px solid rgba(79,142,247,0.2)",
              borderRadius: "10px", padding: "10px 20px", color: "#7eaafc",
              fontSize: "13px", cursor: "pointer", fontFamily: "inherit"
            }}>
              Caută un zbor
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {favorites.map(fav => (
              <div key={fav.id} style={{
                background: "rgba(255,255,255,0.02)",
                border: "0.5px solid rgba(255,255,255,0.07)",
                borderRadius: "14px", padding: "18px 20px",
                display: "flex", alignItems: "center", gap: "16px"
              }}>
                <div style={{ flex: "0 0 160px" }}>
                  <div style={{ fontSize: "14px", fontWeight: 500 }}>{airlineLabel(fav.airline)}</div>
                  <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", marginTop: "3px" }}>{fav.class}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.6)" }}>
                    {fav.source_city} → {fav.destination_city}
                  </div>
                  <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.2)", marginTop: "3px" }}>
                    Salvat {formatDate(fav.created_at)}
                  </div>
                </div>
                {fav.price_threshold ? (
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", marginBottom: "2px" }}>ALERTĂ</div>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "#7eaafc" }}>
                      {formatMoney(fav.price_threshold, currency)}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.2)" }}>fără alertă</div>
                )}
                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    onClick={() => navigate("/flights", { state: { source_city: fav.source_city, destination_city: fav.destination_city, class: fav.class } })}
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "0.5px solid rgba(255,255,255,0.08)",
                      borderRadius: "7px", padding: "5px 10px",
                      color: "rgba(255,255,255,0.35)", fontSize: "11px",
                      cursor: "pointer", fontFamily: "inherit"
                    }}
                  >
                    ↗ Caută
                  </button>
                  <button
                    onClick={() => setAlertModal({ fav, targetPrice: fav.price_threshold ? Math.round(fav.price_threshold * RATES[currency]) : "" })}
                    style={{
                      background: fav.price_threshold ? "rgba(79,142,247,0.1)" : "rgba(255,255,255,0.03)",
                      border: `0.5px solid ${fav.price_threshold ? "rgba(79,142,247,0.25)" : "rgba(255,255,255,0.08)"}`,
                      borderRadius: "7px", padding: "5px 10px",
                      color: fav.price_threshold ? "#7eaafc" : "rgba(255,255,255,0.3)",
                      fontSize: "11px", cursor: "pointer", fontFamily: "inherit"
                    }}
                  >
                    🔔 {fav.price_threshold ? "Modifică" : "Alertă"}
                  </button>
                  <button
                    onClick={() => deleteFavorite(fav.id)}
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "0.5px solid rgba(255,255,255,0.08)",
                      borderRadius: "7px", padding: "5px 10px",
                      color: "rgba(255,255,255,0.3)", fontSize: "11px",
                      cursor: "pointer", fontFamily: "inherit"
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
