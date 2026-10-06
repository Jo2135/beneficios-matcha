# CLAUDE.md — Sistema de Gestión Ecoplast / Beneficios Matcha

> **Lee este archivo completo antes de tocar cualquier código.**
> Contiene las reglas de negocio, arquitectura, decisiones técnicas y tareas pendientes del proyecto.

---

## 1. Descripción del Proyecto

Sistema de gestión para **Ecoplast**, distribuidor venezolano de tuberías y mangueras plásticas.
Gestiona cotizaciones → despachos → facturas → cobros → distribución de ganancias entre socios.

**Empresa real:** Ecoplast F.P. (Venezuela). Moneda principal: **USD / USDT**. También maneja Bs y COP.

**Rama de desarrollo activa:** `claude/fervent-wright-BUkm4`
**Repositorio:** `jo2135/beneficios-matcha`

---

## 2. Stack Tecnológico

| Capa       | Tecnología                                                      |
|------------|-----------------------------------------------------------------|
| Frontend   | React 19 + TypeScript + Vite, react-router-dom v7, @tanstack/react-query v5 |
| UI / gráficos | Lucide-react (íconos), Recharts (gráficas), jsPDF + jspdf-autotable (PDFs) |
| Backend    | Express 5 + TypeScript + tsx (hot reload)                       |
| ORM        | Prisma 7 + PostgreSQL                                           |
| Auth       | JWT (jsonwebtoken) + bcryptjs                                   |
| Imágenes   | multer (upload local)                                           |

---

## 3. Estructura de Carpetas

```
beneficios-matcha/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma          # Modelos DB
│   │   └── migrations/            # Historial de migraciones SQL
│   └── src/
│       ├── index.ts               # Entry point (aplica migrate deploy al arrancar)
│       ├── lib/prisma.ts          # Singleton PrismaClient
│       ├── controllers/           # Lógica por dominio
│       │   ├── auth.controller.ts
│       │   ├── clientes.controller.ts
│       │   ├── cotizaciones.controller.ts
│       │   ├── cuentas.controller.ts
│       │   ├── despachos.controller.ts
│       │   ├── empresas.controller.ts
│       │   ├── facturas.controller.ts
│       │   ├── ganancias.controller.ts   ← MÓDULO CRÍTICO (ver Sección 8)
│       │   ├── imagenes.controller.ts
│       │   ├── listaPrecios.controller.ts
│       │   ├── pagos.controller.ts
│       │   ├── productos.controller.ts
│       │   ├── reportes.controller.ts
│       │   ├── seguimiento.controller.ts
│       │   └── tasaCambio.controller.ts
│       └── routes/
│           └── index.ts           # Todas las rutas centralizadas
│
└── frontend/
    └── src/
        ├── api/
        │   ├── client.ts          # Axios con base URL y JWT header
        │   └── endpoints.ts       # Funciones API por dominio
        ├── contexts/
        │   └── AuthContext.tsx    # Proveedor de usuario/rol
        ├── components/
        │   └── Layout.tsx         # Sidebar + nav
        ├── pages/
        │   ├── Dashboard.tsx
        │   ├── Clientes.tsx
        │   ├── Catalogo.tsx
        │   ├── ListasPrecios.tsx
        │   ├── Cotizaciones.tsx
        │   ├── NuevaCotizacion.tsx
        │   ├── Despachos.tsx
        │   ├── GananciasDespacho.tsx  ← MÓDULO CRÍTICO (ver Sección 8)
        │   ├── Facturas.tsx
        │   ├── Pagos.tsx
        │   ├── OrdenDespachos.tsx
        │   ├── ReporteComisiones.tsx  ← incluye Análisis Visual con gráficas
        │   ├── Usuarios.tsx
        │   ├── Configuracion.tsx
        │   └── CalendarioCobros.tsx
        └── App.tsx                # Rutas protegidas por rol
```

---

## 4. Comandos de Desarrollo

