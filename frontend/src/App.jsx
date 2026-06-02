import { useEffect, useState, useRef } from "react";
import "./App.css";

const API_BASE = "http://127.0.0.1:8000";

// Cursuri aproximative INR -> alte valute
const RATES = { INR: 1, EUR: 0.011, RON: 0.054 };
const CURRENCY_LABELS = { INR: "INR", EUR: "EUR", RON: "RON" };

function formatMoney(x, currency = "INR") {
  if (x === null || x === undefined || Number.isNaN(x)) return "-";
  const converted = x * RATES[currency];
  return new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 }).format(converted) + " " + CURRENCY_LABELS[currency];
}

function getPriceLabel(price, stats) {
  if (!stats) return null;
  if (price <= stats.p25) return { label: "Preț mic", color: "#22c55e", emoji: "🟢", desc: "Sub media pieței" };
  if (price <= stats.p75) return { label: "Preț mediu", color: "#f59e0b", emoji: "🟡", desc: "În zona mediană" };
  return { label: "Preț mare", color: "#ef4444", emoji: "🔴", desc: "Peste media pieței" };
}

function PriceChart({ distribution, predictedPrice }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!distribution || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const { counts, edges } = distribution;
    const W = canvas.width;
    const H = canvas.height;
    const pad = { top: 10, right: 10, bottom: 30, left: 10 };

    ctx.clearRect(0, 0, W, H);

    const maxCount = Math.max(...counts);
    const totalBins = counts.length;
    const binW = (W - pad.left - pad.right) / totalBins;

    // Deseneaza barele
    counts.forEach((count, i) => {
      const x = pad.left + i * binW;
      const barH = ((count / maxCount) * (H - pad.top - pad.bottom));
      const y = H - pad.bottom - barH;
      const binMid = (edges[i] + edges[i + 1]) / 2;

      // Coloreaza bara dupa zona de pret
      if (binMid <= 4783) ctx.fillStyle = "rgba(34,197,94,0.5)";
      else if (binMid <= 42521) ctx.fillStyle = "rgba(245,158,11,0.5)";
      else ctx.fillStyle = "rgba(239,68,68,0.5)";

      ctx.fillRect(x, y, binW - 1, barH);
    });

    // Marcheaza pretul prezis
    if (predictedPrice !== null) {
      const minEdge = edges[0];
      const maxEdge = edges[edges.length - 1];
      const clampedPrice = Math.min(Math.max(predictedPrice, minEdge), maxEdge);
      const xPos = pad.left + ((clampedPrice - minEdge) / (maxEdge - minEdge)) * (W - pad.left - pad.right);

      ctx.beginPath();
      ctx.moveTo(xPos, pad.top);
      ctx.lineTo(xPos, H - pad.bottom);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Triunghi indicator
      ctx.beginPath();
      ctx.moveTo(xPos - 6, pad.top + 2);
      ctx.lineTo(xPos + 6, pad.top + 2);
      ctx.lineTo(xPos, pad.top + 10);
      ctx.fillStyle = "#fff";
      ctx.fill();
    }

    // Etichete axa X
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ["1K", "30K", "60K", "90K", "123K"].forEach((label, i) => {
      const x = pad.left + (i / 4) * (W - pad.left - pad.right);
      ctx.fillText(label, x, H - 8);
    });

  }, [distribution, predictedPrice]);

  return (
    <canvas
      ref={canvasRef}
      width={340}
      height={120}
      style={{ width: "100%", borderRadius: "10px", display: "block" }}
    />
  );
}

