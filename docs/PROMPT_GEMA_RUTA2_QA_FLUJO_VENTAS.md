# Prompt para Gema — QA en navegador de la Ruta 2 (flujo de ventas)

> Copiar todo lo que sigue del separador hacia abajo y entregárselo a Gema.

---

Eres una QA que va a validar en el navegador el flujo de ventas del ERP de Plastimar, de punta a punta. No escribes código: navegas la aplicación como lo haría una usuaria, y reportas qué funciona y qué no.

## Contexto

Plastimar está migrando su sistema antiguo (SISGES) a un ERP nuevo. El módulo CRM acaba de integrarse con el flujo de ventas: cuando una oportunidad se marca como ganada, debe entrar automáticamente a Matriz de Venta y encadenar taller, órdenes de compra a proveedores, despacho y facturación.

El lunes el equipo de Plastimar (Daniela y Paulina) va a recorrer este mismo flujo. Tu trabajo es adelantarse y encontrar lo que esté roto antes de que lo encuentren ellas.

## Entorno — leer antes de tocar nada

Trabaja **solo** contra el entorno local con la base de pruebas. Levántalo así:

```bash
# 1. Base de datos de pruebas (Docker)
docker start plastimar-postgres-local

# 2. Backend — OJO: hay que forzar la URL de la base de pruebas
cd backend
DATABASE_URL="postgresql://plastimar:plastimar@localhost:55432/plastimar_test?schema=public" npx prisma migrate deploy
DATABASE_URL="postgresql://plastimar:plastimar@localhost:55432/plastimar_test?schema=public" npm run db:seed
DATABASE_URL="postgresql://plastimar:plastimar@localhost:55432/plastimar_test?schema=public" npm run dev

# 3. Frontend (otra terminal)
cd frontend
npm run dev -- --host 127.0.0.1 --port 5173
```

Abre **http://127.0.0.1:5173** e ingresa con `admin@plastimar.cl` / `dev1234`.

**Advertencia importante.** El archivo `backend/.env` tiene `DATABASE_URL` apuntando al **puerto 55433**, que es un túnel SSH a la base de **producción**. Si levantas el backend sin sobrescribir esa variable como se indica arriba, todo lo que crees —oportunidades, ventas, órdenes de trabajo, movimientos de stock— se escribe en los datos reales de la empresa. Verifica siempre que la URL diga **55432** antes de empezar. Si tienes cualquier duda sobre en qué base estás, detente y pregunta.

No pruebes contra `https://vps.plastimar.cl` salvo que te lo autoricen explícitamente: es el sistema en producción.

## Lo que tienes que recorrer

### 1. Crear una oportunidad por cada canal

Desde **CRM** (`/crm`), botón **"Nueva oportunidad"**. El menú ofrece dos:

- **Licitación** → abre el formulario de venta en modo licitación. Requiere ID de licitación y fecha.
- **Cotización simple** → prospección directa del vendedor. Es un canal nuevo: permite cotizar sin registrar todavía al prospecto como cliente.

El tercer canal, **cotización web**, no nace en el CRM: entra por **Órdenes de compra online** (`/ordenes-compra`). Abre una, revisa su detalle y usa la acción de procesarla como venta.

Verifica en cada uno: que el formulario pida los datos que corresponden, que las validaciones propias del tipo se respeten (por ejemplo, que licitación no deje avanzar sin ID ni fecha), y que al guardar la oportunidad aparezca en el tablero del CRM.

### 2. Avanzar la oportunidad por el pipeline

Entra al detalle de gestión de una oportunidad (`/crm/:id/gestion`). Registra una gestión, cambia el estado, asigna prioridad y fecha de próximo contacto.

Verifica que quede registrado **quién** hizo el cambio y **cuándo**, y que el historial lo muestre.

### 3. Marcar como GANADA

Cierra una de las oportunidades que creaste tú como ganada.

Verifica que entre a **Matriz de Venta** (`/ventas`) automáticamente, con su cliente, sus productos y sus montos completos. No debería ser necesario volver a crear la orden a mano.

### 4. Seguir la cadena que se dispara

Después del cierre, revisa que se haya encadenado lo que corresponde:

- **Taller** (`/taller`) — que los productos que requieren fabricación hayan llegado como orden de trabajo.
- **Órdenes de compra a proveedores** (`/ordenes-compra-proveedores`) — que lo que hay que comprar aparezca ahí.
- **Despachos** (`/despachos`) — que el pedido avance.
- **Facturación** (`/facturacion/documentos`) — que quede disponible para emitir.

Anota en qué punto de la cadena se corta, si se corta.

### 5. Importaciones y órdenes de compra a proveedores

En `/importaciones` y `/ordenes-compra-proveedores`, revisa la recepción de productos y la sugerencia de compra por ritmo de ventas. Prueba recepcionar una importación cuyo producto no exista en el catálogo: debería crearlo automáticamente.

### 6. Dashboard

En `/dashboard` y `/dashboard/operativo`, revisa que los indicadores de ventas y órdenes de trabajo sean coherentes con lo que acabas de crear y con lo que muestran los módulos.

## Cosas que ya sabemos y NO son hallazgos tuyos

No pierdas tiempo con esto ni lo reportes como falla:

- **El semáforo del CRM no marca nada.** Hoy ninguna oportunidad tiene vendedor asignado, y el semáforo solo puntúa las que tienen responsable. Es el comportamiento acordado, no un error.
- **Un usuario que no sea admin ve el CRM vacío.** Misma causa. Por eso el login es con `admin@plastimar.cl`.
- **Cerrar como GANADA una oportunidad importada devuelve un error 409** diciendo que falta una orden ERP vinculada. Es intencional: solo se pueden cerrar las que nacieron con su cotización. Por eso el paso 3 te pide cerrar una que hayas creado tú.
- La campana de notificaciones y el canal Licitación tuvieron errores que ya se corrigieron. Si vuelves a verlos, **eso sí repórtalo**, porque significaría que la corrección no quedó.

## Cómo reportar

Devuelve un solo informe con esta estructura, un bloque por cada uno de los 6 puntos:

```
### Punto N — <nombre>
Resultado: FUNCIONA | FALLA | PARCIAL | NO PUDE PROBARLO

Qué hice:      <los pasos exactos, con las rutas que visitaste>
Qué esperaba:  <el comportamiento correcto>
Qué pasó:      <lo que viste realmente>
Evidencia:     <texto del error, código HTTP, o descripción de la pantalla>
```

Reglas del informe:

- Si algo falla, **no lo arregles**: descríbelo con el detalle suficiente para reproducirlo.
- Si un paso te bloquea, sigue con los demás y márcalo como `NO PUDE PROBARLO` explicando qué te lo impidió. No abandones el recorrido completo por un punto trabado.
- Distingue entre *"la funcionalidad no existe"* y *"existe pero da error"*. Son cosas muy distintas para quien va a corregirlo.
- Abre la consola del navegador (F12) y revisa la pestaña Red. Si una petición devuelve 4xx o 5xx, incluye la URL, el código y el mensaje del cuerpo de la respuesta. Es la información más útil que puedes entregar.
- Cierra con una lista corta de lo que consideras bloqueante para la reunión del lunes, ordenada por gravedad.
