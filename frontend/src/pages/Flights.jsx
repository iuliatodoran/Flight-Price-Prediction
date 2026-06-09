import { useState, useEffect, useMemo } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabaseClient"
import { useAuth } from "../lib/AuthContext"
import Nav from "../components/Nav"
import "./Flights.css"

const API_BASE = "http://127.0.0.1:8000"
const RATES = { INR: 1, EUR: 0.011, RON: 0.054 }
const CITIES = ["Bangalore", "Chennai", "Delhi", "Hyderabad", "Kolkata", "Mumbai"]

// Un profil reprezentativ per companie — parametrii reali nu sunt disponibili, deci folosim medii din dataset
const SAMPLE_OPTIONS = [
  { airline: "Vistara",   label: "Vistara",    stops: "zero",        departure_time: "Morning",       arrival_time: "Afternoon", duration: 2.0 },
  { airline: "Indigo",    label: "IndiGo",     stops: "one",         departure_time: "Evening",       arrival_time: "Night",     duration: 3.5 },
  { airline: "Air_India", label: "Air India",  stops: "zero",        departure_time: "Early_Morning", arrival_time: "Morning",   duration: 2.2 },
  { airline: "SpiceJet",  label: "SpiceJet",   stops: "one",         departure_time: "Morning",       arrival_time: "Evening",   duration: 4.0 },
  { airline: "GO_FIRST",  label: "GO FIRST",   stops: "two_or_more", departure_time: "Afternoon",     arrival_time: "Night",     duration: 5.5 },
  { airline: "AirAsia",   label: "AirAsia",    stops: "one",         departure_time: "Night",         arrival_time: "Morning",   duration: 6.0 },
]

function formatMoney(x, currency = "RON") {
  if (x === null || x === undefined) return null
  const converted = x * RATES[currency]
  return new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 }).format(converted) + " " + currency
}

function stopsLabel(stops) {
  if (stops === "zero") return "Direct"
  if (stops === "one") return "1 escală"
  return "2+ escale"
}

function timeLabel(t) {
  return t.replace("_", " ")
}

