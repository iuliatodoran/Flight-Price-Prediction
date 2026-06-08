import { useNavigate } from "react-router-dom"
import Nav from "../components/Nav"
import "./Home.css"

export default function NotFound() {
  const navigate = useNavigate()

  return (
    <div className="home">
      <Nav />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "100px 32px", textAlign: "center" }}>
        <div style={{ fontSize: "64px", fontWeight: 700, color: "rgba(255,255,255,0.06)", letterSpacing: "-2px", marginBottom: "8px" }}>
          404
        </div>
        <div style={{ fontSize: "18px", fontWeight: 500, marginBottom: "8px" }}>
          Pagina nu a fost găsită
        </div>
        <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.3)", marginBottom: "32px" }}>
          Ruta pe care o cauți nu există.
        </div>
        <button
          onClick={() => navigate("/")}
          style={{
            background: "rgba(79,142,247,0.1)", border: "0.5px solid rgba(79,142,247,0.2)",
            borderRadius: "10px", padding: "10px 24px", color: "#7eaafc",
            fontSize: "13px", cursor: "pointer", fontFamily: "inherit"
          }}
        >
          ← Înapoi acasă
        </button>
      </div>
    </div>
  )
}
