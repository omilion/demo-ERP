# Mapas BPMN operacionales — Plastimar ERP

Fecha de corte: 2026-09-02. Alcance: flujo vigente en el código local y trazas E2E de `plastimar_test`; no describe procesos de producción.

Estos mapas usan carriles BPMN en Mermaid: círculo = inicio/fin, rectángulo = actividad, rombo = decisión, y cada flecha representa una entrega de información, un cambio de estado o una responsabilidad que pasa a otro rol.

## Roles y responsabilidad operativa

| Rol / actor | Inicia o mantiene | Entrega a |
| --- | --- | --- |
| Vendedor | Cliente, CRM, cotización, licitación, venta y comunicación comercial | Coordinador, taller, bodega, caja/cobranza |
| Coordinador comercial | Revisión comercial, aprobación y seguimiento de ventas | Taller, bodega, gerencia |
| Jefe de taller | ODT, asignación, calidad, cierre de orden | Bodega, vendedor, gerencia |
| Operario de taller | Avance, tiempos, consumo/merma y etapa lista | Jefe de taller |
| Bodeguero | Picking, packing, despacho, guía DTE 52 y tracking | Transporte, cliente, facturación, gerencia |
| Cajero / facturador autorizado | Turno, cobro, pago, DTE, nota interna y conciliación de caja | Cobranza, SII, gerencia |
| Cobranzas | Cuenta por cobrar, gestión, compromiso y cierre de deuda | Cliente, caja, gerencia |
| Compras / bodega | Proveedor, OC, recepción, kardex, inventario y ubicación física | Taller, ventas, gerencia |
| RRHH | Trabajador, contrato, asistencia, remuneración y documentos laborales | Gerencia |
| Admin | Usuarios, roles, parámetros fiscales, descuentos, IA e integridad | Todos los módulos |
| Gerencia / solo lectura | KPI, excepciones, márgenes, trazabilidad y decisiones | Responsable del área |
| Cliente / proveedor / SII / transporte | Actor externo que recibe o confirma información | Rol interno responsable |

## 1. Mapa global: cliente a cierre y retroalimentación

```mermaid
flowchart LR
  subgraph CLI[Cliente]
    A((Necesidad / OC))
    Z((Recibe producto y documento))
  end
  subgraph COM[Venta y coordinación comercial]
    B[Registrar cliente y CRM]
    C[Crear cotización o licitación]
    D{¿Aceptada / adjudicada?}
    E[Crear y confirmar venta]
    F{¿Item inventario, taller o mixto?}
  end
  subgraph TAL[Taller]
    G[Generar / planificar ODT]
    H[Asignar operario]
    I[Producir, consumir material, registrar merma y avance]
    J[Control de calidad y terminar ODT]
  end
  subgraph BOD[Bodega y despacho]
    K[Reservar / preparar stock]
    L[Picking]
    M[Packing y bultos]
    N[Programar despacho y guía]
    O[Tracking: Preparado → Patio → Didáctico → Reparto → Entregado]
  end
  subgraph FIN[Caja, facturación y cobranza]
    P[Registrar pago / deuda]
    Q[Emitir DTE o documento interno]
    R[Enviar y consultar SII cuando corresponde]
    S[Gestionar cobranza / conciliar]
    T[Venta Pagada + Entregada + CERRADA]
  end
  subgraph GER[Gerencia]
    U[Revisar KPIs, excepciones y márgenes]
    V[Decidir prioridad, descuento, compra o corrección]
  end
  A --> B --> C --> D
  D -- No --> C
  D -- Sí --> E --> F
  F -- Taller o mixto --> G --> H --> I --> J --> K
  F -- Inventario --> K
  K --> L --> M --> N --> O --> Z
  E --> P --> Q --> R --> S --> T
  O --> T
  T --> U --> V
  V -. prioridad / acción .-> COM
  V -. abastecimiento .-> BOD
  V -. carga .-> TAL
```

