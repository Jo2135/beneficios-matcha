// Unificacion del catalogo (una sola vez, sesion 2026-08-31).
//
// 1. Corrige TUGR-2-PEAD: estaba guardado como 4" cuando es la tuberia de 2".
// 2. Marca el material (PVC / PEAD) en el nombre de la familia gris.
// 3. Une los productos repetidos: el historico pasa al producto con codigo y la
//    copia queda inactiva (no se borra, para poder rastrearla).
// 4. Borra la fila de prueba.
//
// Correr con:  npm run productos:unificar        (muestra lo que haria)
//              npm run productos:unificar -- --aplicar
import { prisma } from "../lib/prisma";
import { fusionarProductos } from "../lib/fusionarProductos";

const APLICAR = process.argv.includes("--aplicar");
const log = (s: string) => console.log(s);

/** Pasa el historico de la copia al producto que se conserva. */
async function fusionar(principalId: number, copiaId: number) {
  const r = await fusionarProductos(principalId, copiaId, { simular: !APLICAR });
  if (!r.ok) { log("   !! " + r.error); return; }
  const m = r.movidas;
  log("   #" + copiaId + " " + r.copia!.nombre + " " + r.copia!.medida +
      "  ->  #" + principalId + " " + (r.principal!.codigo ?? "sin cod"));
  log("      cotiz " + m.cotizaciones + " | despachos " + m.despachos + " | facturas " + m.facturas +
      (m.devoluciones ? " | devoluciones " + m.devoluciones : "") +
      (m.compras ? " | compras " + m.compras : "") +
      " | precios que se mudan " + r.preciosMudados +
      (r.preciosDescartados ? " (se descartan " + r.preciosDescartados + ", el principal ya tenia precio)" : ""));
  if (r.planesActualizados.length) log("      planes de carga: " + r.planesActualizados.map((x) => "#" + x).join(", "));
}

