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
  "Air_India": { stops: "zero",        departure_time: "Early_Morning", arrival_time: "Morning",   duration: 2.2 },
  "SpiceJet":  { stops: "one",         departure_time: "Morning",       arrival_time: "Evening",   duration: 4.0 },
  "GO_FIRST":  { stops: "two_or_more", departure_time: "Afternoon",     arrival_time: "Night",     duration: 5.5 },
  "AirAsia":   { stops: "one",         departure_time: "Night",         arrival_time: "Morning",   duration: 6.0 },
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString("ro-RO", { day: "numeric", month: "short", year: "numeric" })
}

function formatMoney(x, currency = "RON") {
  if (x == null) return "—"
  const converted = x * RATES[currency]
  return new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 }).format(converted) + " " + currency
}

function stopsLabel(s) {
  if (s === "zero") return "Direct"
  if (s === "one") return "1 escală"
  return "2+ escale"
}

function timeLabel(t) {
  return t ? t.replace(/_/g, " ") : "—"
}

function daysLeftFromDate(flightDate) {
  if (!flightDate) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.max(0, Math.round((new Date(flightDate) - today) / 86400000))
}

export default function Favorites() {
  const navigate = useNavigate()
  const { user, loading } = useAuth()
  const [favorites, setFavorites] = useState([])
  const [fetching, setFetching] = useState(true)
  const [currency, setCurrency] = useState("RON")
  const [thresholdInputs, setThresholdInputs] = useState({})
  const [savingThreshold, setSavingThreshold] = useState({})
  const [predictions, setPredictions] = useState({})

  useEffect(() => {
    if (!user) { setFetching(false); return }
    supabase
      .from("favorites")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        const favs = data || []
        setFavorites(favs)
        // Pre-populam inputurile convertind threshold-ul din INR (stocat in DB) in moneda curenta
        const inputs = {}
        favs.forEach(f => {
          inputs[f.id] = f.price_threshold != null
            ? String(Math.round(f.price_threshold * RATES[currency]))
            : ""
        })
        setThresholdInputs(inputs)
        setFetching(false)
      })
  }, [user])

  // Update optimist: eliminam din UI inainte de confirmare DB
  async function deleteFavorite(id) {
    setFavorites(prev => prev.filter(f => f.id !== id))
    await supabase.from("favorites").delete().eq("id", id)
  }

  // Inputul e in moneda afisata; convertim inapoi in INR inainte de a salva in DB
  async function saveThreshold(fav) {
    const raw = thresholdInputs[fav.id]
    setSavingThreshold(prev => ({ ...prev, [fav.id]: true }))
    const threshold = raw ? Math.round(Number(raw) / RATES[currency]) : null
    await supabase.from("favorites").update({ price_threshold: threshold }).eq("id", fav.id)
    setFavorites(prev => prev.map(f => f.id === fav.id ? { ...f, price_threshold: threshold } : f))
    setSavingThreshold(prev => ({ ...prev, [fav.id]: false }))
  }

  async function checkPrice(fav) {
    const days = daysLeftFromDate(fav.flight_date)
    if (days === null) return
    setPredictions(prev => ({ ...prev, [fav.id]: { loading: true } }))
    // Favoritele vechi salvate fara departure_time/stops/duration cad pe defaults
    const d = AIRLINE_DEFAULTS[fav.airline] || AIRLINE_DEFAULTS["Indigo"]
    try {
      const res = await fetch(`${API_BASE}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          features: {
            airline: fav.airline,
            flight: "",
            source_city: fav.source_city,
            destination_city: fav.destination_city,
            departure_time: fav.departure_time || d.departure_time,
            arrival_time: fav.arrival_time || d.arrival_time,
            stops: fav.stops || d.stops,
            class: fav.class,
            duration: fav.duration ?? d.duration,
            days_left: days,
          },
        }),
      })
      const data = await res.json()
      setPredictions(prev => ({ ...prev, [fav.id]: { price: data.predicted_price, days_left: days } }))
    } catch {
      setPredictions(prev => ({ ...prev, [fav.id]: { error: true } }))
    }
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

      <div style={{ padding: "32px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
          <div>
            <div style={{ fontSize: "20px", fontWeight: 500 }}>Zboruri favorite</div>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)", marginTop: "4px" }}>
              {favorites.length} {favorites.length === 1 ? "zbor salvat" : "zboruri salvate"}
            </div>
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            {["RON", "EUR"].map(c => (
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
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {favorites.map(fav => {
              const pred = predictions[fav.id]
              const daysLeft = daysLeftFromDate(fav.flight_date)
              // triggered necesita ambele: predictie disponibila SI threshold setat
              const triggered = pred?.price !== undefined && fav.price_threshold != null && pred.price <= fav.price_threshold

              return (
                <div key={fav.id} style={{
                  background: triggered ? "rgba(34,197,94,0.03)" : "rgba(255,255,255,0.02)",
                  border: `0.5px solid ${triggered ? "rgba(34,197,94,0.25)" : "rgba(255,255,255,0.07)"}`,
                  borderRadius: "16px", padding: "20px"
                }}>

                  {/* Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
                    <div>
                      <div style={{ fontSize: "15px", fontWeight: 600 }}>
                        {airlineLabel(fav.airline)}
                        <span style={{ fontSize: "12px", fontWeight: 400, color: "rgba(255,255,255,0.35)", marginLeft: "8px" }}>
                          {fav.class}
                        </span>
                      </div>
                      <div style={{ fontSize: "14px", color: "rgba(255,255,255,0.65)", marginTop: "3px" }}>
                        {fav.source_city} → {fav.destination_city}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      <button
                        onClick={() => navigate("/flights", {
                          state: { source_city: fav.source_city, destination_city: fav.destination_city, class: fav.class, date: fav.flight_date || "" }
                        })}
                        style={{
                          background: "rgba(255,255,255,0.03)", border: "0.5px solid rgba(255,255,255,0.08)",
                          borderRadius: "7px", padding: "5px 10px",
                          color: "rgba(255,255,255,0.35)", fontSize: "11px",
                          cursor: "pointer", fontFamily: "inherit"
                        }}
                      >
                        ↗ Caută din nou
                      </button>
                      <button
                        onClick={() => deleteFavorite(fav.id)}
                        style={{
                          background: "none", border: "none",
                          color: "rgba(255,255,255,0.2)", cursor: "pointer",
                          fontSize: "16px", padding: "0 4px"
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {/* Flight details */}
                  <div style={{
                    display: "flex", gap: "24px", flexWrap: "wrap",
                    padding: "12px 0",
                    borderTop: "0.5px solid rgba(255,255,255,0.05)",
                    borderBottom: "0.5px solid rgba(255,255,255,0.05)",
                    marginBottom: "18px"
                  }}>
                    {fav.departure_time && (
                      <div>
                        <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", letterSpacing: "0.4px" }}>PLECARE</div>
                        <div style={{ fontSize: "12px", marginTop: "3px" }}>{timeLabel(fav.departure_time)}</div>
                      </div>
                    )}
                    {fav.arrival_time && (
                      <div>
                        <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", letterSpacing: "0.4px" }}>SOSIRE</div>
                        <div style={{ fontSize: "12px", marginTop: "3px" }}>{timeLabel(fav.arrival_time)}</div>
                      </div>
                    )}
                    {fav.stops && (
                      <div>
                        <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", letterSpacing: "0.4px" }}>ESCALE</div>
                        <div style={{ fontSize: "12px", marginTop: "3px" }}>{stopsLabel(fav.stops)}</div>
                      </div>
                    )}
                    {fav.duration != null && (
                      <div>
                        <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", letterSpacing: "0.4px" }}>DURATĂ</div>
                        <div style={{ fontSize: "12px", marginTop: "3px" }}>{fav.duration}h</div>
                      </div>
                    )}
                    {fav.flight_date && (
                      <div>
                        <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", letterSpacing: "0.4px" }}>DATA ZBORULUI</div>
                        <div style={{ fontSize: "12px", marginTop: "3px" }}>
                          {formatDate(fav.flight_date)}
                          {daysLeft !== null && daysLeft > 0 && (
                            <span style={{ color: "rgba(255,255,255,0.28)", marginLeft: "5px" }}>({daysLeft}z)</span>
                          )}
                        </div>
                      </div>
                    )}
                    {fav.saved_price != null && (
                      <div>
                        <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", letterSpacing: "0.4px" }}>PREȚ SALVAT</div>
                        <div style={{ fontSize: "12px", fontWeight: 600, color: "rgba(255,255,255,0.65)", marginTop: "3px" }}>
                          {formatMoney(fav.saved_price, currency)}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Alert + price check */}
                  <div style={{ display: "flex", gap: "32px", flexWrap: "wrap", alignItems: "flex-start" }}>

                    {/* Inline threshold */}
                    <div>
                      <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", letterSpacing: "0.4px", marginBottom: "7px" }}>
                        ALERTĂ EMAIL — preț țintă
                      </div>
                      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                        <input
                          type="number"
                          value={thresholdInputs[fav.id] ?? ""}
                          onChange={e => setThresholdInputs(prev => ({ ...prev, [fav.id]: e.target.value }))}
                          placeholder={`ex: ${Math.round(4500 * RATES[currency])}`}
                          style={{
                            background: "rgba(255,255,255,0.04)",
                            border: "0.5px solid rgba(255,255,255,0.1)",
                            borderRadius: "7px", padding: "5px 10px",
                            color: "#fff", fontSize: "12px",
                            fontFamily: "inherit", width: "110px", outline: "none"
                          }}
                        />
                        <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)" }}>{currency}</span>
                        <button
                          onClick={() => saveThreshold(fav)}
                          disabled={!!savingThreshold[fav.id]}
                          style={{
                            background: "rgba(79,142,247,0.1)",
                            border: "0.5px solid rgba(79,142,247,0.25)",
                            borderRadius: "7px", padding: "5px 12px",
                            color: "#7eaafc", fontSize: "11px",
                            cursor: "pointer", fontFamily: "inherit",
                            opacity: savingThreshold[fav.id] ? 0.5 : 1
                          }}
                        >
                          {savingThreshold[fav.id] ? "..." : "Salvează"}
                        </button>
                      </div>
                      {fav.price_threshold != null && (
                        <div style={{ fontSize: "10px", color: "rgba(79,142,247,0.55)", marginTop: "5px" }}>
                          Alertă activă: {formatMoney(fav.price_threshold, currency)}
                        </div>
                      )}
                    </div>

                    {/* Price check */}
                    {fav.flight_date ? (
                      <div>
                        <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", letterSpacing: "0.4px", marginBottom: "7px" }}>
                          PREȚ ESTIMAT ACUM
                        </div>
                        {pred?.loading && (
                          <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)", marginBottom: "6px" }}>
                            Se verifică...
                          </div>
                        )}
                        {pred?.error && (
                          <div style={{ fontSize: "12px", color: "rgba(255,100,100,0.5)", marginBottom: "6px" }}>
                            Backend indisponibil
                          </div>
                        )}
                        {pred?.price !== undefined && (
                          <div style={{ marginBottom: "6px" }}>
                            <span style={{ fontSize: "17px", fontWeight: 600, color: triggered ? "#22c55e" : "#e8eaf0" }}>
                              {formatMoney(pred.price, currency)}
                            </span>
                            <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.28)", marginLeft: "7px" }}>
                              {pred.days_left}z până la zbor
                            </span>
                            {fav.price_threshold != null && (
                              <div style={{ fontSize: "11px", marginTop: "3px", color: triggered ? "#22c55e" : "rgba(255,255,255,0.3)" }}>
                                {triggered ? "Moment bun de cumpărat" : "Prețul e încă peste pragul tău"}
                              </div>
                            )}
                          </div>
                        )}
                        <button
                          onClick={() => checkPrice(fav)}
                          style={{
                            background: "rgba(79,142,247,0.08)",
                            border: "0.5px solid rgba(79,142,247,0.2)",
                            borderRadius: "7px", padding: "5px 14px",
                            color: "#7eaafc", fontSize: "11px",
                            cursor: "pointer", fontFamily: "inherit"
                          }}
                        >
                          Verifică prețul acum
                        </button>
                      </div>
                    ) : (
                      <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.2)", alignSelf: "center" }}>
                        Nicio dată de zbor — re-salvează zborul cu o dată selectată pentru verificare preț
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
