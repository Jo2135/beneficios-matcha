import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";
import ExcelJS from "exceljs";
import { prisma } from "./prisma";

/**
 * Reporte semanal de cobranza.
 *
 * Todos los sábados a las 6:00 pm (hora de Venezuela) el sistema arma la lista
 * de facturas pendientes por cobrar, guarda un respaldo en Excel en el disco y
 * lo envía por correo a los destinatarios que José configura en Configuración.
 * Pedido por José el 11-sep-2026.
 *
 * El programador (jobs/reporteCobranza.ts) revisa cada 5 minutos si ya toca.
 * No hace falta que el equipo esté prendido justo a las 6: si estaba apagado,
 * el reporte sale apenas vuelve a encender, y el correo avisa que va atrasado.
 *
 * La cuenta que ENVÍA los correos va en backend/.env (SMTP_USER / SMTP_PASS),
 * no en la base de datos: es una clave y no debe quedar a la vista.
 */

const DIA_MS = 86_400_000;
const HORA_MS = 3_600_000;
const TZ = "America/Caracas";
// Venezuela no tiene horario de verano: siempre UTC-4. Con el desfase fijo, el
// sábado a las 6 se calcula igual aunque el sistema corra en un servidor con
// otra zona horaria (el día que se suba a internet, ese servidor estará en UTC).
const DESFASE_VE_MS = -4 * HORA_MS;
const HORA_ENVIO = 18;

export class ErrorReporte extends Error {}

const r2 = (n: number) => Math.round(n * 100) / 100;

// ─── Formatos ────────────────────────────────────────────────────────────────

const usd = (n: number) =>
  "$" + n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fCorta = (d: Date) =>
  d.toLocaleDateString("es-VE", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });
const fLarga = (d: Date) =>
  d.toLocaleDateString("es-VE", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" });
const fHora = (d: Date) =>
  d.toLocaleTimeString("es-VE", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
/** El día de Venezuela como medianoche UTC: así Excel muestra la fecha correcta. */
const diaVE = (d: Date) => {
  const v = new Date(d.getTime() + DESFASE_VE_MS);
  return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
};
const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const nombreRespaldo = (d: Date) => `cobranza-${diaVE(d).toISOString().slice(0, 10)}.xlsx`;

// ─── Cuándo toca enviar ──────────────────────────────────────────────────────

/** El sábado a las 6:00 pm (hora de Venezuela) más reciente que ya pasó. */
export function ultimoCorte(ahora = new Date()): Date {
  const ve = new Date(ahora.getTime() + DESFASE_VE_MS); // reloj de Venezuela, leído con getUTC*
  const diasDesdeSabado = (ve.getUTCDay() - 6 + 7) % 7;
  let corte = Date.UTC(ve.getUTCFullYear(), ve.getUTCMonth(), ve.getUTCDate() - diasDesdeSabado, HORA_ENVIO);
  if (corte > ve.getTime()) corte -= 7 * DIA_MS; // es sábado pero todavía no son las 6
  return new Date(corte - DESFASE_VE_MS);
}

export function siguienteCorte(ahora = new Date()): Date {
  return new Date(ultimoCorte(ahora).getTime() + 7 * DIA_MS);
}

export async function leerConfig() {
  return prisma.configuracionSistema.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}
type Config = Awaited<ReturnType<typeof leerConfig>>;

export function listaCorreos(s?: string | null): string[] {
  return (s ?? "").split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
}

/**
 * Toca enviar si desde el último envío (o desde que se activó) ya pasó un
 * sábado a las 6. Contar desde la activación evita que, al prenderlo un
 * jueves, salga un reporte en ese mismo instante.
 */
export function tocaEnviar(c: Config, ahora = new Date()): boolean {
  if (!c.cobranzaActivo) return false;
  const base = Math.max(c.cobranzaUltimoEnvio?.getTime() ?? 0, c.cobranzaActivadoEn?.getTime() ?? 0);
  if (base === 0) return false;
  return base < ultimoCorte(ahora).getTime();
}

export function proximoEnvio(c: Config, ahora = new Date()): Date | null {
  if (!c.cobranzaActivo) return null;
  return tocaEnviar(c, ahora) ? ahora : siguienteCorte(ahora);
}

// ─── Cuenta de correo que envía ──────────────────────────────────────────────

const usuarioSmtp = () => (process.env.SMTP_USER ?? "").trim();
// Gmail muestra la clave de aplicación en grupos de 4 con espacios: se quitan.
const claveSmtp = () => (process.env.SMTP_PASS ?? "").replace(/\s+/g, "");

export function estadoSmtp() {
  return { configurado: !!(usuarioSmtp() && claveSmtp()), usuario: usuarioSmtp() || null };
}

function transporte() {
  if (!estadoSmtp().configurado) {
    throw new ErrorReporte(
      "Falta configurar la cuenta de correo que envía el reporte (SMTP_USER y SMTP_PASS en backend/.env).",
    );
  }
  const port = Number(process.env.SMTP_PORT || 465);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port,
    secure: port === 465,
    auth: { user: usuarioSmtp(), pass: claveSmtp() },
  });
}