```bash
# Backend (puerto 5101)
cd backend
npm run dev          # tsx watch (hot reload)
npx prisma studio    # UI para inspeccionar DB

# Frontend (puerto 5173)
cd frontend
npm run dev

# Migraciones
cd backend
npx prisma migrate dev --name <nombre>   # crea nueva migración
npx prisma generate                       # regenerar cliente después de cambiar schema
npx prisma migrate deploy                 # aplica migraciones pendientes (prod)
```

**IMPORTANTE:** Después de cambiar `schema.prisma` siempre ejecutar `npx prisma generate` o el cliente TypeScript no reconocerá los nuevos campos.

---

## 5. Variables de Entorno

El backend necesita `.env` con:
```
DATABASE_URL=postgresql://user:password@host:5432/dbname
JWT_SECRET=tu_secreto_jwt
PORT=5101
```

> ⚠️ **`JWT_SECRET` no es opcional.** Si falta, `backend/src/middleware/auth.ts` cae en un valor por
> defecto escrito en el código, y quien lo conozca puede fabricarse una sesión de MASTER sin saber
> ninguna contraseña. En el equipo de José ya quedó definido (3-oct-2026, 64 caracteres al azar).
> **El día que el sistema se mude a un servidor hay que definirlo allá también**, o vuelve a usar el
> valor por defecto. Cambiarlo obliga a todos a iniciar sesión de nuevo.

Opcional: la cuenta que envía el **reporte semanal de cobranza** (ver Sección 14, punto 7):
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=cuenta@gmail.com
SMTP_PASS=clave_de_aplicacion_de_16_letras   # Gmail: clave de aplicación, NO la clave normal
SMTP_FROM=                                   # opcional; vacío = SMTP_USER
RESPALDOS_DIR=                               # opcional; por defecto C:\Ecoplast\respaldos\cobranza
```
Los destinatarios y el encendido NO van en `.env`: se configuran en la pantalla Configuración y se guardan en `ConfiguracionSistema`. Claude no escribe claves en `.env`: las pone José.

---

## 6. Roles de Usuario

| Rol      | Acceso                                                           |
|----------|------------------------------------------------------------------|
| MASTER   | Todo, incluyendo Configuración                                   |
| ADMIN    | Todo excepto Configuración                                       |
| VENDEDOR | Dashboard, Clientes, Catálogo, Cotizaciones, Calendario         |

La lógica de rutas protegidas está en `frontend/src/App.tsx`.

---

## 7. Flujo de Negocio Principal

```
Cliente → Cotización → [Aprobada] → Despacho → Factura → Pago
                                       ↓
                              Distribución de Ganancias