(async () => {
  log(APLICAR ? "===== APLICANDO CAMBIOS =====" : "===== SIMULACION (sin --aplicar no se guarda nada) =====");

  // ── 1. TUGR-2-PEAD: es la tuberia de 2", no la de 4" ─────────────────────
  log("");
  log("--- 1. Corregir TUGR-2-PEAD");
  const p38 = await prisma.producto.findFirst({ where: { codigo: "TUGR-2-PEAD" } });
  const am2 = await prisma.producto.findFirst({ where: { codigo: "TUAM-2-PEAD" } });
  const catPead = await prisma.categoriaCosto.findFirst({ where: { nombre: "Negro_PEAD" } });
  if (p38 && am2) {
    log('   medida  "' + p38.medida + '" -> "2" x 3mts"');
    log("   peso    " + p38.pesoUnitarioKg + " kg -> 0.8 kg");
    log('   nombre  "' + p38.nombre + '" -> "Tubería Agua Negra Gris PEAD"');
    if (catPead) log("   categoria " + p38.categoriaId + " -> Negro_PEAD (igual que el de 3\" y 4\")");
    if (APLICAR) {
      await prisma.producto.update({
        where: { id: p38.id },
        data: {
          nombre: "Tubería Agua Negra Gris PEAD",
          medida: '2" x 3mts',
          pesoUnitarioKg: 0.8,
          ...(catPead ? { categoriaId: catPead.id } : {}),
        },
      });
    }
    // Precios: los que quedaron con tarifa de 4" se recalculan con la misma
    // relacion gris/amarillo que ya tienen las listas correctas (80.5%).
    const dets = await prisma.listaPrecioDetalle.findMany({
      where: { productoId: p38.id },
      include: { listaPrecio: { select: { id: true, nombre: true } } },
    });
    for (const d of dets) {
      if (Number(d.precioUnitario) <= 4) continue;               // ya es precio de 2"
      const am = await prisma.listaPrecioDetalle.findFirst({
        where: { listaPrecioId: d.listaPrecio.id, productoId: am2.id },
      });
      if (!am) { log("   !! " + d.listaPrecio.nombre + ": no hay amarillo 2\" de referencia, se deja igual"); continue; }
      const nuevo = Math.round(Number(am.precioUnitario) * 0.805 * 10000) / 10000;
      log("   precio  " + d.listaPrecio.nombre.padEnd(24) + " $" + d.precioUnitario + " -> $" + nuevo);
      if (APLICAR) await prisma.listaPrecioDetalle.update({ where: { id: d.id }, data: { precioUnitario: nuevo } });
    }
  }

  // ── 2. Marcar el material en el nombre de la familia gris ────────────────
  log("");
  log("--- 2. Siglas de material en la familia gris");
  for (const cod of ["TUGR-3-PEAD", "TUGR-4-PEAD"]) {
    const p = await prisma.producto.findFirst({ where: { codigo: cod } });
    if (!p || /pead/i.test(p.nombre)) continue;
    log('   ' + cod + '  "' + p.nombre + '" -> "' + p.nombre + ' PEAD"');
    if (APLICAR) await prisma.producto.update({ where: { id: p.id }, data: { nombre: p.nombre + " PEAD" } });
  }

  // ── 3. Unir los repetidos ────────────────────────────────────────────────
  // [principal, copias]
  const GRUPO_A: [number, number[]][] = [
    [36, [321]], [34, [327]], [35, [326]], [37, [285]],           // PEAD amarillo
    [10, [324]], [11, [325]], [12, [329]], [13, [332]], [14, [333]], // azul
    [58, [281]], [59, [287]], [60, [288]],                        // sifones
    [61, [289]], [62, [313]], [63, [298]],                        // tees
    [64, [282]], [65, [290]], [66, [291]], [67, [284]],           // yees
    [125, [318]],                                                 // naranja PVC
    [52, [283, 286, 331]],                                        // codos 2" inactivos
    [68, [308]],                                                  // manguera verde inactiva
  ];
  const GRUPO_B: [number, number[]][] = [
    [17, [292]], [18, [293]],       // Tubo Gris PVC sin codigo
    [68, [356]],                    // Manguera Verde 1/2" * 100mts
    [198, [360]],                   // Adaptador Macho 1*32
  ];

  log("");
  log("--- 3. Grupo A: copias inactivas");
  for (const [pri, cops] of GRUPO_A) for (const c of cops) await fusionar(pri, c);

  log("");
  log("--- 4. Grupo B: copias activas (sin los codos, quedan pendientes)");
  for (const [pri, cops] of GRUPO_B) for (const c of cops) await fusionar(pri, c);

  // ── 4b. Codos: "Semi Codo" es el codo de 45 grados ───────────────────────
  // Los codigos SC-3-90 y SC-4-90 estaban mal: SC = Semi Codo, que es de 45.
  // Esos codigos correctos (SC-3-45 / SC-4-45) los tenian dos registros sin uso,
  // asi que primero se unen y se libera el codigo.
  log("");
  log("--- 4b. Codos");
  await fusionar(129, 301);   // Semi Codo PVC 3" x 45  ->  CODO 45 3"
  await fusionar(130, 302);   // Semi Codo PVC 4" x 45  ->  CODO 45 4"
  for (const id of [301, 302]) {
    const p = await prisma.producto.findUnique({ where: { id } });
    if (p?.codigo) {
      log("   libera el codigo " + p.codigo + " (#" + id + ")");
      if (APLICAR) await prisma.producto.update({ where: { id }, data: { codigo: null } });
    }
  }
  for (const [id, viejo, nuevo] of [[129, "SC-3-90", "SC-3-45"], [130, "SC-4-90", "SC-4-45"]] as [number, string, string][]) {
    const p = await prisma.producto.findUnique({ where: { id } });
    if (p?.codigo !== viejo) continue;
    log("   #" + id + " " + p.nombre + " " + p.medida + ":  " + viejo + " -> " + nuevo + "  (el semicodo es de 45)");
    if (APLICAR) await prisma.producto.update({ where: { id }, data: { codigo: nuevo } });
  }
  const CODOS: [number, number[]][] = [
    [52, [352]],            // Codo 2"        -> CODO 90 2"
    [54, [355, 279]],       // Codo 3", CODO PVC 3x90 -> CODO 90 3"
    [53, [354]],            // Codo 4"        -> CODO 90 4"
    [55, [351]],            // Semi Codo 2"   -> CODO 45 2"
    [129, [357]],           // Semi Codo 3"   -> CODO 45 3"
    [130, [353, 280]],      // Semi Codo 4", CODO PVC 4x45 -> CODO 45 4"
  ];
  for (const [pri, cops] of CODOS) for (const c of cops) await fusionar(pri, c);

  // Codos rapidos metricos: "Codo Rapido 40mm" es el COR-1 "CODO 40".
  // Los "Codo PVC 50mm" (#295, #330) NO se tocan: dicen PVC y pueden ser
  // sanitarios, no de riego. Estan inactivos y con un solo uso.
  await fusionar(214, 358);
  await fusionar(215, 359);

  // ── 5. Borrar la fila de prueba ──────────────────────────────────────────
  log("");
  log("--- 5. Fila de prueba");
  const prueba = await prisma.producto.findFirst({ where: { id: 70 } });
  if (prueba) {
    const lp = await prisma.listaPrecioDetalle.count({ where: { productoId: 70 } });
    log('   borrar #70 "' + prueba.nombre + " " + prueba.medida + '" (precios de lista a borrar: ' + lp + ")");
    if (APLICAR) {
      await prisma.listaPrecioDetalle.deleteMany({ where: { productoId: 70 } });
      await prisma.producto.delete({ where: { id: 70 } });
    }
  } else log("   ya no existe");

  log("");
  log(APLICAR ? "===== LISTO =====" : "===== SIMULACION: nada se guardo. Repetir con --aplicar =====");
  await prisma.$disconnect();
})();