**Traspasos que no deben perderse:** venta/ítems → ODT; ODT terminada → disponibilidad logística; despacho/packing → guía; guía/DTE → venta; pago y entrega → cierre formal; todos los eventos → auditoría y reportes.

## 2. Venta, CRM, cotización y licitación

```mermaid
flowchart TB
  subgraph VEN[Vendedor]
    A((Lead, consulta o licitación)) --> B[Buscar/crear cliente]
    B --> C[Crear oportunidad CRM]
    C --> D[Registrar llamada, correo, tarea o bitácora]
    D --> E[Armar cotización / bases licitación]
    E --> F[Enviar propuesta]
  end
  subgraph CLI[Cliente / organismo]
    F --> G{¿Acepta, rechaza o pide ajuste?}
  end
  subgraph COOR[Coordinador comercial]
    G -- Ajuste --> H[Revisar precio, plazo, descuento y margen]
    H --> E
    G -- Acepta / adjudica --> I[Validar OC, adjudicación y condiciones]
  end
  subgraph ERP[Venta ERP]
    I --> J[Crear venta con items, cliente, dirección y fecha]
    J --> K{¿Requiere fabricación?}
    K -- Sí --> L[Crear ODT y notificar taller]
    K -- No --> M[Marcar disponible para picking]
    L --> N[Venta en preparación]
    M --> N
  end
  subgraph GER[Gerencia]
    H -. descuento excepcional / margen .-> O[Autorizar o rechazar regla]
    O -. decisión .-> H
  end
```

Estados relevantes: CRM `NUEVO → SEGUIMIENTO → CERRADO/GANADO o PERDIDO`; venta `Pendiente → En preparación → Despacho → Entregada`; las licitaciones pueden portar plazo y riesgo de multa hacia despacho.

## 3. Taller: pasar a taller, ODT, bitácora y materiales

```mermaid
flowchart LR
  subgraph VEN[Venta / coordinador]
    A[Venta con item transitorio o fabricación] --> B[Pasar a taller / crear ODT]
  end
  subgraph JEF[Jefe de taller]
    B --> C[Planificar taller y etapas]
    C --> D[Asignar responsable y fecha]
    D --> E{¿Material y receta disponibles?}
    E -- No --> F[Solicitar abastecimiento / registrar bloqueo]
    E -- Sí --> G[Autorizar inicio]
  end
  subgraph OPE[Operario]
    G --> H[Iniciar/pausar tarea]
    H --> I[Registrar avance, tiempo, bitácora]
    I --> J[Consumir material, lote y merma]
    J --> K[Declarar etapa lista]
  end
  subgraph CAL[Jefe / control de calidad]
    K --> L{¿Calidad conforme?}
    L -- No --> M[Devolver a etapa y dejar observación]
    M --> H
    L -- Sí --> N[Terminar ODT]
  end
  subgraph BOD[Bodega]
    F --> O[Recibir compra o transferir material]
    O --> E
    N --> P[Disponibilizar producto para picking]
  end
  subgraph GER[Gerencia]
    I -. carga, tiempo, merma .-> Q[KPIs de taller]
    J -. costo real / lote .-> Q
  end
```

Controles: el operario sólo registra avance; el jefe asigna, aprueba calidad y cierra. El consumo deja historial de materiales, lote y merma; no equivale a una salida comercial.

## 4. Bodega: inventario, compras, picking, packing y despacho

