import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import {
  leerConfig, listaCorreos, proximoEnvio, estadoSmtp, carpetaRespaldos, nombreRespaldo,
  armarReporte, htmlReporte, excelReporte, ejecutarEnvio, ErrorReporte,
} from "../lib/reporteCobranza";

/**
 * Configuración del reporte semanal de cobranza (ver lib/reporteCobranza.ts).
 * Solo MASTER.
 */

const CORREO_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const MAX_CORREOS = 5;

/** GET /reporte-cobranza/config */
export async function getConfig(_req: Request, res: Response) {
  const c = await leerConfig();
  res.json({
    activo: c.cobranzaActivo,
    correos: listaCorreos(c.cobranzaCorreos),
    ultimoEnvio: c.cobranzaUltimoEnvio,
    ultimoError: c.cobranzaUltimoError,
    proximoEnvio: proximoEnvio(c),
    smtp: estadoSmtp(),
    carpetaRespaldos: carpetaRespaldos(),
  });
}

/** PUT /reporte-cobranza/config { activo, correos[] } */
export async function guardarConfig(req: Request, res: Response) {
  const activo = !!req.body?.activo;
  const correos: string[] = (Array.isArray(req.body?.correos) ? req.body.correos : [])
    .map((s: unknown) => String(s ?? "").trim().toLowerCase())
    .filter(Boolean);
  const unicos = [...new Set(correos)];

  const malos = unicos.filter((c) => !CORREO_RE.test(c));
  if (malos.length) {
    return res.status(400).json({ error: `Revisa ${malos.length === 1 ? "este correo" : "estos correos"}: ${malos.join(", ")}` });
  }
  if (unicos.length > MAX_CORREOS) return res.status(400).json({ error: `Máximo ${MAX_CORREOS} correos.` });
  if (activo && unicos.length === 0) {
    return res.status(400).json({ error: "Para activar el reporte agrega al menos un correo." });
  }

  const actual = await leerConfig();
  await prisma.configuracionSistema.update({
    where: { id: 1 },
    data: {
      cobranzaActivo: activo,
      cobranzaCorreos: unicos.join(","),
      // Al prenderlo se marca desde cuándo cuenta: el primer envío es el
      // primer sábado a las 6 que venga, no uno inmediato.
      ...(activo && !actual.cobranzaActivo ? { cobranzaActivadoEn: new Date() } : {}),
    },
  });
  return getConfig(req, res);
}

/** POST /reporte-cobranza/enviar — manda el reporte ya, para probar que llega. */
export async function enviarAhora(_req: Request, res: Response) {
  try {
    const r = await ejecutarEnvio("manual");
    res.json({ ok: true, ...r });
  } catch (e: any) {
    res.status(e instanceof ErrorReporte ? 400 : 500).json({ error: e?.message ?? "No se pudo enviar el reporte" });
  }
}

/** GET /reporte-cobranza/vista-previa — el mismo correo, sin enviarlo. */
export async function vistaPrevia(_req: Request, res: Response) {
  const rep = await armarReporte();
  res.json({ html: htmlReporte(rep) });
}

/** GET /reporte-cobranza/excel — el mismo Excel del respaldo, para bajarlo cuando se quiera. */
export async function descargarExcel(_req: Request, res: Response) {
  const rep = await armarReporte();
  const excel = await excelReporte(rep);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${nombreRespaldo(rep.generadoEn)}"`);
  res.send(excel);
}
