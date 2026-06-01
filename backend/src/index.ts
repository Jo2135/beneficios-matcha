import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { router } from "./routes/index";
import { errorHandler } from "./middleware/errorHandler";

const app = express();
const PORT = process.env.PORT || 5101;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: /^http:\/\/localhost(:\d+)?$/ }));
app.use(morgan("dev"));
app.use(express.json());

app.use("/api", router);
app.use(errorHandler);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Ecoplast API corriendo en http://localhost:${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/health`);
  console.log(`  API:    http://localhost:${PORT}/api`);
});

export default app;
