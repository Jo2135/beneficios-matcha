import { useState, FormEvent } from "react";
import { useAuth } from "../contexts/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setCargando(true);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Error al iniciar sesión");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #1a2332 0%, #2d3f55 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'Segoe UI', sans-serif",
    }}>
      <div style={{
        background: "#fff",
        borderRadius: 20,
        padding: "48px 44px",
        width: "100%",
        maxWidth: 400,
        boxShadow: "0 25px 60px rgba(0,0,0,0.3)",
      }}>
        {/* Logo / header */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{
            width: 56, height: 56,
            background: "linear-gradient(135deg, #2563eb, #1e40af)",
            borderRadius: 14,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 28, margin: "0 auto 16px",
            boxShadow: "0 4px 15px rgba(37,99,235,0.35)",
          }}>
            E
          </div>
          <h1 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 700, color: "#1e293b" }}>
            Sistema de Gestión
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>ECOPLAST · MAXPLASTIC</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>Usuario o correo electrónico</label>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario o correo@ecoplast.com"
              required
              autoFocus
              autoComplete="username"
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={inputStyle}
            />
          </div>

          {error && (
            <div style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#dc2626",
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 13,
              marginBottom: 18,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={cargando}
            style={{
              width: "100%",
              padding: "13px",
              background: cargando ? "#93c5fd" : "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 700,
              cursor: cargando ? "not-allowed" : "pointer",
              transition: "background 0.15s",
            }}
          >
            {cargando ? "Iniciando sesión..." : "Ingresar"}
          </button>
        </form>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: "#374151",
  marginBottom: 6,
};
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 14px",
  border: "1.5px solid #e2e8f0",
  borderRadius: 8,
  fontSize: 14,
  color: "#1e293b",
  outline: "none",
  boxSizing: "border-box",
  background: "#f8fafc",
};
