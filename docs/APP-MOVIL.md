# App móvil Ecoplast — Guía de construcción

> Documento base. Define **qué** hace la app, **para quién**, y **en qué orden**
> se construye. Se escribió antes de programar nada, para no improvisar después.
>
> Fecha: 2026-09-03 · Sistema web de referencia: rama `claude/fervent-wright-BUkm4`

---

## 1. La idea en una frase

La app **no es el sistema web metido en una pantalla chica**. Es la parte del
trabajo que ocurre **fuera del escritorio**: la vendedora en la ferretería del
cliente, el cobro en la calle, y José queriendo saber en 3 segundos cuánto se
debe y cuánto falta cobrar.

Todo lo pesado —balances, ganancias, listas de precios, planificador de carga—
se queda en la web. Meterlo en el teléfono lo haría lento y confuso.

---

## 2. Quién la usa y dónde

| Persona | Dónde está | Qué necesita hacer |
|---|---|---|
| Vendedora (Alexandra, Danny, Miguel, Henry, Juan) | En la ferretería del cliente, de pie, con una mano | Cotizar rápido con el precio correcto de ESE cliente; ver qué le deben |
| Aixa | En la oficina o fuera | Ver cuántas curvas están pedidas y de qué cliente |
| José / Sonia / Darwin | En la fábrica, en el carro, en la casa | Pulso del negocio: por cobrar y deuda de materia prima. Aprobar cotizaciones |

**Consecuencia de diseño:** la vendedora trabaja **de pie y con una mano**. Todo
lo que toca debe estar en la mitad de abajo de la pantalla. Nada de tablas
anchas ni de escribir mucho.

---

## 3. Reglas de diseño (no negociables)

1. **Una pantalla, una tarea.** Si una pantalla hace dos cosas, son dos pantallas.
2. **El pulgar manda.** Botones de acción abajo. La parte de arriba es para leer.
3. **Números grandes, palabras pocas.** Un monto se lee de un vistazo o no sirve.
4. **Nunca dejar al usuario adivinando.** Si un producto no tiene precio para ese
   cliente, se dice en el momento — no se guarda en $0 (esto ya nos pasó en la web).
5. **Todo lo que se toca, se confirma.** Guardar, cobrar y despachar avisan qué pasó.
6. **Funciona con mala señal.** La fábrica y las ferreterías tienen internet flojo:
   lo que se está escribiendo no se pierde si se cae la conexión.

---

## 4. Mapa de pantallas

```
                        ┌─────────────┐
                        │   ENTRAR    │  usuario + clave (queda la sesión)
                        └──────┬──────┘
                               │
            ┌──────────────────┴──────────────────┐
            │                                     │
      ROL VENDEDOR                        ROL ADMIN / MASTER
            │                                     │
   ┌────────┴────────┐                  ┌─────────┴─────────┐
   │ INICIO          │                  │ INICIO            │
   │ · mis pedidos   │                  │ · por cobrar      │
   │ · me deben      │                  │ · deuda material  │
   └────────┬────────┘                  └─────────┬─────────┘
            │                                     │
    ┌───────┼────────┬──────────┐        ┌────────┼────────┬──────────┐
    │       │        │          │        │        │        │          │
 COTIZAR CLIENTES CATÁLOGO   COBRAR   APROBAR  DESPACHOS COBRAR   PRODUCCIÓN
```

**Barra de abajo (4 botones máximo):**

- Vendedora: `Inicio` · `Cotizar` · `Clientes` · `Cobros`
- Admin: `Inicio` · `Pedidos` · `Despachos` · `Cobros`

---

## 5. Los cuatro flujos (el algoritmo)

### FLUJO 1 — Cotizar en la ferretería (el más importante)

```
1. La vendedora abre la app. Ya está dentro (la sesión se guardó).
2. Toca COTIZAR.
3. Elige el cliente:
   - Busca por nombre. Aparecen primero los suyos.
   - Al elegirlo, la app muestra AL LADO DEL NOMBRE su deuda actual.
     (si debe mucho, se ve antes de tomar el pedido)
4. La app carga la lista de precios de ESE cliente.
5. Agrega productos, uno por uno:
   a. Busca por nombre o medida.
   b. El precio aparece SOLO, de la lista del cliente.
   c. Escribe la cantidad con un teclado numérico grande.
   d. SI EL PRODUCTO NO ESTÁ EN SU LISTA:
        -> la app avisa "este producto no tiene precio para este cliente"
        -> pide el precio a mano
        -> lo marca en amarillo para que se note al revisar
        (NUNCA se guarda en $0)
6. Mientras agrega, siempre visible abajo: TOTAL $ y KILOS.
7. Guarda. Queda como BORRADOR.
8. Puede mandar el PDF por WhatsApp desde ahí mismo.
```

**Por qué así:** hoy en la web este flujo toma varios clics y hay que buscar el
precio. En el teléfono tiene que ser: cliente → producto → cantidad → listo.

### FLUJO 2 — Cobrar