export default function App() {
  const [tab, setTab] = useState("predict");
  const [options, setOptions] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [statsData, setStatsData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultNN, setResultNN] = useState(null);
  const [resultCompare, setResultCompare] = useState(null);
  const [currency, setCurrency] = useState("INR");

  const [form, setForm] = useState({
    airline: "Indigo",
    flight: "",
    source_city: "Delhi",
    destination_city: "Mumbai",
    departure_time: "Morning",
    arrival_time: "Night",
    stops: "one",
    class: "Economy",
    duration: 2.5,
    days_left: 10,
    flight_date: "",
  });

  useEffect(() => {
    (async () => {
      try {
        const [m1, m2, m3] = await Promise.all([
          fetch(`${API_BASE}/metadata`).then((r) => r.json()),
          fetch(`${API_BASE}/options`).then((r) => r.json()),
          fetch(`${API_BASE}/stats`).then((r) => r.json()),
        ]);
        setMetrics(m1.metrics);
        setOptions(m2);
        setStatsData(m3);
      } catch (e) {
        setError("Eroare cu datele de la backend. Verifică dacă backend-ul rulează pe :8000.");
      }
    })();
  }, []);

  const setField = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  async function callPredict() {
    setError("");
    setLoading(true);
    setResultNN(null);
    try {
      const payload = {
        features: {
          ...form,
          duration: Number(form.duration),
          days_left: Number(form.days_left),
        },
      };
      const res = await fetch(`${API_BASE}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("predict failed");
      const data = await res.json();
      setResultNN(data);
      setTab("predict");
    } catch (e) {
      setError("Eroare la /predict. Verifică backend-ul și valorile din formular.");
    } finally {
      setLoading(false);
    }
  }

  async function callCompare() {
    setError("");
    setLoading(true);
    setResultCompare(null);
    try {
      const payload = {
        features: {
          ...form,
          duration: Number(form.duration),
          days_left: Number(form.days_left),
        },
      };
      const res = await fetch(`${API_BASE}/compare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("compare failed");
      const data = await res.json();
      setResultCompare(data);
      setTab("compare");
    } catch (e) {
      setError("Eroare la /compare. Verifică backend-ul și valorile din formular.");
    } finally {
      setLoading(false);
    }
  }

  const priceLabel = resultNN ? getPriceLabel(resultNN.predicted_price, statsData?.price_stats) : null;

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <h1>Flight Price Prediction</h1>
          <p>Model final: Neural Network (MLP). Comparația cu regresia polinomială este disponibilă separat.</p>
        </div>
        <div className="tabbar">
          <button className={tab === "predict" ? "active" : ""} onClick={() => setTab("predict")}>Predicție</button>
          <button className={tab === "compare" ? "active" : ""} onClick={() => setTab("compare")}>Comparație</button>
        </div>
      </header>

      {error && <div className="alert">{error}</div>}

      <div className="grid">
        {/* FORMULAR */}
        <section className="card">
          <h2>Date zbor</h2>
          {!options ? (
            <p className="muted">Se încarcă opțiunile...</p>
          ) : (
            <>
              <div className="form">
                <div className="row">
                  <div className="field">
                    <label>Airline</label>
                    <select value={form.airline} onChange={(e) => setField("airline", e.target.value)}>
                      {options.airline.map((x) => <option key={x} value={x}>{x}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Numărul zborului (opțional)</label>
                    <input value={form.flight} onChange={(e) => setField("flight", e.target.value)} placeholder="ex: UK-995" />
                  </div>
                </div>

                <div className="row">
                  <div className="field">
                    <label>Orașul de plecare</label>
                    <select value={form.source_city} onChange={(e) => setField("source_city", e.target.value)}>
                      {options.source_city.map((x) => <option key={x} value={x}>{x}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Orașul de destinație</label>
                    <select value={form.destination_city} onChange={(e) => setField("destination_city", e.target.value)}>
                      {options.destination_city.map((x) => <option key={x} value={x}>{x}</option>)}
                    </select>
                  </div>
                </div>

                <div className="row">
                  <div className="field">
                    <label>Ora de plecare</label>
                    <select value={form.departure_time} onChange={(e) => setField("departure_time", e.target.value)}>
                      {options.departure_time.map((x) => <option key={x} value={x}>{x}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Ora de sosire</label>
                    <select value={form.arrival_time} onChange={(e) => setField("arrival_time", e.target.value)}>
                      {options.arrival_time.map((x) => <option key={x} value={x}>{x}</option>)}
                    </select>
                  </div>
                </div>

                <div className="row">
                  <div className="field">
                    <label>Escale</label>
                    <select value={form.stops} onChange={(e) => setField("stops", e.target.value)}>
                      {options.stops.map((x) => <option key={x} value={x}>{x}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Clasa</label>
                    <select value={form.class} onChange={(e) => setField("class", e.target.value)}>
                      {options.class.map((x) => <option key={x} value={x}>{x}</option>)}
                    </select>
                  </div>
                </div>

                <div className="row">
                  <div className="field">
                    <label>Durata zborului (ore)</label>
                    <input type="number" step="0.1" value={form.duration} onChange={(e) => setField("duration", e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Data zborului</label>
                    <input
                      type="date"
                      min={new Date().toISOString().split("T")[0]}
                      value={form.flight_date || ""}
                      onChange={(e) => {
                        const selected = new Date(e.target.value);
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const diff = Math.round((selected - today) / (1000 * 60 * 60 * 24));
                        setField("flight_date", e.target.value);
                        setField("days_left", diff > 0 ? diff : 0);
                      }}
                    />
                    {form.flight_date && (
                      <span style={{ fontSize: "11px", color: "var(--muted)", marginTop: "4px", display: "block" }}>
                        {form.days_left} zile până la zbor
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="actions">
                <button disabled={loading} onClick={callPredict}>{loading ? "Se calculează..." : "Prezice (NN)"}</button>
                <button disabled={loading} className="secondary" onClick={callCompare}>{loading ? "Se calculează..." : "Compară (NN vs Poly)"}</button>
              </div>
            </>
          )}
        </section>

        {/* REZULTATE */}
        <section className="card">
          {tab === "predict" ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <h2 style={{ margin: 0 }}>Rezultat (NN)</h2>
                {resultNN && (
                  <div className="currency-toggle">
                    {["INR", "EUR", "RON"].map((c) => (
                      <button
                        key={c}
                        className={currency === c ? "active" : ""}
                        onClick={() => setCurrency(c)}
                        style={{ padding: "4px 10px", fontSize: "12px", fontWeight: currency === c ? 700 : 400 }}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {!resultNN ? (
                <p className="muted">Completează formularul și apasă „Prezice (NN)".</p>
              ) : (
                <>
                  {/* Pret principal */}
                  <div className="price">{formatMoney(resultNN.predicted_price, currency)}</div>

                  {/* Indicator verde/galben/rosu */}
                  {priceLabel && (
                    <div className="price-badge" style={{ borderColor: priceLabel.color + "55", background: priceLabel.color + "18" }}>
                      <span style={{ fontSize: "16px" }}>{priceLabel.emoji}</span>
                      <div>
                        <div style={{ fontWeight: 700, color: priceLabel.color, fontSize: "13px" }}>{priceLabel.label}</div>
                        <div style={{ fontSize: "11px", color: "var(--muted)" }}>{priceLabel.desc}</div>
                      </div>
                    </div>
                  )}

                  {/* Conversii valutare */}
                  <div className="currency-row">
                    <div className="currency-item">
                      <div className="currency-label">INR</div>
                      <div className="currency-val">{formatMoney(resultNN.predicted_price, "INR")}</div>
                    </div>
                    <div className="currency-item">
                      <div className="currency-label">EUR</div>
                      <div className="currency-val">{formatMoney(resultNN.predicted_price, "EUR")}</div>
                    </div>
                    <div className="currency-item">
                      <div className="currency-label">RON</div>
                      <div className="currency-val">{formatMoney(resultNN.predicted_price, "RON")}</div>
                    </div>
                  </div>

                  {/* Grafic distributie */}
                  {statsData?.price_distribution && (
                    <>
                      <h3>Distribuția prețurilor din dataset</h3>
                      <PriceChart
                        distribution={statsData.price_distribution}
                        predictedPrice={resultNN.predicted_price}
                      />
                      <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "6px" }}>
                        Linia albă indică poziția predicției tale față de toate zborurile din dataset.
                      </div>
                    </>
                  )}

                  {/* Top factori */}
                  {statsData?.top_factors && (
                    <>
                      <h3>Factori principali de influență</h3>
                      <div className="factors">
                        {statsData.top_factors.map((f, i) => (
                          <div key={i} className="factor-item">
                            <span className="factor-icon">
                              {f.direction === "up" ? "↑" : f.direction === "down" ? "↓" : "↕"}
                            </span>
                            <div>
                              <div style={{ fontSize: "13px", fontWeight: 600 }}>{f.factor}</div>
                              <div style={{ fontSize: "11px", color: "var(--muted)" }}>Impact {f.impact}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {/* Scoruri model */}
                  {metrics?.nn && (
                    <>
                      <h3>Scoruri model</h3>
                      <div className="scores">
                        <div><b>R² test:</b> {metrics.nn.r2_test.toFixed(4)}</div>
                        <div><b>MAE:</b> {metrics.nn.mae.toFixed(4)}</div>
                        <div><b>RMSE:</b> {metrics.nn.rmse.toFixed(4)}</div>
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              <h2>Comparație</h2>
              {!resultCompare ? (
                <p className="muted">Apasă „Compară (NN vs Poly)" ca să vezi ambele rezultate.</p>
              ) : (
                <>
                  <div className="compare">
                    <div className="mini">
                      <div className="label">Neural Network</div>
                      <div className="priceSmall">{formatMoney(resultCompare.nn.predicted_price, currency)}</div>
                    </div>
                    <div className="mini">
                      <div className="label">Polynomial</div>
                      <div className="priceSmall">{formatMoney(resultCompare.poly.predicted_price, currency)}</div>
                    </div>
                  </div>
                  <div className="delta">
                    <b>Diferență (Poly - NN):</b> {formatMoney(resultCompare.delta.absolute, currency)} ({(resultCompare.delta.percentage ?? 0).toFixed(2)}%)
                  </div>

                  <h3>Scoruri modele</h3>
                  <div className="table">
                    <div className="thead">Model</div><div className="thead">R² test</div><div className="thead">MAE</div><div className="thead">RMSE</div>
                    <div>NN</div><div>{resultCompare.metrics.nn.r2_test.toFixed(4)}</div><div>{resultCompare.metrics.nn.mae.toFixed(4)}</div><div>{resultCompare.metrics.nn.rmse.toFixed(4)}</div>
                    <div>Polynomial</div><div>{resultCompare.metrics.poly.r2_test}</div><div>{resultCompare.metrics.poly.mae}</div><div>{resultCompare.metrics.poly.rmse}</div>
                  </div>
                </>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}