function traducirError(e: any): string {
  if (e instanceof ErrorReporte) return e.message;
  const code = String(e?.code ?? "");
  if (code === "EAUTH" || e?.responseCode === 535) {
    return "El servidor de correo rechazó el usuario o la clave. Revisa SMTP_USER y SMTP_PASS en backend/.env: con Gmail tiene que ser una clave de aplicación, no la clave normal de la cuenta.";
  }
  if (["ECONNECTION", "ETIMEDOUT", "ENOTFOUND", "ESOCKET", "EDNS"].includes(code)) {
    return "No se pudo conectar con el servidor de correo. ¿El equipo tiene internet?";
  }
  if (code === "EENVELOPE") return "Alguno de los correos destinatarios no es válido.";
  return e?.message ?? String(e);
}

// ─── Respaldo en disco ───────────────────────────────────────────────────────

/** Carpeta donde queda la copia de cada reporte. En el equipo de José: C:\Ecoplast\respaldos\cobranza */
export function carpetaRespaldos(): string {
  return process.env.RESPALDOS_DIR
    ? path.resolve(process.env.RESPALDOS_DIR)
    : path.resolve(process.cwd(), "..", "..", "respaldos", "cobranza");
}

async function guardarRespaldo(excel: Buffer, fecha: Date): Promise<string> {
  const dir = carpetaRespaldos();
  await fs.promises.mkdir(dir, { recursive: true });
  const archivo = path.join(dir, nombreRespaldo(fecha));
  try {
    await fs.promises.writeFile(archivo, excel);
    return archivo;
  } catch (e: any) {
    // Si el Excel de hoy está abierto, Windows no deja sobrescribirlo: se
    // guarda al lado con la hora, para no perder el respaldo.
    if (e?.code !== "EBUSY" && e?.code !== "EPERM") throw e;
    const hhmm = new Date(fecha.getTime() + DESFASE_VE_MS).toISOString().slice(11, 16).replace(":", "");
    const alterno = archivo.replace(/\.xlsx$/, `-${hhmm}.xlsx`);
    await fs.promises.writeFile(alterno, excel);
    return alterno;
  }
}

// ─── Los datos ───────────────────────────────────────────────────────────────

export interface FilaFactura {
  numero: string; estado: string;
  cliente: string; rif: string | null; telefono: string | null; vendedor: string;
  empresa: string | null; despacho: string | null;
  emitida: Date; vence: Date; diasEmitida: number; diasVencida: number;
  total: number; abonado: number; saldo: number;
  ultimoAbono: Date | null;
  tramo: string;
}

export interface Reporte {
  generadoEn: Date;
  facturas: FilaFactura[];
  resumen: { saldo: number; vencido: number; facturado: number; abonado: number; facturas: number; clientes: number };
  porTramo: { tramo: string; facturas: number; saldo: number }[];
  porCliente: {
    cliente: string; rif: string | null; telefono: string | null; vendedor: string;
    facturas: number; vencido: number; saldo: number; diasMasAntigua: number;
  }[];
  porVendedor: { vendedor: string; clientes: number; facturas: number; saldo: number }[];
}