```
1. Pantalla COBROS. Lista de clientes que deben, ORDENADA POR VENCIDA PRIMERO.
   Cada renglón: cliente, cuánto debe, hace cuántos días.
   - Rojo: vencida
   - Amarillo: vence esta semana
   - Gris: al día
2. Toca un cliente -> ve sus facturas pendientes.
3. Toca REGISTRAR PAGO:
   a. Monto
   b. Cuenta / forma de pago (incluye Efectivo)
   c. FOTO DEL COMPROBANTE con la cámara del teléfono
   d. A qué factura se abona (la app propone la más vieja primero)
4. El pago queda PENDIENTE DE APROBACIÓN.
   Un administrador lo confirma desde la web o desde su teléfono.
```

**Por qué así:** la foto del comprobante se toma en el momento con la cámara.
Ese es el mayor ahorro de tiempo frente a la web.

### FLUJO 3 — El pulso del negocio (José)

```
1. Al abrir, dos números grandes y nada más:

      ┌────────────────────┐  ┌────────────────────┐
      │   POR COBRAR       │  │  DEUDA MATERIAL    │
      │     $ 12.450       │  │     $ 8.320        │
      │  3 facturas vencidas│ │   4 despachos      │
      └────────────────────┘  └────────────────────┘

2. Toca cualquiera de los dos -> el detalle, despacho por despacho.
3. Abajo, "Pedidos por aprobar (3)" -> aprueba desde el teléfono.
```

**Ya existe la API:** `GET /control-despachos` devuelve exactamente esto.

### FLUJO 4 — Producción y despacho

```
1. PEDIDOS: qué hay que fabricar (cotizaciones APROBADAS).
   Sumado por producto, no por cliente:
      Tubo Azul 1/2"  ......  1.850 unidades
      Curva Blanca 1/2" ....    900 unidades
2. DESPACHOS del día: qué sale, para quién, con qué chofer.
3. Al descargar: confirmar cantidades reales recibidas.
```

**Nota:** Aixa ve solo la parte de curvas y el cliente que las pide.

---

## 6. Qué API ya existe (no hay que programarla de nuevo)

El backend ya sirve casi todo. La app móvil **consume la misma API** que la web.

| Pantalla de la app | Endpoint que ya existe |
|---|---|
| Entrar | `POST /auth/login`, `GET /auth/me` |
| Inicio de José | `GET /control-despachos` |
| Buscar cliente | `GET /clientes/buscar` |
| Deuda del cliente | `GET /facturas/cliente/:id/resumen` |
| Precios de ese cliente | `GET /listas-precios/cliente/:clienteId` |
| Buscar producto | `GET /productos/buscar` |
| Crear cotización | `POST /cotizaciones` |
| Aprobar cotización | `PATCH /cotizaciones/:id/estado` |
| Cobros pendientes | `GET /pagos/pendientes`, `GET /reportes/cuentas-cobrar` |
| Registrar pago | `POST /pagos` (+ subida de comprobante) |
| Qué fabricar | `GET /cotizaciones/orden-produccion`, `GET /pedidos/demanda` |
| Despachos | `GET /despachos` |

**Lo único que habría que agregar al backend:**

1. Un endpoint de **resumen para el inicio del vendedor** (sus pedidos + lo que
   le deben sus clientes) — hoy habría que pedir 3 cosas distintas.
2. **Refresco de sesión**: hoy el token dura 12 h y obliga a entrar de nuevo. En
   el teléfono la sesión debe durar semanas.
3. **Avisos push** (opcional, fase 3): "te aprobaron la cotización", "entró un pago".

---

## 7. Decisiones técnicas

### Con qué se hace — DECIDIDO: PWA

**La decisión la fija el requisito de instalación** (ver sección 11): se instala
por **enlace directo**, no por tienda, y tiene que andar en **Android y iPhone**.

Eso descarta la app nativa. En Android se puede repartir un archivo APK por
enlace sin problema, pero **Apple no permite instalar una app nativa fuera de su
tienda**: las únicas vías son TestFlight (la instalación caduca cada 90 días y
exige cuenta de desarrollador de pago) o registrar a mano el número de serie de
cada iPhone. Ninguna sirve para "le paso el enlace a la vendedora y lo instala".

**Entonces: PWA** — una aplicación web que el teléfono instala.

| Cumple | Cómo |
|---|---|
| Enlace directo | Se abre una dirección y se agrega a la pantalla de inicio |
| Android y iPhone | El mismo enlace en los dos; ninguno necesita tienda |
| Ícono propio | Queda como una app más, sin barra de navegador |
| Cámara | Sirve para la foto del comprobante en los dos sistemas |
| Actualizaciones | Se publican solas; nadie tiene que reinstalar nada |

**Lo que hay que tener claro de la PWA:**

- **En iPhone la instalación es a mano**: Compartir → "Agregar a pantalla de
  inicio". No sale el aviso automático que sí aparece en Android. Hay que
  enseñárselo a cada vendedora una vez (o dejar una guía con capturas).
