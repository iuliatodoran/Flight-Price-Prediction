import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabaseClient"
import { useAuth } from "../lib/AuthContext"
import Nav from "../components/Nav"
import "./Home.css"

const API_BASE = "http://127.0.0.1:8000"
const RATES = { INR: 1, EUR: 0.011, RON: 0.054 }

const AIRLINE_LABELS = { "Air_India": "Air India", "GO_FIRST": "GO FIRST", "Indigo": "IndiGo" }
const airlineLabel = a => AIRLINE_LABELS[a] || a

const AIRLINE_DEFAULTS = {
  "Vistara":   { stops: "zero",        departure_time: "Morning",       arrival_time: "Afternoon", duration: 2.0 },
  "Indigo":    { stops: "one",         departure_time: "Evening",       arrival_time: "Night",     duration: 3.5 },
  "Air India": { stops: "zero",        departure_time: "Early_Morning", arrival_time: "Morning",   duration: 2.2 },
  "SpiceJet":  { stops: "one",         departure_time: "Morning",       arrival_time: "Evening",   duration: 4.0 },
  "GO FIRST":  { stops: "two_or_more", departure_time: "Afternoon",     arrival_time: "Night",     duration: 5.5 },
  "AirAsia":   { stops: "one",         departure_time: "Night",         arrival_time: "Morning",   duration: 6.0 },
}

function formatMoney(x, currency = "RON") {
  if (!x && x !== 0) return "—"
  const converted = x * RATES[currency]
  return new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 }).format(converted) + " " + currency
}

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime()
  const d = Math.floor(diff / 86400000)
  if (d === 0) return "azi"
  if (d === 1) return "ieri"
  return `acum ${d} zile`
}