// La antigüedad se cuenta desde que se emitió la factura: así piensa José la
// deuda ("cuánto tiempo lleva sin pagar"). El vencimiento por crédito va aparte.
const TRAMOS = [
  { hasta: 15, nombre: "0 a 15 días" },
  { hasta: 30, nombre: "16 a 30 días" },
  { hasta: 60, nombre: "31 a 60 días" },
  { hasta: Infinity, nombre: "Más de 60 días" },
];
const tramoDe = (dias: number) => TRAMOS.find((t) => dias <= t.hasta)!.nombre;

const ESTADOS: Record<string, string> = {
  EMITIDA: "Emitida", PENDIENTE_COBRO: "Pendiente", COBRADA_PARCIAL: "Abono parcial", VENCIDA: "Vencida",
};

export async function armarReporte(ahora = new Date()): Promise<Reporte> {
  const filas = await prisma.factura.findMany({
    where: { estado: { not: "ANULADA" }, saldoPendiente: { gt: 0 } },
    select: {
      numero: true, estado: true, fechaEmision: true, fechaVencimiento: true,
      totalNeto: true, totalPagado: true, saldoPendiente: true,
      cliente: {
        select: { nombre: true, rif: true, telefono: true, diasCredito: true, vendedor: { select: { nombre: true } } },
      },
      empresa: { select: { nombre: true } },
      ordenDespacho: { select: { numero: true } },
      pagos: { select: { pago: { select: { fecha: true } } } },
    },
  });

  const facturas: FilaFactura[] = filas.map((f) => {
    const emitida = f.fechaEmision;
    const vence = f.fechaVencimiento ?? new Date(emitida.getTime() + (f.cliente?.diasCredito ?? 0) * DIA_MS);
    const diasEmitida = Math.max(0, Math.floor((ahora.getTime() - emitida.getTime()) / DIA_MS));
    const diasVencida = Math.max(0, Math.floor((ahora.getTime() - vence.getTime()) / DIA_MS));
    const abonos = f.pagos.map((p) => p.pago?.fecha?.getTime() ?? 0).filter(Boolean);
    return {
      numero: f.numero,
      estado: ESTADOS[f.estado] ?? f.estado,
      cliente: f.cliente?.nombre ?? "—",
      rif: f.cliente?.rif ?? null,
      telefono: f.cliente?.telefono ?? null,
      vendedor: f.cliente?.vendedor?.nombre ?? "Sin vendedor",
      empresa: f.empresa?.nombre ?? null,
      despacho: f.ordenDespacho?.numero ?? null,
      emitida, vence, diasEmitida, diasVencida,
      total: Number(f.totalNeto),
      abonado: Number(f.totalPagado),
      saldo: Number(f.saldoPendiente),
      ultimoAbono: abonos.length ? new Date(Math.max(...abonos)) : null,
      tramo: tramoDe(diasEmitida),
    };
  });

  // Por cliente, de mayor a menor deuda
  const mapaCli = new Map<string, Reporte["porCliente"][number]>();
  for (const f of facturas) {
    const c = mapaCli.get(f.cliente) ?? {
      cliente: f.cliente, rif: f.rif, telefono: f.telefono, vendedor: f.vendedor,
      facturas: 0, vencido: 0, saldo: 0, diasMasAntigua: 0,
    };
    c.facturas++;
    c.saldo += f.saldo;
    if (f.diasVencida > 0) c.vencido += f.saldo;
    c.diasMasAntigua = Math.max(c.diasMasAntigua, f.diasEmitida);
    mapaCli.set(f.cliente, c);
  }
  const porCliente = [...mapaCli.values()]
    .map((c) => ({ ...c, saldo: r2(c.saldo), vencido: r2(c.vencido) }))
    .sort((a, b) => b.saldo - a.saldo);

  // El detalle va agrupado por cliente (en el mismo orden) y, dentro, por fecha
  const orden = new Map(porCliente.map((c, i) => [c.cliente, i]));
  facturas.sort((a, b) => orden.get(a.cliente)! - orden.get(b.cliente)! || a.emitida.getTime() - b.emitida.getTime());

  const mapaVen = new Map<string, { vendedor: string; clientes: Set<string>; facturas: number; saldo: number }>();
  for (const f of facturas) {
    const v = mapaVen.get(f.vendedor) ?? { vendedor: f.vendedor, clientes: new Set<string>(), facturas: 0, saldo: 0 };
    v.clientes.add(f.cliente);
    v.facturas++;
    v.saldo += f.saldo;
    mapaVen.set(f.vendedor, v);
  }
  const porVendedor = [...mapaVen.values()]
    .map((v) => ({ vendedor: v.vendedor, clientes: v.clientes.size, facturas: v.facturas, saldo: r2(v.saldo) }))
    .sort((a, b) => b.saldo - a.saldo);

  const porTramo = TRAMOS.map((t) => {
    const del = facturas.filter((f) => f.tramo === t.nombre);
    return { tramo: t.nombre, facturas: del.length, saldo: r2(del.reduce((s, f) => s + f.saldo, 0)) };
  });

  const suma = (fn: (f: FilaFactura) => number) => r2(facturas.reduce((s, f) => s + fn(f), 0));

  return {
    generadoEn: ahora,
    facturas,
    resumen: {
      saldo: suma((f) => f.saldo),
      vencido: suma((f) => (f.diasVencida > 0 ? f.saldo : 0)),
      facturado: suma((f) => f.total),
      abonado: suma((f) => f.abonado),
      facturas: facturas.length,
      clientes: porCliente.length,
    },
    porTramo, porCliente, porVendedor,
  };
}

