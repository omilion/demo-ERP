---
documento: DOC-00
titulo: Guía maestra y mapa documental
version: MB-1.1
fecha_revision: 2026-09-04
audiencia: Todo el personal de Plastimar
uso: Marcha Blanca
fuente: Comportamiento vigente de SisGestión 3.0
---

# DOC-00: Guía maestra y mapa documental

## 1. Propósito y alcance

Esta batería acompaña la Marcha Blanca de **SisGestión 3.0**. Enseña el flujo vigente, los controles que corresponden a cada área y cómo reportar diferencias entre el manual y la pantalla.

> **Regla de Marcha Blanca:** si el sistema muestra algo distinto a este documento, no inventes un atajo ni repitas la operación. Conserva la información ingresada, toma evidencia con el widget y avisa a tu jefatura.

Los documentos se elaboraron con pantallas del entorno operativo y se revisaron contra el comportamiento actual del ERP. Son archivos estáticos: deben volver a validarse cada vez que cambie un flujo, permiso o integración.

## 2. Antes de comenzar

1. Ingresa con tu usuario asignado; no compartas credenciales.
2. Confirma que aparezcan tu nombre, rol y sucursal correctos.
3. Trabaja sólo en los módulos autorizados para tu función.
4. No uses datos ficticios en operaciones reales. Para pruebas dirigidas, sigue el caso y los datos entregados por el coordinador de Marcha Blanca.
5. Antes de confirmar una operación con efecto en stock, dinero o SII, revisa cliente/proveedor, documento, cantidades, montos y fecha.

## 3. Mapa documental

| Documento | Audiencia principal | Decisión o tarea cubierta |
|---|---|---|
| DOC-01 | Gerencia y jefaturas | Supervisión del flujo, riesgos e indicadores |
| DOC-02 | Ventas y licitaciones | Cotización, venta, datos comerciales y seguimiento |
| DOC-03 | Bodega y logística | Inventario, ingresos, movimientos, telas, picking y packing |
| DOC-04 | Despacho y reparto | Programación, tracking, guía DTE 52 y excepciones |
| DOC-05 | Jefatura de taller | ODT, asignación, avances, calidad y reproceso |
| DOC-05B | Operarios de taller | Ficha rápida para registrar avances en terminal |
| DOC-06 | Caja y cobranza | Turnos, pagos, arqueo y cartera |
| DOC-07 | Facturación | Borrador, emisión, envío, consulta SII y notas de crédito |
| DOC-08 | Administración | Usuarios, roles, permisos, bajas y supervisión |
| DOC-09 | Todo el personal | Reportar Falla, Falta o Mejora con evidencia |

## 4. Matriz mínima de lectura

| Función | Obligatorio | Complementario |
|---|---|---|
| Gerencia | DOC-01 y DOC-09 | DOC-00 |
| Ventas | DOC-02 y DOC-09 | DOC-04 |
| Bodega | DOC-03 y DOC-09 | DOC-04 |
| Despacho/chofer | DOC-04 y DOC-09 | DOC-03 |
| Jefe de Taller | DOC-05 y DOC-09 | DOC-03 |
| Operario de Taller | DOC-05B y DOC-09 | DOC-05 |
| Caja/Cobranza | DOC-06 y DOC-09 | DOC-02 |
| Facturación/Finanzas | DOC-07 y DOC-09 | DOC-06 |
| Administración | DOC-08 y DOC-09 | DOC-00 |

## 5. Reglas de oro

1. **Stock con respaldo:** no edites el stock de una ficha existente. Usa el movimiento autorizado que corresponda y deja motivo/documento trazable.
2. **Cliente y canal correctos:** Venta Sala puede operar sin cliente seleccionado cuando corresponda a consumidor final. Los demás canales requieren los datos que solicite la pantalla.
3. **Taller con ODT:** no inicies fabricación sin ODT visible y asignada. Si el producto no aparece, informa la excepción.
4. **Salida documentada:** el responsable de Despacho debe verificar packing, cantidades, destinatario y el estado de la guía DTE 52 antes de cargar el vehículo. Durante la Marcha Blanca este control es humano; no se debe asumir que el sistema bloqueará todas las salidas incorrectas.
5. **Dinero y DTE sin duplicar:** ante demora, pantalla congelada o respuesta incierta del SII, consulta el estado antes de volver a presionar.

## 6. Semáforo para decidir

- **Verde:** datos completos, cantidades y montos revisados, estado esperado visible. Continúa.
- **Amarillo:** falta un dato, hay una diferencia menor o no entiendes el estado. Detente y consulta a la jefatura.
- **Rojo:** afecta stock, caja, folio, XML, entrega o datos personales; hay duplicidad, rechazo o resultado incierto. No reintentes. Reporta con evidencia.

## 7. Qué incluir en un reporte

Indica módulo, número de venta/ODT/documento, acción realizada, resultado esperado, resultado obtenido, hora aproximada y si el caso afecta atención, stock, dinero, despacho o SII. No escribas contraseñas, certificados, tokens, datos bancarios completos ni información sensible innecesaria.

## 8. Control documental

- Propietario operativo: jefatura de cada módulo.
- Propietario documental: coordinación de Marcha Blanca.
- Revisión obligatoria: después de cada cambio funcional relevante y antes de indexar nuevamente en el Asistente IA.
- En RAG debe indexarse sólo la última versión aprobada; las versiones anteriores deben quedar fuera de la colección activa.
