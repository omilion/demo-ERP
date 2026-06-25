# Módulo de Caja

## Qué es
Permite registrar y supervisar los movimientos de efectivo del local, asegurando la trazabilidad de los ingresos por ventas y los egresos de dinero autorizados.

## Dónde está
Ruta: Menú **Caja → Movimientos de Caja** (`/caja`).

## Cómo hago lo principal

### Registrar un ingreso de caja
1. Ve a **Movimientos de Caja** (`/caja`).
2. Haz clic en **Nuevo Movimiento**.
3. Selecciona el Tipo de Movimiento: **Ingreso**.
4. Ingresa el Monto, el medio de pago (Efectivo, Transferencia, Webpay) y asocia la Orden de Venta (Order ID) relacionada para mantener la integridad.
5. Ingresa una glosa explicativa y presiona **Guardar**.

### Registrar un egreso de caja (Gastos menores)
1. Haz clic en **Nuevo Movimiento**.
2. Selecciona Tipo de Movimiento: **Egreso**.
3. Ingresa el Monto y el concepto (ej: pago de fletes, insumos menores, colaciones).
4. Sube la foto del comprobante o boleta si el sistema lo solicita.
5. Presiona **Guardar**.

## Campos importantes
- **Tipo de Movimiento:** Ingreso (dinero que entra a la caja) o Egreso (dinero que sale).
- **Monto:** Valor numérico en pesos chilenos.
- **Glosa / Comentario:** Descripción breve del motivo del movimiento (obligatorio para egresos).

## Preguntas frecuentes
- **¿Cómo se realiza el cuadre o arqueo de caja diario?** El sistema suma todos los ingresos y resta los egresos automáticos de ventas y caja manual. Puedes emitir el resumen del día presionando el botón "Cierre de Caja".
- **¿Qué hago si hay una diferencia en el arqueo?** Registra un movimiento de tipo "Egreso" o "Ingreso" con la glosa "Ajuste de arqueo de caja" detallando los motivos observados.