```

1. **Cotización**: El vendedor crea una cotización con líneas de productos y precios.
2. **Despacho**: Se crea desde una cotización aprobada. Un despacho puede incluir productos de múltiples clientes/vendedores.
3. **Factura**: Se genera al finalizar el despacho. Registra cantidades reales despachadas.
4. **Pago**: El cliente abona contra sus facturas pendientes.
5. **Ganancias**: Por cada despacho se calcula la distribución de utilidades entre socios (ver Sección 8).

---

## 8. Módulo de Distribución de Ganancias (CRÍTICO)

### Archivos clave
- **Backend:** `backend/src/controllers/ganancias.controller.ts`
- **Frontend:** `frontend/src/pages/GananciasDespacho.tsx`
- **Ruta API:** `GET /api/despachos/:id/ganancias`
- **Ruta frontend:** `/despachos/:id/ganancias` (botón "Ganancias" en la fila del despacho, solo si tiene factura)
- **Ruta toggle servicio externo:** `PATCH /api/despachos/lineas/:lineaId/servicio-externo`

### ⚠️ Problema conocido: productos sin código
Los productos en la DB tienen el campo `codigo` en NULL (no se han cargado). La detección de categoría se hace **por nombre del producto** como fallback. Ver función `detectarPorNombre()` en el controlador.

### Categorías de materiales y costos por kg

| Clave interna | Descripción              | Costo/kg USD |
|---------------|--------------------------|-------------|
| manguera34    | Manguera 3/8" – 3/4"    | $1.083      |
| manguera13    | Manguera 1" – 3"         | $1.090      |
| azul          | Tubo/Manguera Azul       | $1.580      |
| negro         | Tubo Negro (eléctrico/agua) | $1.280   |
| blanco        | Tubo Blanco Eléctrico    | $1.580      |
| amarillo      | Tubería PEAD / Aguas Negras | $1.590   |

### Ganancias por kg (I25/I26 — Ganancias_1)

| Clave interna | Descripción              | Ganancia/kg |
|---------------|--------------------------|------------|
| manguera34    | Manguera 3/8" – 3/4"    | $0.125     |
| manguera13    | Manguera 1" – 3"         | $0.200     |
| azul          | Tubo Azul / Manguera Azul | $0.190    |
| gris          | Tubo Gris Agua Blanca    | $0.180     |
| negro_elec    | Tubo Negro Eléctrico     | $0.260     |
| blanco_elec   | Tubo Blanco Eléctrico    | $0.350     |

**Distribución I25/I26:**
- Sr. Alberto Gral = total ganancia × 60%  → celda **I25**
- Capital          = total ganancia × 40%  → celda **I26**

### Ganancias PEAD / Aguas Negras (H47)

La ganancia por PEAD se calcula: `cantidad × pesoGanancia × 0.49`

**Pesos de ganancia PEAD (son MENORES que los pesos en DB — intencional para ahorrar materia prima):**

> **Estos valores son los de fábrica.** Viven como `DEFAULTS` editables en
> `tablas.controller.ts` (grupo "Pesos de Ganancia PEAD (kg)") y José los cambia
> desde la pantalla **Tablas de Ganancias**; lo que edita se guarda en
> `ConfigGanancias` y manda sobre lo de abajo. Hoy tiene puestos 1.30 para
> TUAM-3-PEAD y 2.30 para TUAM-4-PEAD.

| Código        | Kg ganancia | Peso inventario | Nota |
|---------------|-------------|-----------------|------|
| TUAM-2-PEAD   | 0.85        | 0.90            | |
| TUAM-3-PEAD   | 1.20        | 1.30            | José la tiene en 1.30 |
| TUAM-4-PEAD   | 2.25        | 2.30            | José la tiene en 2.30 |
| TUAM-6-PEAD   | 5.50        | 7.00            | |
| TUAM-2-PEAD-R | 1.00        | 1.20            | |
| TUAM-3-PEAD-R | 1.55        | 1.80            | corregido 5-oct-2026; antes 2.45 |
| TUAM-4-PEAD-R | 2.45        | 2.80            | corregido 5-oct-2026; antes 1.55 |
| TUNA-4-PEAD-R | 2.90        | 2.80            | |
| TUGR-2-PEAD   | 0.85        | 0.80            | igualada a la amarilla 5-oct-2026; antes 0.80 |
| TUGR-3-PEAD   | 1.30        | 1.20            | renglón nuevo 5-oct-2026 |
| TUGR-4-PEAD   | 2.10        | 2.10            | renglón nuevo 5-oct-2026; **excepción**: va igual al inventario |

**Regla de la familia gris (José, 5-oct-2026):** la tubería gris de aguas negras
sigue la misma norma que la amarilla del mismo tamaño y su ganancia va a los
mismos beneficiarios (Alberto 42% / Danny 33% / Darwin 25%). La única excepción
es la de 4", cuyo peso de ganancia es igual a su peso de inventario.

**Las reforzadas de 3" y 4" estaban invertidas.** La de 4" pesa más en
inventario (2.80 contra 1.80) pero cobraba el peso menor. Se despacharon 1.653
unidades de 4" y 560 de 3" con los números volteados.

Cuando el producto no tiene código —o su código no está en la tabla de arriba—
se infiere desde el nombre/medida con `pesoGananciaPeadFromNombre`, que **consulta
esa misma tabla**: deduce familia (TUAM / TUNA / TUGR), medida y si es reforzada,
arma el código y lo busca. Si esa familia no tiene peso propio para esa medida,
toma el de la **amarilla del mismo tamaño**. Antes esa función era una segunda
copia de los pesos escrita a mano, y por eso se le había olvidado el 6": una
tubería de 6" sin código tomaba 0.80 kg (el peso de una de 2").

**Distribución H47:**
- Sr. Alberto Amarillo = total × 42%
- Danny Amarillo       = total × 33%
- Darwin Amarillo      = total × 25%

### Curvas Eléctricas

Costos unitarios de venta:

| Clave     | USD/curva |
|-----------|-----------|
| CVBL-1/2  | $0.144    |
| CVBL-3/4  | $0.156    |
| CVBL-1    | $0.240    |
| CVNG-1/2  | $0.120    |
| CVNG-3/4  | $0.132    |
| CVNG-1    | $0.145    |

Fórmulas:
- `curvaTotalVenta` = suma(cantidad × costoUnit)
- `curvaFabrica`    = suma(cantidad/11.5 × costoTubo × 0.92)
- `curvaMuchachas`  = curvaTotalVenta − curvaFabrica
- `curvaAlberto`    = curvaFabrica − curvaMaterial

### Gastos Generales (escalonados por total factura)

| Rango factura   | Obreros | Pigmento | Electricidad |
|-----------------|---------|----------|--------------|
| ≤ $8,000        | $600    | $100     | $100         |
| $8,001–$12,000  | $1,000  | $200     | $200         |
| $12,001–$20,000 | $1,200  | $250     | $250         |
| > $20,000       | $1,500  | $300     | $300         |

### Ganancias_2 (porcentajes sobre factura total)

Fórmula: `x − x / (1 + tasa)` donde `x = totalNeto de la factura`

| Beneficiario | Tasa   |
|--------------|--------|
| SBUG         | 1.5%   |
| Yolanda      | 0.75%  |
| Sandra       | 0.75%  |
| Comisiones   | 2.2%   |

### Servicio Externo de Fabricación

Algunas líneas de mangueras o tuberías eléctricas pueden ser fabricadas por terceros. Hay un toggle por línea en la UI. Al activar se ingresa el costo manual. Se persiste en `DespachoLinea.esServicioExterno` y `DespachoLinea.costoServicioExterno`.

Elegibles: manguera, tubo azul, tubo negro eléctrico, tubo blanco eléctrico.

---

## 9. Detección de Categoría por Nombre (sin código)

Función `detectarPorNombre(nombre, medida, categoriaNombre)` en `ganancias.controller.ts`:

| Condición en nombre normalizado                              | Categoría asignada |
|--------------------------------------------------------------|--------------------|
| "curva" o "codo electr"                                      | curva (CVBL/CVNG)  |
| "agua negra", "aguas negras", "pead", "amarill+tuber", "naranja+tuber" | pead/amarillo |
| "manguera", "agricola", "riego" + tamaño ≥ 1"               | manguera13         |
| "manguera", "agricola", "riego" + tamaño < 1"               | manguera34         |
| "azul" + ("tubo"/"manguera"/"agua")                          | azul               |
| "gris" + ("agua"/"tubo")                                     | gris               |
| "electr" + "negr"                                            | negro_elec         |
| "electr" + "blanc"                                           | blanco_elec        |

La función `norm()` normaliza tildes, mayúsculas y comillas antes de comparar.

---

## 10. PDFs Generados

- **PDF Cotización / Factura estándar:** generado en el frontend con jsPDF + autotable.
- **PDF Gandica (factura especial):** formato diferente para clientes tipo Gandica. Ver `NuevaCotizacion.tsx` y `Despachos.tsx`.
- **PDF Manifiesto de Despacho:** incluye firmas. Ver `Despachos.tsx`.

---

## 11. Gráficas (ReporteComisiones.tsx — Pestaña "Análisis Visual")

Usa **Recharts**. Gráficas implementadas:
- **A:** Ventas por mes (LineChart)
- **B:** Top productos por monto (BarChart horizontal)
- **C:** Top productos por unidades (BarChart horizontal)
- **D:** Top 10 clientes por monto (BarChart horizontal, morado)
- **E:** Top 10 clientes por número de pedidos (BarChart horizontal, ámbar)

---

## 12. Modelos DB Importantes

| Modelo                 | Descripción                                              |
|------------------------|----------------------------------------------------------|
| `Producto`             | Catálogo. `codigo` está NULL en mayoría de registros     |
| `CategoriaCosto`       | Categorías con `factorCostoKg` y `gananciaKg` (no usados en ganancias.controller — se usan tablas hardcoded) |
| `OrdenDespacho`        | El "despacho" que contiene múltiples `DespachoLinea`     |
| `DespachoLinea`        | Línea de producto en despacho. Tiene `esServicioExterno` y `costoServicioExterno` (campos añadidos en migración `20260605000000_add_servicio_externo`) |
| `Factura`              | Generada al finalizar despacho. Tiene `totalNeto`        |
| `SeguimientoCotizacion`| Tabla añadida en migración `20260604023217_...`; listar devuelve `[]` si la tabla no existe aún |

---

## 13. Tareas Pendientes / Mejoras Sugeridas

### Alta prioridad
- [ ] **Cargar códigos de producto en la DB** (columna `codigo` en `Producto`). Una vez cargados, la detección de categoría usará los codes regex directamente y será más precisa. Los códigos esperados siguen el patrón:
  - Manguera: `MGR-3/8`, `MGR-1/2`, `MGR-3/4` → manguera34; `MGR-1`, `MGR-2`, `MGR-3` → manguera13
  - Azul: `MGAZ-*`, `TUAZ-*`
  - PEAD/Aguas Negras: `TUAM-*`, `TUNA-*`, `TUGR-2-*`
  - Curvas Blancas: `CVBL-1/2`, `CVBL-3/4`, `CVBL-1`
  - Curvas Negras: `CVNG-1/2`, `CVNG-3/4`, `CVNG-1`
  - Eléctrico Negro: `TUNG-*`
  - Eléctrico Blanco: `TUBL-*`
  - Gris Agua Blanca: `TUGR-1-*`

- [ ] **Guardar resultados de ganancias en DB** (`DistribucionGanancia` y `DespachoGasto` ya existen en el schema pero no se usan). Actualmente el cálculo es "on the fly" — no hay historial.

### Media prioridad
- [ ] **Módulo de pagos a socios**: Una vez distribuidas las ganancias, registrar que se pagó a cada socio (Sr. Alberto, Danny, Darwin, SBUG, Yolanda, Sandra, Capital).
- [ ] **PDF de distribución de ganancias**: Exportar la distribución como PDF para cada despacho.
- [ ] **Filtros en GananciasDespacho**: Por fecha, por factura.
- [ ] **Verificación de detección**: Añadir endpoint de diagnóstico que liste todos los productos sin categoría detectada.

### Baja prioridad
- [ ] Mejorar `pesoGananciaPeadFromNombre` cuando los códigos estén en DB para usar `PEAD_PESO_CODE` directamente.
- [ ] Test de TypeScript automatizado en CI.
- [ ] Documentar las fórmulas de curvas con referencia exacta a las celdas Excel fuente.

---

## 14. Decisiones Técnicas Importantes

1. **Tablas de costos hardcoded en el controlador**: Las tasas de `COSTO_MAT_KG`, `GANANCIA_KG`, `CURVA_COSTO_UNIT`, etc., están definidas como constantes en `ganancias.controller.ts`. No vienen de la DB. Si cambian los precios hay que actualizar el código.

2. **Pesos PEAD dobles**: El sistema tiene dos conjuntos de pesos para tuberías PEAD:
   - Peso DB (`pesoUnitarioKg`): el peso real para inventario/materiales. Es MÁS ALTO.
   - Peso de ganancia (`PEAD_PESO_CODE`): para calcular utilidades. Es MÁS BAJO (intencional para conservar materia prima contablemente).

3. **Un despacho = múltiples clientes/vendedores**: No hay relación directa 1:1 despacho-cliente. Los clientes llegan a través de las cotizaciones que generaron las líneas del despacho.

4. **Auto-migración al arrancar**: `backend/src/index.ts` ejecuta `npx prisma migrate deploy` en startup para que migraciones pendientes se apliquen automáticamente en producción.

5. **Orden de rutas en Express**: La ruta `GET /despachos/:id/ganancias` debe declararse **ANTES** que `GET /despachos/:id` en `routes/index.ts` para evitar que Express interprete "ganancias" como un ID.

6. **`SeguimientoCotizacion` con catch P2021**: El controlador de seguimiento devuelve `[]` si la tabla no existe todavía (código de error Prisma `P2021`), en lugar de fallar con 500.

7. **Reporte semanal de cobranza** (`backend/src/lib/reporteCobranza.ts` + `jobs/reporteCobranza.ts`): todos los sábados a las 6:00 pm (hora de Venezuela) guarda un Excel con las facturas pendientes en `RESPALDOS_DIR` y lo manda por correo. No usa cron: un `setInterval` dentro del backend revisa cada 5 min si desde el último envío ya pasó un sábado 6 pm. Así, si el equipo estaba apagado, sale al encender (con aviso de atraso). La hora se calcula con UTC-4 fijo (Venezuela no tiene horario de verano), para que funcione igual en un servidor en UTC. El respaldo se guarda ANTES de enviar: si falla el correo, el Excel queda. Tras un fallo reintenta cada hora; el último error se ve en Configuración.

8. **Gastos operativos** (`gastosOperativos.controller.ts` + pantalla `GastosOperativos.tsx`): almuerzos, agua, soldadura, insumos. Flujo de dos pasos pedido por José: primero se carga el pago (fecha, descripción, monto, medio) y después se reparte entre los renglones del balance de uno o varios despachos — un mismo gasto puede ir partido. Cada parte baja el saldo de ese renglón igual que un abono. La asignación guarda el **nombre** del renglón, no su id, para sobrevivir a un "Regenerar" del balance (regenerar borra y recrea los renglones). `getBalance` devuelve esos gastos dentro de cada item (`items[].gastos`) y el frontend los suma a lo pagado, junto con las cuotas.

9. **Capital disponible** (tarjeta en Control y Deudas): `40% Capital` generado menos lo usado (abonos + gastos operativos repartidos a ese renglón). Para los despachos que todavía no tienen balance se calcula al vuelo con `calcularGananciasDespacho`, porque es un gasto fijo que nace al cerrar el despacho y no debe esperar al balance.

10. **Regenerar un balance NO borra los abonos** (`generarBalance`): antes sí lo hacía — borraba los
renglones y la cascada de la base de datos se llevaba sus `BalancePagoCuota`, con el agravante de que el
aviso en pantalla prometía lo contrario (lo detectó una auditoría externa en oct-2026, con $24.184 en
abonos en riesgo). Ahora los abonos y las notas se rescatan por **nombre de renglón** antes de rehacerlo,
igual que los gastos operativos, y todo se hace dentro de una transacción. Un renglón que desaparece del
cálculo pero tiene abonos **se conserva** con su monto anterior: nunca se hace desaparecer plata
registrada. Los montos editados a mano sí vuelven al valor calculado: ese es el propósito de regenerar.

11. **Un solo juego de pesos PEAD** (5-oct-2026): había dos — la tabla editable de
`tablas.controller.ts` y una copia escrita a mano dentro de
`pesoGananciaPeadFromNombre`. Se desfasaron: a la copia le faltaba el 6" y
decidía la familia buscando "negr" en el nombre, con lo cual la amarilla (que se
llama "Tubería Agua **Negra** Amarilla") caía en la rama de la gris. Ahora la
copia no existe: el fallback por nombre arma el código y consulta la tabla
editable. **Al agregar un producto PEAD nuevo, lo correcto es darle su código y
su renglón en Tablas de Ganancias**; el fallback es solo una red de seguridad.

12. **Comisión, flete y socio equivalente van sobre LO DESPACHADO** (6-oct-2026).
Antes las tres se calculaban sobre `cot.lineas` —el pedido original— así que un
faltante se pagaba igual. Regla de José: *lo que se calcula al cotizar es una
referencia, no un compromiso; el número real nace cuando se carga el camión,
porque a veces falta y a veces sobra producto.* Si de 100 tubos salen 50, se
cobra por 50; si después sale el resto en otro camión, se cobra esa parte
entonces; y si salen 110, se cobra por 110.

La base es `cantidadDespachada × precioFinal` de la cotización, **no** las líneas
de la factura, para que el cálculo siga al camión aunque la factura se quede
atrás (pasó en DES-0019). **Las devoluciones no se restan aparte:** registrar una
devolución ya descuenta `cantidadDespachada` y ya baja el `totalNeto` de la
factura (`devoluciones.controller.ts`, paso 3), así que ambas bases vienen netas
— restarlas otra vez las contaría dos veces.

La redirección al socio equivalente **tenía que cambiar junto con las otras dos**:
el pozo de Ganancias_2 se calcula sobre lo facturado y lo que se le quita al
socio se calculaba sobre lo cotizado. Dos cuentas que se restan entre sí medidas
con reglas distintas: en un despacho parcial se le quitaba más de lo que ese
cliente había aportado y el renglón del socio podía quedar **negativo**. Ahora
ambas van sobre lo despachado, así que se anula solo. Además hay un **tope: ningún
socio puede quedar por debajo de cero** (`topesAplicados` dice si se aplicó).

Efecto medido al cambiarlo: $258,64 que se descontaban de más del Extra de
material en 5 despachos (más $5.112,71 de DES-0006, que está PENDIENTE sin
factura y con el cambio pasa a $0 solo). Ojo al medir: DES-0012 y DES-0018
*parecen* afectados pero no lo están — su faltante era íntegramente devolución
registrada.

---

## 15. Metodología de Trabajo (cómo trabajamos en este proyecto)

> Seguir estas reglas garantiza continuidad y calidad entre sesiones.

### Flujo estándar para cualquier cambio
1. **Leer antes de editar** — siempre usar `Read` en los archivos involucrados antes de modificar.
2. **TypeScript check antes de commitear** — correr siempre:
   ```bash
   cd backend && npx tsc --noEmit --ignoreDeprecations 6.0
   cd frontend && npx tsc --noEmit
   ```
3. **Commitear con mensaje descriptivo** y hacer push a la rama activa: `claude/fervent-wright-BUkm4`.
4. **No crear PR** salvo que el usuario lo pida explícitamente.

### Cómo comunicarse con el usuario
- Si hay dudas sobre reglas de negocio (fórmulas, quién cobra qué, porcentajes), **preguntar antes de implementar**. El usuario es José, conoce las reglas del negocio al detalle.
- Respuestas **cortas y directas**. Sin explicar lo obvio.
- Cuando algo no funciona, mostrar **qué datos llegan vs qué se espera** (logs, screenshots, columna de categoría detectada).
- Si una tarea es grande, dividirla en partes y confirmar con el usuario antes de cada fase.
- **Usar `PushNotification`** al terminar tareas largas o al hacer preguntas cuando el usuario puede no estar mirando la pantalla. Mensaje corto, claro, sin markdown.

### Reglas de git en este proyecto
- Rama activa: **`claude/fervent-wright-BUkm4`**
- Siempre `git push -u origin claude/fervent-wright-BUkm4`
- Nunca pushear a `main` sin permiso explícito del usuario.
- Commitear archivos específicos (no `git add -A` indiscriminado).

### Migraciones de Prisma
Cada vez que se modifique `schema.prisma`:
```bash
cd backend
npx prisma migrate dev --name <descripcion_del_cambio>
npx prisma generate
```
El backend aplica migraciones automáticamente al arrancar (`migrate deploy` en `index.ts`).

### Contexto del usuario
- **Usuario:** José (josephlara3030@gmail.com)
- **Empresa:** Ecoplast F.P., Venezuela
- **Moneda base:** USD / USDT
- **Socios que reciben ganancias:** Sr. Alberto, Danny, Darwin, SBUG, Yolanda, Sandra, Capital
- **El usuario no es desarrollador** — explicar decisiones técnicas en términos de negocio cuando sea relevante.

---

## 16. Herramientas de Entorno del Usuario

> Configuradas en la sesión del 2026-06-06. No son parte del código del proyecto.

### Script anti-suspensión
- **Archivo:** `C:\Ecoplast\keep-awake.ps1`
- **Acceso directo:** Escritorio → "Claude - Modo Trabajo"
- **Atajo de teclado:** `Ctrl + Alt + K`
- **Función:** Evita que la laptop entre en suspensión mientras Claude trabaja. La pantalla sí puede apagarse. Al cerrar la terminal (Ctrl+C), la suspensión vuelve a funcionar normal.
- **Usa API de Windows** `SetThreadExecutionState` — no requiere software adicional.

### Notificaciones push
- La herramienta `PushNotification` está disponible en Claude Code.
- Se activa automáticamente cuando el usuario lleva más de 60 segundos inactivo.
- Si el usuario conecta la app Claude en el teléfono via `/rc` (Remote Control), las notificaciones también llegan al celular.
- **Pendiente:** José aún no vinculó el teléfono. Pasos: abrir Claude Code en terminal → escribir `/rc` → escanear QR con la app Claude.

### Arranque automático del sistema (configurado 2026-07-14)
- **Mecanismo principal:** Tarea Programada de Windows **"Ecoplast Autostart"** — al iniciar sesión (delay 15 s) ejecuta `Iniciar Ecoplast.cmd auto` minimizado. Ver estado: `schtasks /query /tn "Ecoplast Autostart"`.
- **Lanzador:** `Iniciar Ecoplast.cmd` (raíz del repo, NO commiteado): espera PostgreSQL → arranca PM2 → verifica puertos 5101/3001 con reintentos. **Bitácora: `C:\Ecoplast\arranque-ecoplast.log`** — si el arranque vuelve a fallar, revisar ahí primero.
- **Respaldo:** entrada en carpeta Startup + acceso del Escritorio (modo manual, abre navegador).
- ⚠️ **CRÍTICO para Claude:** el `pm2` del PATH de las consolas de Claude vive en un **sandbox** (`C:\Users\heber\AppData\Roaming\npm` NO existe en el Windows real). El pm2 REAL está en **`C:\Ecoplast\pm2-runtime\node_modules\pm2\bin\pm2`** (v7). Para gestionar los servicios usar SIEMPRE:
  `"C:\Program Files\nodejs\node.exe" "C:\Ecoplast\pm2-runtime\node_modules\pm2\bin\pm2" <comando>`
  Si se usa el pm2 del sandbox se crea un daemon paralelo que muere con la sesión y deja a José sin servicios al reiniciar (esta fue la causa del fallo recurrente de arranque).

---

## 17. Historial de Cambios Recientes (sesión anterior)

| Commit | Descripción |
|--------|-------------|
| `4fcf0f4` | fix(ganancias): detectar categorías por nombre cuando codigo es null |
| `b3fae1c` | feat: módulo completo de distribución de ganancias por despacho |
| `dd9047b` | fix: errores 500 en seguimiento y delete de despacho |
| `34d633b` | feat: gráficas Top 10 Clientes en Análisis Visual |
| `852ac09`–`3d63ccb` | Fixes de PDF Gandica, curvas, importación Excel, redondeos |