// ─── El correo ───────────────────────────────────────────────────────────────
// HTML con estilos en línea y tablas: es lo único que Gmail y Outlook respetan.

export function htmlReporte(
  rep: Reporte,
  opts: { atrasadoDesde?: Date | null; archivo?: string | null } = {},
): string {
  const r = rep.resumen;
  const th = (t: string, der = false) =>
    `<th style="padding:7px 9px;background:#1e293b;color:#ffffff;font-size:11px;font-weight:600;text-align:${der ? "right" : "left"};white-space:nowrap">${t}</th>`;
  const td = (v: string, estilo = "") =>
    `<td style="padding:6px 9px;border-bottom:1px solid #e8edf3;font-size:12px;color:#1e293b;background:#ffffff;${estilo}">${v}</td>`;
  const tdR = (v: string, estilo = "") => td(v, `text-align:right;white-space:nowrap;${estilo}`);
  const tabla = (cabecera: string, cuerpo: string, pie = "") =>
    `<table cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:6px 0 22px">` +
    `<thead><tr>${cabecera}</tr></thead><tbody>${cuerpo}</tbody>${pie}</table>`;
  const filaPie = (celdas: string) => `<tfoot><tr>${celdas}</tr></tfoot>`;
  const tdPie = (v: string, der = false) =>
    `<td style="padding:7px 9px;background:#e2e8f0;font-size:12px;font-weight:700;color:#0f172a;${der ? "text-align:right;white-space:nowrap" : ""}">${v}</td>`;
  const titulo = (t: string, sub = "") =>
    `<h3 style="margin:24px 0 2px;font-size:14px;color:#0f172a">${t}</h3>` +
    (sub ? `<div style="font-size:11px;color:#64748b;margin-bottom:4px">${sub}</div>` : "");
  const colorDias = (d: number) => (d > 60 ? "#dc2626" : d > 30 ? "#ea580c" : d > 15 ? "#b45309" : "#475569");
  const tarjeta = (etiqueta: string, valor: string, color = "#0f172a") =>
    `<td style="padding:12px 14px;border:1px solid #e2e8f0;border-radius:8px;background:#ffffff;vertical-align:top">` +
    `<div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.4px">${etiqueta}</div>` +
    `<div style="font-size:19px;font-weight:700;color:${color};margin-top:3px;white-space:nowrap">${valor}</div></td>`;
  const pct = (n: number) => n.toLocaleString("es-VE", { maximumFractionDigits: 1 }) + "%";

  const aviso = opts.atrasadoDesde
    ? `<div style="background:#fef3c7;border:1px solid #fcd34d;color:#92400e;padding:10px 14px;font-size:12px;margin:0 0 12px;border-radius:8px">` +
      `Este reporte debía salir el ${fLarga(opts.atrasadoDesde)} a las 6:00 pm, pero el equipo del sistema estaba apagado a esa hora. Las cifras son las de hoy.</div>`
    : "";

  let cuerpo = "";
  if (rep.facturas.length === 0) {
    cuerpo = `<p style="font-size:14px;color:#16a34a;font-weight:600;margin:18px 0">No hay facturas pendientes por cobrar.</p>`;
  } else {
    // Antigüedad
    const colores = ["#475569", "#b45309", "#ea580c", "#dc2626"];
    const mayor = Math.max(...rep.porTramo.map((t) => t.saldo), 1);
    const filasTramo = rep.porTramo.map((t, i) => {
      const ancho = Math.round((t.saldo / mayor) * 140);
      const barra =
        `<div style="background:#e8edf3;height:7px;border-radius:4px;width:140px">` +
        `<div style="background:${colores[i]};height:7px;border-radius:4px;width:${ancho}px"></div></div>`;
      return `<tr>${td(`<b style="color:${colores[i]}">${t.tramo}</b>`)}${tdR(String(t.facturas))}` +
        `${tdR(usd(t.saldo), "font-weight:600")}${tdR(r.saldo > 0 ? pct((t.saldo / r.saldo) * 100) : "—")}${td(barra)}</tr>`;
    }).join("");

    const filasVen = rep.porVendedor.map((v) =>
      `<tr>${td(`<b>${esc(v.vendedor)}</b>`)}${tdR(String(v.clientes))}${tdR(String(v.facturas))}${tdR(usd(v.saldo), "font-weight:700")}</tr>`,
    ).join("");

    const filasCli = rep.porCliente.map((c) =>
      `<tr>${td(`<b>${esc(c.cliente)}</b>`)}${td(esc(c.vendedor), "color:#64748b")}${tdR(String(c.facturas))}` +
      `${tdR(c.vencido > 0 ? usd(c.vencido) : "—", c.vencido > 0 ? "color:#ea580c" : "color:#94a3b8")}` +
      `${tdR(usd(c.saldo), "font-weight:700")}${tdR(`<b style="color:${colorDias(c.diasMasAntigua)}">${c.diasMasAntigua} d</b>`)}</tr>`,
    ).join("");

    const filasDet = rep.facturas.map((f) =>
      `<tr>${td(`<b>${esc(f.numero)}</b>${f.despacho ? `<div style="font-size:10px;color:#94a3b8">${esc(f.despacho)}</div>` : ""}`)}` +
      `${td(esc(f.cliente))}${td(fCorta(f.emitida), "white-space:nowrap")}` +
      `${td(fCorta(f.vence) + (f.diasVencida > 0 ? `<div style="font-size:10px;color:#dc2626">vencida hace ${f.diasVencida} d</div>` : ""), "white-space:nowrap")}` +
      `${tdR(`<b style="color:${colorDias(f.diasEmitida)}">${f.diasEmitida}</b>`)}` +
      `${tdR(usd(f.total))}${tdR(f.abonado > 0 ? usd(f.abonado) : "—", "color:#16a34a")}` +
      `${tdR(usd(f.saldo), "font-weight:700")}${td(f.ultimoAbono ? fCorta(f.ultimoAbono) : "—", "white-space:nowrap;color:#64748b")}</tr>`,
    ).join("");

    cuerpo =
      titulo("Antigüedad de la deuda", "Días desde que se emitió cada factura") +
      tabla(th("Antigüedad") + th("Facturas", true) + th("Saldo", true) + th("% del total", true) + th(""), filasTramo) +
      titulo("Por vendedor") +
      tabla(th("Vendedor") + th("Clientes", true) + th("Facturas", true) + th("Saldo", true), filasVen) +
      titulo("Por cliente", "De mayor a menor deuda") +
      tabla(
        th("Cliente") + th("Vendedor") + th("Facturas", true) + th("Vencido", true) + th("Saldo", true) + th("La más antigua", true),
        filasCli,
        filaPie(tdPie("TOTAL") + tdPie("") + tdPie(String(r.facturas), true) + tdPie(usd(r.vencido), true) + tdPie(usd(r.saldo), true) + tdPie("")),
      ) +
      titulo("Detalle de facturas", "Días = días desde que se emitió") +
      tabla(
        th("Factura") + th("Cliente") + th("Emitida") + th("Vence") + th("Días", true) +
          th("Total", true) + th("Abonado", true) + th("Saldo", true) + th("Último abono"),
        filasDet,
        filaPie(tdPie("TOTAL") + tdPie("") + tdPie("") + tdPie("") + tdPie("") +
          tdPie(usd(r.facturado), true) + tdPie(usd(r.abonado), true) + tdPie(usd(r.saldo), true) + tdPie("")),
      );
  }

  return `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:16px;background:#eef2f6">
<div style="font-family:'Segoe UI',Arial,Helvetica,sans-serif;max-width:960px;margin:0 auto;color:#1e293b">
  <div style="background:#1e293b;color:#ffffff;padding:18px 22px;border-radius:10px 10px 0 0">
    <div style="font-size:11px;letter-spacing:.6px;color:#94a3b8;text-transform:uppercase">Ecoplast · Reporte semanal de cobranza</div>
    <div style="font-size:21px;font-weight:700;margin-top:3px">Facturas pendientes por cobrar</div>
    <div style="font-size:13px;color:#cbd5e1;margin-top:4px">Al ${fLarga(rep.generadoEn)}, ${fHora(rep.generadoEn)}</div>
  </div>
  <div style="background:#f8fafc;padding:18px 22px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px">
    ${aviso}
    <table cellpadding="0" cellspacing="0" width="100%" style="border-collapse:separate;border-spacing:8px 0;margin:0 0 8px"><tr>
      ${tarjeta("Total por cobrar", usd(r.saldo), "#dc2626")}
      ${tarjeta("Ya vencido", usd(r.vencido), "#ea580c")}
      ${tarjeta("Facturas", String(r.facturas))}
      ${tarjeta("Clientes", String(r.clientes))}
    </tr></table>
    <div style="font-size:11px;color:#64748b;padding:0 8px">De ${usd(r.facturado)} facturados en estas facturas, ya se abonaron ${usd(r.abonado)}.</div>
    ${cuerpo}
    <p style="font-size:11px;color:#94a3b8;margin:20px 0 0;line-height:1.6">
      Adjunto va el Excel con todo el detalle.${opts.archivo ? ` Una copia quedó guardada en el equipo del sistema: ${esc(opts.archivo)}` : ""}<br>
      Reporte automático del Sistema de Gestión Ecoplast. Sale todos los sábados a las 6:00 pm.
    </p>
  </div>
</div>
</body></html>`;
}