```mermaid
flowchart TB
  subgraph COM[Venta / taller]
    A[Venta confirmada] --> B{¿Item listo desde inventario o taller?}
    C[ODT terminada] --> B
  end
  subgraph BOD[Bodeguero]
    B --> D[Consultar stock, ubicación física y reservas]
    D --> E{¿Cantidad disponible?}
    E -- No --> F[Generar alerta de faltante / compra / espera taller]
    F --> D
    E -- Sí --> G[Confirmar picking por línea]
    G --> H[Crear bultos y confirmar packing]
    H --> I{¿Venta parcial?}
    I -- Sí --> J[Registrar envío parcial y saldo pendiente]
    I -- No --> K[Programar salida]
    J --> K
    K --> L[Preparar guía DTE 52 o guía interna]
    L --> M[Despachar y registrar transporte/seguimiento]
    M --> N[Actualizar: Preparado → Patio → Didáctico → Reparto → Entregado]
  end
  subgraph EXT[Transportista / cliente]
    M --> O[Recibe bultos, guía y número de seguimiento]
    O --> N
  end
  subgraph FIN[Facturación]
    L --> P{¿Guía tributaria?}
    P -- Sí --> Q[Emitir folio, firmar, enviar SII y guardar Track ID]
    Q --> R[Consultar Aceptado / Rechazado]
  end
```

Ruta alternativa: un **despacho aislado** nace en Bodega con motivo obligatorio y destinatario, sin crear ni falsificar una venta; puede preparar su propia guía. La ubicación física es el dato maestro `ubicación física` del producto, no una inferencia del picking.

## 5. Caja, facturación, documentos SII y cobranza

```mermaid
flowchart LR
  subgraph CAJ[Cajero / facturador]
    A((Abrir turno o tomar venta)) --> B[Seleccionar documento y medio de pago]
    B --> C{¿Pago total, parcial o crédito?}
    C -- Total --> D[Registrar movimiento y saldo]
    C -- Parcial/crédito --> E[Crear cuenta por cobrar]
    D --> F[Emitir DTE / boleta / factura / guía]
    E --> F
    F --> G[Asignar CAF, firmar XML y folio]
  end
  subgraph SII[SII]
    G --> H[Enviar DTE]
    H --> I{¿Aceptado, reparo o rechazo?}
    I -- Aceptado --> J[Guardar Track ID y estado Aceptado]
    I -- Reparo/Rechazo --> K[Persistir detalle y bloquear reemisión automática]
  end
  subgraph COB[Cobranzas]
    E --> L[Gestionar contacto, compromiso y mora]
    L --> M{¿Pago recibido?}
    M -- Sí --> D
    M -- No --> L
  end
  subgraph ADM[Admin]
    K -. ajuste fiscal autorizado .-> N[Revisar certificado, CAF y configuración]
  end
  subgraph GER[Gerencia]
    J --> O[Ver caja, deuda, ventas y excepciones]
    K --> O
  end
```

Regla: emisión, envío SII y consulta de estado son pasos separados. Un rechazo o una respuesta no confirmada conserva el folio y requiere conciliación; nunca crea automáticamente un segundo DTE.

## 6. Compras e inventario

```mermaid
flowchart LR
  subgraph DEM[Demanda]
    A[Stock crítico, ODT bloqueada o reposición] --> B[Requerimiento de compra]
  end
  subgraph BOD[Compras / bodega]
    B --> C[Seleccionar proveedor y comparar]
    C --> D[Crear OC]
    D --> E[Enviar OC / esperar recepción]
    E --> F[Registrar recepción]
    F --> G[Ingresar lote, costo, cantidad y ubicación física]
    G --> H[Generar kardex de entrada]
    H --> I[Actualizar disponibilidad]
  end
  subgraph PROV[Proveedor]
    E --> J[Despacha materiales / factura]
    J --> F
  end
  subgraph TAL[Taller / ventas]
    I --> K[Material disponible para ODT]
    I --> L[Producto disponible para venta/picking]
  end
  subgraph FIN[Finanzas]
    J --> M[Registrar documento recibido / gasto]
    M --> N[Programar pago proveedor]
  end
```

## 7. RRHH, administración, permisos, IA e integridad

