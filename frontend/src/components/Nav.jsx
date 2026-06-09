import { useNavigate } from "react-router-dom"
import { useAuth } from "../lib/AuthContext"

// active — cheia paginii curente (ex: "flights"), marcheaza link-ul activ in nav
export default function Nav({ active }) {
  const navigate = useNavigate()
  const { user, loading, signOut } = useAuth()

  // Toggle: logout daca e autentificat, redirect la /auth daca nu e
  async function handleAuth() {
    if (user) {
      await signOut()
      navigate("/")
    } else {
      navigate("/auth")
    }
  }

  return (
    <nav className="nav">
      <div className="logo" onClick={() => navigate("/")}>sky<span>timing</span></div>
      <div className="nav-links">
        <a className={active === "flights" ? "active" : ""} onClick={() => navigate("/flights")}>Zboruri</a>
        <a className={active === "favorites" ? "active" : ""} onClick={() => navigate("/favorites")}>Favorite</a>
        <a className={active === "analysis" ? "active" : ""} onClick={() => navigate("/analysis")}>Analiză ML</a>
        {loading ? (
          <div style={{ width: "80px" }} />
        ) : user ? (
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.35)" }}>
              {user.email.split("@")[0]}
            </span>
            <button className="btn-nav" onClick={handleAuth}>Ieșire</button>
          </div>
        ) : (
          <button className="btn-nav" onClick={handleAuth}>Conectare</button>
        )}
      </div>
    </nav>
  )
}