// ─── El Excel ────────────────────────────────────────────────────────────────

export async function excelReporte(rep: Reporte): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sistema Ecoplast";
  wb.created = rep.generadoEn;
  const MONEDA = '"$"#,##0.00';
  const FECHA = "dd/mm/yyyy";
  const r = rep.resumen;

  const cabecera = (row: ExcelJS.Row) => {
    row.eachCell((c) => {
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
      c.alignment = { vertical: "middle", wrapText: true };
    });
    row.height = 22;
  };
  const total = (row: ExcelJS.Row) => {
    row.eachCell((c) => {
      c.font = { bold: true };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
    });
  };

  // ── Hoja 1: Resumen ────────────────────────────────────────────────────────
  const hr = wb.addWorksheet("Resumen");
  hr.columns = [{ width: 36 }, { width: 12 }, { width: 18 }, { width: 13 }];
  hr.addRow(["Ecoplast — Facturas pendientes por cobrar"]).font = { bold: true, size: 14 };
  hr.addRow([`Al ${fLarga(rep.generadoEn)}, ${fHora(rep.generadoEn)}`]).font = { color: { argb: "FF64748B" } };
  hr.addRow([]);
  cabecera(hr.addRow(["Resumen", "Facturas", "Monto"]));
  const dato = (etiqueta: string, cantidad: number | null, monto: number | null) => {
    const row = hr.addRow([etiqueta, cantidad, monto]);
    row.getCell(3).numFmt = MONEDA;
  };
  dato("Total por cobrar", r.facturas, r.saldo);
  dato("Ya vencido", null, r.vencido);
  dato("Clientes con deuda", r.clientes, null);
  dato("Facturado en estas facturas", null, r.facturado);
  dato("Ya abonado a estas facturas", null, r.abonado);
  hr.addRow([]);
  cabecera(hr.addRow(["Antigüedad (días desde emitida)", "Facturas", "Saldo", "% del total"]));
  for (const t of rep.porTramo) {
    const row = hr.addRow([t.tramo, t.facturas, t.saldo, r.saldo > 0 ? t.saldo / r.saldo : 0]);
    row.getCell(3).numFmt = MONEDA;
    row.getCell(4).numFmt = "0.0%";
  }
  hr.addRow([]);
  cabecera(hr.addRow(["Vendedor", "Facturas", "Saldo", "Clientes"]));
  for (const v of rep.porVendedor) {
    hr.addRow([v.vendedor, v.facturas, v.saldo, v.clientes]).getCell(3).numFmt = MONEDA;
  }

  // ── Hoja 2: Por cliente ────────────────────────────────────────────────────
  const hc = wb.addWorksheet("Por cliente");
  hc.columns = [
    { header: "Cliente", key: "cliente", width: 38 },
    { header: "RIF", key: "rif", width: 14 },
    { header: "Teléfono", key: "telefono", width: 15 },
    { header: "Vendedor", key: "vendedor", width: 22 },
    { header: "Facturas", key: "facturas", width: 10 },
    { header: "Vencido", key: "vencido", width: 15, style: { numFmt: MONEDA } },
    { header: "Saldo", key: "saldo", width: 15, style: { numFmt: MONEDA } },
    { header: "Días (la más antigua)", key: "dias", width: 13 },
  ];
  cabecera(hc.getRow(1));
  for (const c of rep.porCliente) hc.addRow({ ...c, dias: c.diasMasAntigua });
  const nc = rep.porCliente.length;
  if (nc) {
    total(hc.addRow({
      cliente: "TOTAL",
      facturas: { formula: `SUM(E2:E${nc + 1})`, result: r.facturas },
      vencido: { formula: `SUM(F2:F${nc + 1})`, result: r.vencido },
      saldo: { formula: `SUM(G2:G${nc + 1})`, result: r.saldo },
    }));
  }
  hc.views = [{ state: "frozen", ySplit: 1 }];
  hc.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 8 } };

  // ── Hoja 3: Facturas ───────────────────────────────────────────────────────
  const hf = wb.addWorksheet("Facturas");
  hf.columns = [
    { header: "Factura", key: "numero", width: 11 },
    { header: "Cliente", key: "cliente", width: 36 },
    { header: "RIF", key: "rif", width: 14 },
    { header: "Vendedor", key: "vendedor", width: 22 },
    { header: "Empresa", key: "empresa", width: 16 },
    { header: "Despacho", key: "despacho", width: 11 },
    { header: "Emitida", key: "emitida", width: 12, style: { numFmt: FECHA } },
    { header: "Vence", key: "vence", width: 12, style: { numFmt: FECHA } },
    { header: "Días emitida", key: "diasEmitida", width: 10 },
    { header: "Días vencida", key: "diasVencida", width: 10 },
    { header: "Total", key: "total", width: 14, style: { numFmt: MONEDA } },
    { header: "Abonado", key: "abonado", width: 14, style: { numFmt: MONEDA } },
    { header: "Saldo", key: "saldo", width: 14, style: { numFmt: MONEDA } },
    { header: "Último abono", key: "ultimoAbono", width: 13, style: { numFmt: FECHA } },
    { header: "Estado", key: "estado", width: 14 },
    { header: "Antigüedad", key: "tramo", width: 15 },
  ];
  cabecera(hf.getRow(1));
  for (const f of rep.facturas) {
    hf.addRow({
      ...f,
      emitida: diaVE(f.emitida),
      vence: diaVE(f.vence),
      ultimoAbono: f.ultimoAbono ? diaVE(f.ultimoAbono) : null,
    });
  }
  const nf = rep.facturas.length;
  if (nf) {
    total(hf.addRow({
      numero: "TOTAL",
      total: { formula: `SUM(K2:K${nf + 1})`, result: r.facturado },
      abonado: { formula: `SUM(L2:L${nf + 1})`, result: r.abonado },
      saldo: { formula: `SUM(M2:M${nf + 1})`, result: r.saldo },
    }));
  }
  hf.views = [{ state: "frozen", ySplit: 1 }];
  hf.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 16 } };

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ─── Enviar ──────────────────────────────────────────────────────────────────

