# Plan de cierre priorizado — Talleres

## Condición de cierre

Taller se considera cerrado cuando una ODT real puede recorrer Corte/Confección/Espuma, consumir material, registrar calidad y entregarse a Despacho sin WhatsApp, Excel o modificaciones directas de base de datos; y cuando cada actor ve solo la cola y acciones que le corresponden.

## P0 — Bloqueadores

### 1. Corregir permisos de Corte

- Cambiar avance/evidencia específica para usar `taller.avance:write`, o conceder un permiso funcional equivalente sin abrir gestión general.
- Impedir que `taller_operario` reasigne responsables.

**Aceptación:** Jenifer y Mercedes pueden registrar avance/foto de una tarea propia, pero no crear/cerrar ODT, asignar a terceros ni gestionar materiales.

### 2. Poblar y gobernar responsables

- Asignar las etapas vigentes o definir una cola “Sin asignar” de supervisión.
- No abrir “Mis tareas” como vacío silencioso; mostrar explicación y acceso permitido.
- Validar que el responsable tenga rol/taller compatible.

**Aceptación:** una tarea asignada aparece inmediatamente en el móvil del operario y desaparece de “Sin asignar”.

### 3. Máquina de estados y gates

- Definir transiciones permitidas.
- Agregar Pendiente de calidad y Esperando recepción si se aprueba el modelo propuesto.
- Bloquear cierre cuando existan etapas incompletas, calidad pendiente, consumos sin conciliar o entrega no recibida.

**Aceptación:** pendiente→listo devuelve error; cerrar con una etapa pendiente devuelve causas concretas.

### 4. Avance inalterable y concurrencia

- Usar eventos append-only con cantidad, fecha, usuario, observación y evidencia.
- Validar el total dentro de la misma transacción/lock.
- Integrar esa captura en la UI móvil; no depender de una observación mutable.

**Aceptación:** dos avances concurrentes nunca superan la cantidad objetivo y el historial conserva ambos autores/horas.

### 5. Calidad transversal

- Crear inspección por etapa/ítem y decisión aprobar/reprocesar/rechazar.
- Guardar cantidad, defecto, causa, responsable y evidencia.
- Bloquear entrega y cierre hasta aprobación o excepción autorizada.

**Aceptación:** un ítem rechazado aparece en la cola de reproceso y no llega a Despacho.

### 6. Espuma: datos y atomicidad

- Definir qué materiales son realmente planchas/espumas y cargar densidad, espesor y formato en los aplicables; hoy los 4 asociados a Espumas carecen de esos datos.
- Crear lotes/saldos iniciales y registrar calidad.
- Hacer atómico el descuento por lote.
- Implementar autorización de sustitución de densidad/material por Diego.

**Aceptación:** un material con densidad solo consume lote aprobado; dos consumos simultáneos no dejan saldo negativo; la sustitución queda trazada.

### 7. RRHH y usuarios

- Resolver duplicidad activa de Jenifer.
- Crear/localizar y enlazar ficha RRHH de Sebastián.
- Verificar cargo, taller y estado de cada usuario operativo.

**Aceptación:** cada usuario activo de Taller enlaza exactamente una ficha RRHH activa.

## P1 — Operación integral

### 8. Fechas y prioridad automática

- Poblar `fecha_entrega_compromiso` desde Venta/MK.
- Calcular atraso, días restantes y urgencia.
- Corregir el acceso directo de “Pendientes críticas”.

### 9. Handoff entre etapas y Despacho

- Registrar entrega y aceptación con cantidades, usuarios, hora y discrepancia.
- Bloquear inicio si la etapa anterior no fue aceptada, salvo excepción.

### 10. Materiales y costeo real

- Reservar material por ODT.
- Definir reversa/conciliación en anulación.
- Comparar estándar versus consumo/merma real.
- Crear snapshot de costo al liberar/cerrar.

### 11. Dashboard por rol

- Coordinación: atrasos, material, calidad, carga real y excepciones.
- Zalma: asignación y producción por operaria, reproceso y entrega.
- Operario: ficha visual y acciones de ejecución.
- Sebastián: densidad, lote, stock, reserva y sustitución.
- Bodega/Despacho: solicitudes, recepciones y discrepancias.

## P2 — Robustez y mejora continua

- Modo de conectividad débil/cola offline para captura móvil.
- Métricas de tiempo de ciclo, cumplimiento, merma, reproceso y productividad.
- Alertas por atraso, stock insuficiente y cambio de especificación.
- Normalización definitiva de estados históricos.
- Política de retención y acceso a evidencias.

## Escenarios de aceptación ligados a las encuestas

### Corte — Jenifer/Mercedes

1. Zalma asigna una tarea con MK, fecha, medidas, color e imagen.
2. La operaria la ve en “Mis tareas”.
3. Registra dos avances diarios y una foto.
4. El total no puede superar lo solicitado.
5. Finaliza y entrega a Confección.
6. Confección acepta o rechaza con motivo.

### Confección — Zalma

1. Visualiza todas las MK, atrasos y tareas sin operaria.
2. Asigna, registra producción por persona y solicita autorización para una muestra.
3. Rechaza un defecto y genera reproceso.
4. Entrega cantidad conforme a Despacho con recepción registrada.

### Espuma — Sebastián

1. Recibe tarea con densidad, medidas, foto y fecha.
2. El sistema propone/reserva un lote aprobado.
3. Registra consumo y merma.
4. Un lote observado/rechazado no puede consumirse.
5. Si falta densidad, solicita sustitución y Diego decide.
6. Costeo conserva estándar, real y merma.

### ODT interna

1. Se crea sin venta, con centro de costo y responsable.
2. Recorre etapas, materiales y calidad.
3. Cierra con costo snapshot y sin afectar una orden comercial.

## Evidencia mínima para declarar cierre

- al menos una ODT real completa por flujo;
- responsables asignados y usuarios activos;
- avances, evidencias, consumos, merma y calidad persistidos;
- lotes de espuma configurados;
- handoff y recepción en Despacho;
- snapshot de costo;
- pruebas automáticas verdes sobre transiciones, permisos y concurrencia;
- validación presencial de Jenifer, Mercedes, Zalma, Sebastián y Bodega.