export default function Flights() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const search = location.state || {}

  // Parametrii activi ai cautarii (ce se afiseaza si se trimite la API)
  const [activeParams, setActiveParams] = useState({
    source: search.source_city || "Delhi",
    destination: search.destination_city || "Mumbai",
    flightClass: search.class || "Economy",
    date: search.date || "",
  })
  const { source, destination, flightClass, date } = activeParams

  // Starea formularului din panoul de cautare (ce editeaza userul inainte de submit)
  const [formParams, setFormParams] = useState({ ...activeParams })
  const [showSearch, setShowSearch] = useState(false)
  // Truc pentru date input: type="text" cu placeholder pana la focus
  const [formDateType, setFormDateType] = useState("text")

  const setFormField = (k, v) => setFormParams(p => ({ ...p, [k]: v }))

  // Daca nu s-a ales data, folosim 30 zile ca valoare neutra de predictie
  const daysLeft = useMemo(() => {
    if (!date) return 30
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return Math.max(0, Math.round((new Date(date) - today) / (1000 * 60 * 60 * 24)))
  }, [date])

  const [results, setResults] = useState(
    SAMPLE_OPTIONS.map(o => ({ ...o, price: null, loading: true, error: false }))
  )
  const [currency, setCurrency] = useState("RON")
  // Construieste un index dupa cheia compusa airline|from|to|class pentru toggle rapid save/unsave
  const [savedMap, setSavedMap] = useState({})
  const [pendingSave, setPendingSave] = useState(new Set()) // previne dublu-click pe save
  const [toast, setToast] = useState(null)

  // Ruleaza la mount si la fiecare noua cautare
  useEffect(() => {
    setResults(SAMPLE_OPTIONS.map(o => ({ ...o, price: null, loading: true, error: false })))
    SAMPLE_OPTIONS.forEach((opt, i) => {
      fetch(`${API_BASE}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          features: {
            airline: opt.airline,
            flight: "",
            source_city: source,
            destination_city: destination,
            departure_time: opt.departure_time,
            arrival_time: opt.arrival_time,
            stops: opt.stops,
            class: flightClass,
            duration: opt.duration,
            days_left: daysLeft,
            flight_date: date,
          },
        }),
      })
        .then(r => r.json())
        .then(data => {
          setResults(prev => prev.map((r, idx) =>
            idx === i ? { ...r, price: data.predicted_price, loading: false } : r
          ))
        })
        .catch(() => {
          setResults(prev => prev.map((r, idx) =>
            idx === i ? { ...r, loading: false, error: true } : r
          ))
        })
    })
  }, [source, destination, flightClass, date, daysLeft])

  useEffect(() => {
    if (!user) { setSavedMap({}); return }
    supabase
      .from("favorites")
      .select("id, airline, source_city, destination_city, class")
      .eq("user_id", user.id)
      .then(({ data }) => {
        if (!data) return
        const map = {}
        data.forEach(f => {
          map[`${f.airline}|${f.source_city}|${f.destination_city}|${f.class}`] = f.id
        })
        setSavedMap(map)
      })
  }, [user])

  function toggleSearch() {
    if (!showSearch) {
      setFormParams({ ...activeParams }) // reset form la cautarea activa curenta
      setFormDateType(activeParams.date ? "date" : "text")
    }
    setShowSearch(s => !s)
  }

  function handleSearch() {
    if (formParams.source === formParams.destination) return
    setActiveParams(formParams)
    setShowSearch(false)
  }

  async function handleSave(r) {
    if (!user) { navigate("/auth"); return }
    const key = `${r.airline}|${source}|${destination}|${flightClass}`
    if (pendingSave.has(key)) return
    setPendingSave(prev => new Set(prev).add(key))

    if (savedMap[key]) {
      await supabase.from("favorites").delete().eq("id", savedMap[key])
      setSavedMap(prev => { const next = { ...prev }; delete next[key]; return next })
      showToast("Eliminat din favorite")
    } else {
      const { data, error } = await supabase.from("favorites").insert({
        user_id: user.id,
        airline: r.airline,
        source_city: source,
        destination_city: destination,
        class: flightClass,
        flight_date: date || null,
        saved_price: r.price ?? null,
        departure_time: r.departure_time,
        arrival_time: r.arrival_time,
        stops: r.stops,
        duration: r.duration,
      }).select("id").single()
      if (error) { console.error("Favorites insert error:", error); showToast("Eroare la salvare"); return }
      if (data) setSavedMap(prev => ({ ...prev, [key]: data.id }))
      showToast("Salvat în favorite ♥")
    }
    setPendingSave(prev => { const next = new Set(prev); next.delete(key); return next })
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }

  // Sortare crescatoare; preturile null (eroare/loading) merg la sfarsit
  const sorted = [...results].sort((a, b) => {
    if (a.price === null && b.price === null) return 0
    if (a.price === null) return 1
    if (b.price === null) return -1
    return a.price - b.price
  })

  const cheapest = sorted.find(r => r.price !== null)

  return (
    <div className="flights-page">
      <Nav active="flights" />

      <div className="flights-header">
        <div className="route-title">{source} → {destination}</div>
        <div className="route-meta">
          {date || "Oricând"} · {flightClass} · {results.length} opțiuni
        </div>
        <button className={`back-btn${showSearch ? " active" : ""}`} onClick={toggleSearch}>
          {showSearch ? "✕ Închide" : "Modifică căutarea"}
        </button>
      </div>

      {showSearch && (
        <div className="flights-search-bar">
          <div className="flt-search-grid">
            <div className="field-group">
              <div className="field-label">De la</div>
              <select className="field-input" value={formParams.source} onChange={e => setFormField("source", e.target.value)}>
                {CITIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="field-group">
              <div className="field-label">Spre</div>
              <select className="field-input" value={formParams.destination} onChange={e => setFormField("destination", e.target.value)}>
                {CITIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="field-group">
              <div className="field-label">Data zborului</div>
              <input
                className="field-input"
                type={formDateType}
                placeholder="Oricând"
                min={new Date().toISOString().split("T")[0]}
                value={formParams.date}
                onFocus={() => setFormDateType("date")}
                onBlur={() => { if (!formParams.date) setFormDateType("text") }}
                onChange={e => setFormField("date", e.target.value)}
              />
            </div>
            <div className="field-group">
              <div className="field-label">Clasa</div>
              <select className="field-input" value={formParams.flightClass} onChange={e => setFormField("flightClass", e.target.value)}>
                <option>Economy</option>
                <option>Business</option>
              </select>
            </div>
            <div style={{ alignSelf: "flex-end" }}>
              {formParams.source === formParams.destination && (
                <div style={{ fontSize: "11px", color: "#e24b4a", marginBottom: "6px" }}>
                  Plecare și destinație identice.
                </div>
              )}
              <button
                className="search-btn"
                onClick={handleSearch}
                disabled={formParams.source === formParams.destination}
                style={{ opacity: formParams.source === formParams.destination ? 0.4 : 1 }}
              >
                Caută →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sfat static bazat pe daysLeft — nu e un apel AI, e o regula simpla */}
      {cheapest && (
        <div className="ai-tip">
          <span className="ai-icon">✦</span>
          <span>
            <strong>Asistent AI:</strong> Cel mai bun preț disponibil pentru {source} → {destination} este{" "}
            <strong>{formatMoney(cheapest.price, currency)}</strong> cu {cheapest.label}.
            {daysLeft > 0 && daysLeft <= 7
              ? " Prețul ar putea crește — recomandăm rezervarea rapidă."
              : " Rezervarea cu avans oferă prețuri mai bune."}
          </span>
        </div>
      )}

      <div className="currency-bar">
        {["EUR", "RON"].map(c => (
          <button key={c} className={currency === c ? "active" : ""} onClick={() => setCurrency(c)}>{c}</button>
        ))}
      </div>

      <div className="flights-list">
        {sorted.map((r, i) => {
          const isCheapest = r === cheapest
          const key = `${r.airline}|${source}|${destination}|${flightClass}`
          const isSaved = !!savedMap[key]
          return (
            <div key={i} className={`flight-card${isCheapest ? " best" : ""}`}>
              {isCheapest && <div className="best-tag">Cel mai ieftin</div>}
              <div className="fc-airline">{r.label}</div>
              <div className="fc-route">
                <div className="fc-time">{timeLabel(r.departure_time)}</div>
                <div className="fc-stops">{stopsLabel(r.stops)}</div>
                <div className="fc-time">{timeLabel(r.arrival_time)}</div>
              </div>
              <div className="fc-duration">{r.duration}h zbor</div>
              <div className="fc-right">
                <div className="fc-price">
                  {r.loading
                    ? <div className="price-skeleton" />
                    : r.error
                    ? <span className="fc-error">N/A</span>
                    : formatMoney(r.price, currency)}
                </div>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    className={`save-btn${isSaved ? " saved" : ""}`}
                    onClick={() => handleSave(r)}
                    title={isSaved ? "Elimină din favorite" : "Salvează în favorite"}
                  >
                    {pendingSave.has(key) ? "·" : isSaved ? "♥" : "♡"}
                  </button>
                  <button
                    className="analyze-btn"
                    onClick={() => navigate("/analysis", {
                      state: {
                        flight: {
                          airline: r.airline,
                          flight: "",
                          source_city: source,
                          destination_city: destination,
                          departure_time: r.departure_time,
                          arrival_time: r.arrival_time,
                          stops: r.stops,
                          class: flightClass,
                          duration: r.duration,
                          days_left: daysLeft,
                          flight_date: date,
                        },
                      },
                    })}
                  >
                    Analizează
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