let enviando = false;

/**
 * Arma el reporte, guarda el respaldo y lo manda por correo. Lo usan el
 * programador de los sábados ("programado") y el botón "Enviar ahora" de
 * Configuración ("manual").
 */
export async function ejecutarEnvio(motivo: "programado" | "manual") {
  if (enviando) throw new ErrorReporte("Ya se está enviando un reporte en este momento. Espera un minuto.");
  enviando = true;
  const ahora = new Date();
  let archivo: string | null = null;
  try {
    const cfg = await leerConfig();
    const destinatarios = listaCorreos(cfg.cobranzaCorreos);
    if (destinatarios.length === 0) throw new ErrorReporte("No hay correos configurados para recibir el reporte.");

    const rep = await armarReporte(ahora);
    const excel = await excelReporte(rep);
    // El respaldo se guarda ANTES de enviar: si el correo falla, la copia queda igual.
    archivo = await guardarRespaldo(excel, ahora);

    const corte = ultimoCorte(ahora);
    const atrasadoDesde = motivo === "programado" && ahora.getTime() - corte.getTime() > 2 * HORA_MS ? corte : null;

    await transporte().sendMail({
      from: process.env.SMTP_FROM?.trim() || `"Sistema Ecoplast" <${usuarioSmtp()}>`,
      to: destinatarios.join(", "),
      subject: `Cobranza pendiente al ${fCorta(ahora)}: ${usd(rep.resumen.saldo)} en ${rep.resumen.facturas} facturas`,
      html: htmlReporte(rep, { atrasadoDesde, archivo }),
      attachments: [{ filename: path.basename(archivo), content: excel }],
    });

    await prisma.configuracionSistema.update({
      where: { id: 1 },
      data: { cobranzaUltimoEnvio: ahora, cobranzaUltimoError: null },
    });
    return { destinatarios, archivo, saldo: rep.resumen.saldo, facturas: rep.resumen.facturas };
  } catch (e) {
    let msg = traducirError(e);
    if (archivo) msg += ` El respaldo en Excel sí quedó guardado en ${archivo}`;
    await prisma.configuracionSistema
      .update({ where: { id: 1 }, data: { cobranzaUltimoError: `${fCorta(ahora)} ${fHora(ahora)} — ${msg}` } })
      .catch(() => {});
    throw new ErrorReporte(msg);
  } finally {
    enviando = false;
  }
}