```mermaid
flowchart TB
  subgraph ADM[Admin]
    A((Alta/cambio de usuario)) --> B[Asignar rol y permisos extra]
    B --> C{¿Permiso crítico?}
    C -- Sí --> D[Confirmar alcance y conservar auditoría]
    C -- No --> E[Guardar usuario/rol activo]
    D --> E
    E --> F[Configurar empresa, CAF, certificado, descuentos y switches]
    F --> G[Ejecutar chequeo de integridad]
    G --> H{¿Hallazgo?}
    H -- Sí --> I[Asignar dueño: datos, desarrollo o gerencia]
    H -- No --> J[Estado operativo sano]
  end
  subgraph RRHH[RRHH]
    K[Crear trabajador / contrato] --> L[Asistencia, permisos y remuneración]
    L --> M[Documentos laborales]
  end
  subgraph IA[Asistente IA]
    N[Solicitud autorizada] --> O[Aplicar límites de rol, contexto y cuota]
    O --> P[Responder sin ejecutar fuera de permisos]
  end
  subgraph GER[Gerencia]
    I --> Q[Priorizar corrección]
    J --> Q
    M --> Q
    P --> Q
  end
```

Reglas de gobierno: Admin no puede dejar sin administrador activo ni auto-revocarse; los permisos específicos prevalecen sobre los de módulo; `solo_lectura` no ve remuneraciones; la IA no amplía permisos del usuario.

## 8. Reportería y circuito de decisión

```mermaid
flowchart LR
  subgraph ORI[Fuentes operativas]
    A[Ventas / CRM]
    B[Taller / materiales / ODT]
    C[Bodega / kardex / despachos]
    D[Caja / DTE / cobranza]
    E[RRHH]
  end
  subgraph REP[Reportes gerenciales]
    A --> F[KPIs comerciales y embudo]
    B --> G[Capacidad, merma, costo y retrasos]
    C --> H[Disponibilidad, picking, packing y entregas]
    D --> I[Facturación, mora y excepciones SII]
    E --> J[Dotación y remuneraciones autorizadas]
  end
  subgraph GER[Gerencia]
    F --> K{Decisión}
    G --> K
    H --> K
    I --> K
    J --> K
    K --> L[Priorizar venta, compra, taller, cobranza o corrección]
  end
  subgraph RES[Responsable]
    L --> M[Vendedor / coordinador]
    L --> N[Jefe taller / operario]
    L --> O[Bodeguero / compras]
    L --> P[Cajero / cobranzas]
    L --> Q[Admin / desarrollo / datos]
  end
```

## Matriz de llegada de información

| Evento de origen | Receptor inmediato | Datos mínimos entregados | Resultado esperado |
| --- | --- | --- | --- |
| Venta confirmada | Taller o Bodega | Orden, interno, cliente, líneas, cantidades, fecha y tipo | ODT o cola de picking |
| Etapa/ODT terminada | Bodega | ODT, producto, cantidad, calidad y observaciones | Producto disponible para preparación |
| Picking/packing confirmado | Despacho | Líneas, cantidades, bultos, responsable y saldo | Salida programable / parcial |
| Guía emitida | SII, cliente, venta y gerencia | Folio, XML, receptor, ítems, Track ID y estado | Trazabilidad tributaria y logística |
| Pago o compromiso | Cobranza, caja y venta | Monto, medio, fecha, documento y saldo | Deuda actualizada / cierre si corresponde |
| Consumo de material | Taller, bodega y gerencia | ODT, lote, cantidad, merma, trabajador y fecha | Costo real, stock y KPI de merma |
| Hallazgo de integridad | Dueño asignado | Entidad, ID, evidencia, severidad y causa | Corrección de datos, código o decisión |

## Evidencia de implementación consultada

- Roles y restricciones: `backend/src/middleware/rbac.js`.
- Venta a despacho y estados: `backend/src/routes/ventas/estado-flujo-formal.js`, `backend/src/routes/despachos/`.
- Taller y avance: `frontend/src/pages/taller/`, `frontend/src/pages/pasar-taller/`, `frontend/src/pages/bitacora-taller/`.
- DTE/SII: `backend/src/facturacion/engine.js`, `frontend/src/pages/facturacion/`.
- Trazas reales de roles: `docs/auditoria/TRAZA_SEMANA_OPERATIVA_E2E_2026-09-02.md`.