export default function Notifications() {
  const navigate = useNavigate()
  const { user, loading } = useAuth()
  const [alerts, setAlerts] = useState([])
  const [fetching, setFetching] = useState(true)
  const [currentPrices, setCurrentPrices] = useState({})
  const [daysMap, setDaysMap] = useState({})

  useEffect(() => {
    if (!user) { setFetching(false); return }
    supabase
      .from("favorites")
      .select("*")
      .eq("user_id", user.id)
      .not("price_threshold", "is", null)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setAlerts(data || [])
        setFetching(false)
      })
  }, [user])

  async function removeAlert(id) {
    await supabase.from("favorites").update({ price_threshold: null }).eq("id", id)
    setAlerts(prev => prev.filter(a => a.id !== id))
  }

  async function checkPrice(alert) {
    const days = daysMap[alert.id] ?? 30
    setCurrentPrices(prev => ({ ...prev, [alert.id]: { loading: true } }))
    const defaults = AIRLINE_DEFAULTS[alert.airline] || AIRLINE_DEFAULTS["Indigo"]
    try {
      const res = await fetch(`${API_BASE}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          features: {
            airline: alert.airline,
            flight: "",
            source_city: alert.source_city,
            destination_city: alert.destination_city,
            departure_time: defaults.departure_time,
            arrival_time: defaults.arrival_time,
            stops: defaults.stops,
            class: alert.class,
            duration: defaults.duration,
            days_left: days,
            flight_date: "",
          },
        }),
      })
      const data = await res.json()
      setCurrentPrices(prev => ({ ...prev, [alert.id]: { price: data.predicted_price, days } }))
    } catch {
      setCurrentPrices(prev => ({ ...prev, [alert.id]: { error: true } }))
    }
  }

  if (loading || fetching) {
    return (
      <div className="home">
        <Nav active="notifications" />
        <div style={{ padding: "80px 32px", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: "13px" }}>
          Se încarcă...
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="home">
        <Nav active="notifications" />
        <div style={{ padding: "80px 32px", textAlign: "center" }}>
          <div style={{ fontSize: "40px", marginBottom: "16px", opacity: 0.3 }}>🔔</div>
          <div style={{ fontSize: "16px", color: "rgba(255,255,255,0.5)", marginBottom: "8px" }}>
            Nicio alertă activă
          </div>
          <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.25)", marginBottom: "32px" }}>
            Conectează-te, salvează un zbor favorit și setează un preț țintă.
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
      <Nav active="notifications" />

      <div style={{ padding: "32px" }}>
        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontSize: "20px", fontWeight: 500 }}>Alerte de preț</div>
          <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)", marginTop: "4px" }}>
            {alerts.length} {alerts.length === 1 ? "alertă activă" : "alerte active"}
          </div>
        </div>

        {alerts.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: "40px", opacity: 0.2, marginBottom: "12px" }}>🔔</div>
            <div style={{ fontSize: "14px", color: "rgba(255,255,255,0.35)", marginBottom: "8px" }}>
              Nu ai alerte de preț setate.
            </div>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.2)", marginBottom: "24px" }}>
              Salvează un zbor din pagina Zboruri, apoi setează o alertă din Favorite.
            </div>
            <button onClick={() => navigate("/favorites")} style={{
              background: "rgba(79,142,247,0.1)", border: "0.5px solid rgba(79,142,247,0.2)",
              borderRadius: "10px", padding: "10px 20px", color: "#7eaafc",
              fontSize: "13px", cursor: "pointer", fontFamily: "inherit"
            }}>
              Mergi la Favorite
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {alerts.map(alert => {
              const cp = currentPrices[alert.id]
              const triggered = cp?.price !== undefined && cp.price <= alert.price_threshold
              return (
                <div key={alert.id} style={{
                  background: triggered ? "rgba(34,197,94,0.03)" : "rgba(255,255,255,0.02)",
                  border: `0.5px solid ${triggered ? "rgba(34,197,94,0.25)" : "rgba(255,255,255,0.07)"}`,
                  borderRadius: "14px", padding: "20px"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      {triggered && (
                        <div style={{ marginBottom: "6px" }}>
                          <span style={{
                            background: "rgba(34,197,94,0.12)", border: "0.5px solid rgba(34,197,94,0.3)",
                            borderRadius: "4px", padding: "2px 8px", fontSize: "10px", color: "#22c55e",
                            letterSpacing: "0.5px"
                          }}>
                            ȚINTĂ ATINSĂ
                          </span>
                        </div>
                      )}
                      <div style={{ fontSize: "14px", fontWeight: 500 }}>
                        {airlineLabel(alert.airline)} · {alert.source_city} → {alert.destination_city}
                      </div>
                      <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)", marginTop: "3px" }}>
                        {alert.class} · {timeAgo(alert.created_at)}
                      </div>
                    </div>
                    <button
                      onClick={() => removeAlert(alert.id)}
                      style={{
                        background: "none", border: "none",
                        color: "rgba(255,255,255,0.2)", cursor: "pointer",
                        fontSize: "16px", padding: "0 4px", lineHeight: 1
                      }}
                    >
                      ✕
                    </button>
                  </div>

                  <div style={{
                    display: "flex", alignItems: "center", gap: "24px",
                    marginTop: "16px", paddingTop: "16px",
                    borderTop: "0.5px solid rgba(255,255,255,0.05)"
                  }}>
                    <div>
                      <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", marginBottom: "4px", letterSpacing: "0.5px" }}>
                        PREȚ ȚINTĂ
                      </div>
                      <div style={{ fontSize: "18px", fontWeight: 600, color: "#7eaafc" }}>
                        {formatMoney(alert.price_threshold, "RON")}
                      </div>
                    </div>

                    <div style={{ color: "rgba(255,255,255,0.12)", fontSize: "18px" }}>→</div>

                    {cp ? (
                      cp.loading ? (
                        <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.3)" }}>Se verifică...</div>
                      ) : cp.error ? (
                        <div style={{ fontSize: "12px", color: "rgba(255,100,100,0.5)" }}>
                          Backend indisponibil
                        </div>
                      ) : (
                        <div>
                          <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", marginBottom: "4px", letterSpacing: "0.5px" }}>
                            PREȚ ACTUAL · {cp.days}Z ÎNAINTE
                          </div>
                          <div style={{ fontSize: "18px", fontWeight: 600, color: triggered ? "#22c55e" : "#e8eaf0" }}>
                            {formatMoney(cp.price, "RON")}
                          </div>
                          {triggered ? (
                            <div style={{ fontSize: "11px", color: "#22c55e", marginTop: "2px" }}>
                              ✓ Prețul a scăzut sub țintă!
                            </div>
                          ) : (
                            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.2)", marginTop: "2px" }}>
                              +{formatMoney(Math.round(cp.price - alert.price_threshold), "RON")} față de țintă
                            </div>
                          )}
                        </div>
                      )
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", letterSpacing: "0.5px" }}>
                          ZILE PÂNĂ LA ZBOR
                        </div>
                        <div style={{ display: "flex", gap: "5px" }}>
                          {[7, 14, 30].map(d => (
                            <button
                              key={d}
                              onClick={() => setDaysMap(prev => ({ ...prev, [alert.id]: d }))}
                              style={{
                                background: (daysMap[alert.id] ?? 30) === d ? "rgba(79,142,247,0.15)" : "rgba(255,255,255,0.04)",
                                border: `0.5px solid ${(daysMap[alert.id] ?? 30) === d ? "rgba(79,142,247,0.35)" : "rgba(255,255,255,0.08)"}`,
                                borderRadius: "6px", padding: "4px 10px",
                                color: (daysMap[alert.id] ?? 30) === d ? "#7eaafc" : "rgba(255,255,255,0.35)",
                                fontSize: "11px", cursor: "pointer", fontFamily: "inherit"
                              }}
                            >
                              {d}z
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => checkPrice(alert)}
                          style={{
                            background: "rgba(79,142,247,0.08)",
                            border: "0.5px solid rgba(79,142,247,0.2)",
                            borderRadius: "8px", padding: "7px 16px",
                            color: "#7eaafc", fontSize: "12px",
                            cursor: "pointer", fontFamily: "inherit"
                          }}
                        >
                          Verifică preț acum
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