- **Los avisos push en iPhone** solo funcionan si la app fue agregada a la
  pantalla de inicio. Como son fase 5 y opcionales, no condiciona nada.
- **No se reaprovechan las pantallas web actuales.** Tablas anchas y menú
  lateral no sirven en un teléfono: las pantallas móviles se hacen nuevas,
  siguiendo los flujos de este documento. Lo que sí se reaprovecha es todo el
  backend, la sesión y las reglas de negocio.

**Cómo se organiza:** las pantallas móviles viven en el mismo proyecto web, en
rutas aparte (`/m/...`), con su propio diseño. Un mismo servidor sirve las dos
cosas: el sistema de escritorio y la app del teléfono.

### Sesión

- El token se guarda en el almacenamiento seguro del teléfono.
- Dura semanas; se renueva solo.
- Cierre de sesión manual desde el perfil.

### Señal débil

- Lo que se está escribiendo (una cotización a medio hacer) se guarda en el
  teléfono. Si se cae la señal, no se pierde.
- Al volver la señal, se envía.
- **No** se intenta un sistema offline completo: es caro y trae problemas de
  datos duplicados. Solo se protege el borrador en curso.

### Seguridad

- La app habla con el servidor por **HTTPS** (hoy la web local usa HTTP).
  Esto obliga a resolver el paso a internet antes de publicar la app.
- Cada rol ve solo lo suyo — la misma regla que ya aplica el backend.

---

## 8. Orden de construcción

| Fase | Qué se hace | Para qué sirve al terminarla |
|---|---|---|
| **1** | Entrar + Inicio de José (2 números) + detalle | José ve el pulso del negocio desde el teléfono |
| **2** | Cotizar completo (flujo 1) | Las vendedoras cotizan en la calle |
| **3** | Cobros con foto de comprobante (flujo 2) | Se acaba el "mándame la foto por WhatsApp" |
| **4** | Pedidos y despachos (flujo 4) | Producción ve qué fabricar sin la PC |
| **5** | Avisos push y detalles | Comodidad |

Cada fase se puede probar y usar sola. No hace falta terminar todo para que
sirva.

---

## 9. Lo que NO va en la app

Se deja explícito para no discutirlo después:

- Balance de ganancias y distribución entre socios
- Listas de precios (crear/editar)
- Planificador de carga
- Importaciones de Excel
- Configuración y tablas de ganancias
- Unificación de productos repetidos

Todo eso se hace sentado, con teclado y pantalla grande. En el teléfono sería
peor.

---

## 10. Antes de empezar a programar

- [x] **Decidido:** PWA (lo obliga la forma de instalación — sección 7 y 11)
- [x] **Decidido:** se instala por enlace directo, sin tienda (sección 11)
- [x] **Decidido:** las claves se cambian al montar el sistema definitivo (sección 11)
- [ ] Confirmar con las vendedoras el flujo 1 — *pendiente, prueba en la oficina*
- [ ] Montar el paso a internet: HTTPS + `JWT_SECRET` propio + clave de base de datos

---

## 11. Decisiones cerradas

> Contestadas por José el 3 de septiembre de 2026. Quedan como referencia para
> cuando se monte el sistema definitivo; no hay que volver a discutirlas.

### 11.1 Claves

Al montar el sistema nuevo se cambian **todas** las claves. Hoy el sistema anda
con valores de desarrollo, buenos para trabajar en la fábrica pero no para
internet:

| Qué | Estado hoy | Al montar el sistema |
|---|---|---|
| `JWT_SECRET` (la que firma las sesiones) | valor por defecto del código | clave larga y aleatoria, distinta |
| Clave de la base de datos | de desarrollo | propia del servidor |
| Contraseñas de los usuarios | las actuales | cada quien cambia la suya al primer ingreso |

Al cambiar el `JWT_SECRET`, **todas las sesiones abiertas se cierran** y todos
entran de nuevo. Es lo esperado y hay que avisarlo.

### 11.2 Flujo de cotizar

**Pendiente de confirmar con las vendedoras.** No se programa el flujo 1 hasta
que una vendedora lo pruebe y diga si así trabaja de verdad.

### 11.3 Herramienta

Decisión delegada al criterio técnico. **Resultado: PWA** — ver sección 7. Se
eligió porque es la única forma que cumple a la vez enlace directo, Android e
iPhone.

### 11.4 Instalación

**Por enlace directo. No se publica en ninguna tienda.**

Funciona en Android y iPhone. Al terminar la fase 1 hay que preparar:

- Una guía de una hoja con capturas: cómo agregarla a la pantalla de inicio
  (una versión para Android y otra para iPhone, que se instalan distinto).
- Un enlace corto y fácil de dictar por teléfono.

Ventaja de haberlo decidido así: cuando se corrige algo, la próxima vez que
abren la app ya está corregido. Nadie tiene que reinstalar nada ni esperar que
una tienda apruebe la actualización.
