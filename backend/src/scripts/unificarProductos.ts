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

const APLICAR = process.argv.includes("--aplicar");
const log = (s: string) => console.log(s);

/** Pasa todo el historico de `copiaId` a `principalId` y desactiva la copia. */
async function fusionar(principalId: number, copiaId: number) {
  const [pri, cop] = await Promise.all([
    prisma.producto.findUnique({ where: { id: principalId } }),
    prisma.producto.findUnique({ where: { id: copiaId } }),
  ]);
  if (!pri || !cop) { log("   !! no existe #" + principalId + " o #" + copiaId); return; }

  const cot = await prisma.cotizacionLinea.count({ where: { productoId: copiaId } });
  const des = await prisma.despachoLinea.count({ where: { productoId: copiaId } });
  const fac = await prisma.facturaLinea.count({ where: { productoId: copiaId } });
  const dev = await prisma.facturaDevolucion.count({ where: { productoId: copiaId } });
  const com = await prisma.compraExternaLinea.count({ where: { productoId: copiaId } });

  // Precios de lista: solo se mudan los de listas donde el principal aun no tiene precio
  const precios = await prisma.listaPrecioDetalle.findMany({ where: { productoId: copiaId } });
  const yaTiene = await prisma.listaPrecioDetalle.findMany({
    where: { productoId: principalId, listaPrecioId: { in: precios.map((p) => p.listaPrecioId) } },
    select: { listaPrecioId: true },
  });
  const ocupadas = new Set(yaTiene.map((p) => p.listaPrecioId));
  const mudar = precios.filter((p) => !ocupadas.has(p.listaPrecioId));
  const descartar = precios.filter((p) => ocupadas.has(p.listaPrecioId));

  log("   #" + copiaId + " " + cop.nombre + " " + cop.medida +
      "  ->  #" + principalId + " " + (pri.codigo ?? "sin cod"));
  log("      cotiz " + cot + " | despachos " + des + " | facturas " + fac +
      (dev ? " | devoluciones " + dev : "") + (com ? " | compras " + com : "") +
      " | precios que se mudan " + mudar.length +
      (descartar.length ? " (se descartan " + descartar.length + ", el principal ya tenia precio)" : ""));

  // Los planes de carga guardan los ids de producto dentro de su JSON: si no se
  // reescriben, la fila desaparece de la matriz al desactivar la copia.
  const planes = await prisma.planCarga.findMany();
  const planesTocados: { id: number; nombre: string }[] = [];
  for (const pl of planes) {
    const prods: { id: number; costo: number }[] = JSON.parse(pl.productosJson || "[]");
    if (!prods.some((x) => x.id === copiaId)) continue;
    planesTocados.push({ id: pl.id, nombre: pl.nombre });
    if (!APLICAR) continue;

    const nuevos = prods.filter((x) => x.id !== copiaId);
    if (!nuevos.some((x) => x.id === principalId)) {
      const viejo = prods.find((x) => x.id === copiaId)!;
      nuevos.push({ id: principalId, costo: viejo.costo });
    }
    const remap = (json: string, sumar: boolean) => {
      const obj: Record<string, number> = JSON.parse(json || "{}");
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(obj)) {
        const [cli, pro] = k.split("_");
        if (Number(pro) !== copiaId) { out[k] = v; continue; }
        const nk = cli + "_" + principalId;
        out[nk] = sumar ? (Number(out[nk] ?? 0) + Number(v)) : (out[nk] ?? v);
      }
      return JSON.stringify(out);
    };
    await prisma.planCarga.update({
      where: { id: pl.id },
      data: {
        productosJson: JSON.stringify(nuevos),
        cantidadesJson: remap(pl.cantidadesJson, true),
        preciosJson: remap(pl.preciosJson, false),
      },
    });
  }
  if (planesTocados.length) {
    log("      planes de carga a corregir: " + planesTocados.map((p) => "#" + p.id).join(", "));
  }

  if (!APLICAR) return;
  await prisma.$transaction(async (tx) => {
    await tx.cotizacionLinea.updateMany({ where: { productoId: copiaId }, data: { productoId: principalId } });
    await tx.despachoLinea.updateMany({ where: { productoId: copiaId }, data: { productoId: principalId } });
    await tx.facturaLinea.updateMany({ where: { productoId: copiaId }, data: { productoId: principalId } });
    await tx.facturaDevolucion.updateMany({ where: { productoId: copiaId }, data: { productoId: principalId } });
    await tx.compraExternaLinea.updateMany({ where: { productoId: copiaId }, data: { productoId: principalId } });
    for (const p of mudar) {
      await tx.listaPrecioDetalle.update({ where: { id: p.id }, data: { productoId: principalId } });
    }
    for (const p of descartar) await tx.listaPrecioDetalle.delete({ where: { id: p.id } });
    await tx.producto.update({
      where: { id: copiaId },
      data: { activo: false, descripcion: "Unificado con #" + principalId + " (" + (pri.codigo ?? pri.nombre) + ") el 2026-08-31" },
    });
  });
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
