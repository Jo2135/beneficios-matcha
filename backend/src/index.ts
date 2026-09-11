import "dotenv/config";
import { execSync } from "child_process";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import { router } from "./routes/index";
import { errorHandler } from "./middleware/errorHandler";
import { iniciarProgramadorCobranza } from "./jobs/reporteCobranza";

try {
  execSync("npx prisma migrate deploy", { stdio: "inherit" });
} catch (_) { /* DB might not be ready yet; app will fail requests instead */ }

const app = express();
const PORT = process.env.PORT || 5101;

app.use(helmet({ contentSecurityPolicy: false }));
// Se permite localhost (la PC del servidor) y las direcciones privadas de la
// red local, para que las vendedoras entren desde sus equipos por la IP del
// servidor. CORS_ORIGENES agrega otros origenes separados por coma el dia que
// haya dominio.
const ORIGENES_EXTRA = (process.env.CORS_ORIGENES ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);
const RED_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/;
app.use(cors({
  origin: (origin, cb) => {
    // Sin origin: apps moviles, curl o same-origin. No se bloquea.
    if (!origin) return cb(null, true);
    if (RED_LOCAL.test(origin) || ORIGENES_EXTRA.includes(origin)) return cb(null, true);
    // No se autoriza, pero tampoco se lanza error: asi el navegador bloquea la
    // llamada y el servidor no registra un 500 por cada intento.
    cb(null, false);
  },
}));
app.use(morgan("dev"));
app.use(express.json());
app.use("/uploads", express.static(path.join(process.cwd(), "public", "uploads")));

app.use("/api", router);
app.use(errorHandler);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Ecoplast API corriendo en http://localhost:${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/health`);
  console.log(`  API:    http://localhost:${PORT}/api`);
  // Reporte semanal de cobranza: revisa cada 5 min si ya es sabado 6 pm
  iniciarProgramadorCobranza();
});

export default app;
