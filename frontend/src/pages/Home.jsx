import { useState } from "react"
import { useNavigate } from "react-router-dom"
import Nav from "../components/Nav"
import "./Home.css"

const POPULAR_ROUTES = [
  { from: "Delhi", to: "Mumbai", airline: "Vistara", class: "Economy", duration: "2h 10m", price: "₹5.200", badge: "green", label: "Preț bun" },
  { from: "Bangalore", to: "Kolkata", airline: "IndiGo", class: "Economy", duration: "2h 45m", price: "₹4.800", badge: "amber", label: "Preț mediu" },
  { from: "Mumbai", to: "Chennai", airline: "Air India", class: "Business", duration: "1h 55m", price: "₹52.400", badge: "red", label: "Preț ridicat" },
  { from: "Delhi", to: "Hyderabad", airline: "SpiceJet", class: "Economy", duration: "2h 20m", price: "₹3.900", badge: "green", label: "Preț bun" },
  { from: "Kolkata", to: "Bangalore", airline: "AirAsia", class: "Economy", duration: "3h 05m", price: "₹6.100", badge: "amber", label: "Preț mediu" },
  { from: "Chennai", to: "Delhi", airline: "GO FIRST", class: "Economy", duration: "2h 50m", price: "₹7.300", badge: "amber", label: "Preț mediu" },
]

const CITIES = ["Bangalore", "Chennai", "Delhi", "Hyderabad", "Kolkata", "Mumbai"]

export default function Home() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    source_city: "Delhi",
    destination_city: "Mumbai",
    date: "",
    class: "Economy",
  })

  const setField = (k, v) => setForm(p => ({ ...p, [k]: v }))

  function handleSearch() {
    navigate("/flights", { state: form })
  }

  return (
    <div className="home">
      <Nav />

      <div className="hero">
        <div className="hero-tag"><div className="hero-dot" />Model ML cu R² = 0.97</div>
        <h1>Găsește zborul potrivit,<br />la <em>momentul potrivit</em></h1>
        <p>Asistentul nostru AI analizează prețurile și îți spune când e cel mai bun moment să cumperi biletul.</p>
      </div>

      <div className="search-card">
        <div className="search-grid">
          <div className="field-group">
            <div className="field-label">De la</div>
            <select className="field-input" value={form.source_city} onChange={e => setField("source_city", e.target.value)}>
              {CITIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="field-group">
            <div className="field-label">Spre</div>
            <select className="field-input" value={form.destination_city} onChange={e => setField("destination_city", e.target.value)}>
              {CITIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="field-group">
            <div className="field-label">Data zborului</div>
            <input className="field-input" type="date" min={new Date().toISOString().split("T")[0]} value={form.date} onChange={e => setField("date", e.target.value)} />
          </div>
          <div className="field-group">
            <div className="field-label">Clasa</div>
            <select className="field-input" value={form.class} onChange={e => setField("class", e.target.value)}>
              <option>Economy</option>
              <option>Business</option>
            </select>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            {form.source_city === form.destination_city && (
              <div style={{
                background: "rgba(226,75,74,0.08)", border: "0.5px solid rgba(226,75,74,0.2)",
                borderRadius: "8px", padding: "8px 14px", fontSize: "12px",
                color: "#e24b4a", marginBottom: "10px"
              }}>
                Orașul de plecare și destinația nu pot fi identice.
              </div>
            )}
            <button
              className="search-btn"
              onClick={handleSearch}
              disabled={form.source_city === form.destination_city}
              style={{ opacity: form.source_city === form.destination_city ? 0.4 : 1 }}
            >
              Caută →
            </button>
          </div>
        </div>
      </div>

      <div className="ai-bar">
        <div className="ai-icon">✦</div>
        <div className="ai-text"><strong>Asistent AI:</strong> Prețurile pentru {form.source_city} → {form.destination_city} sunt analizate în timp real. Rezervă cu cel puțin 20 de zile înainte pentru prețuri optime.</div>
      </div>

      <div className="section">
        <div className="section-label">Rute populare</div>
        <div className="routes-grid">
          {POPULAR_ROUTES.map((r, i) => (
            <div key={i} className="route-card" onClick={() => navigate("/flights", { state: { source_city: r.from, destination_city: r.to, class: r.class } })}>
              <div className="route-header">
                <div className="route-cities">{r.from} → {r.to}</div>
              </div>
              <div className="route-airline">{r.airline} · {r.class} · {r.duration}</div>
              <div className="route-footer">
                <div className="route-price">{r.price}</div>
                <div className={`route-badge badge-${r.badge}`}>{r.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}