# Flujos ERP viejo vs ERP nuevo - 2026-05-19

Objetivo del documento: mostrarle al cliente, de forma visual, el punto de partida y el flujo al que vamos.

El ERP viejo usaba `n_interno` como numero comun entre varias tablas, pero sin una relacion relacional fuerte. El ERP nuevo debe usar un `trabajo_id / odt_id` obligatorio como llave de trazabilidad para toda operacion productiva.

## Chart 1 - Aqui partimos: ERP viejo legacy

```mermaid
flowchart LR
  classDef entry fill:#FEF3C7,stroke:#D97706,color:#111827,stroke-width:1px
  classDef weak fill:#FEE2E2,stroke:#DC2626,color:#111827,stroke-width:1px
  classDef tbl fill:#E0F2FE,stroke:#0284C7,color:#111827,stroke-width:1px
  classDef key fill:#FFEDD5,stroke:#EA580C,color:#111827,stroke-width:2px
  classDef shop fill:#EDE9FE,stroke:#7C3AED,color:#111827,stroke-width:1px
  classDef problem fill:#F3F4F6,stroke:#6B7280,color:#111827,stroke-dasharray:4 3

  subgraph V["Entradas comerciales separadas"]
    VD["Venta directa"]:::entry
    VW["Venta web"]:::entry
    CM["Convenio marco"]:::entry
    LV["Licitaciones"]:::entry
  end

  CL["Cliente copiado por modulo<br/>RUT/email/texto<br/>posibles duplicados"]:::weak
  OC["orden_compra_sistema<br/>n_interno + datos cliente"]:::tbl
  NI["n_interno<br/>numero repetido<br/>no FK relacional estricta"]:::key
  ODT["odts / taller<br/>cabecera operativa por n_interno"]:::tbl
  PT["productos_taller<br/>item + n_interno<br/>talleres como columnas"]:::tbl

  subgraph TC["Talleres legacy dentro de productos_taller"]
    CONF["taller_confecciones<br/>estado_confecciones"]:::shop
    ESP["taller_espumas<br/>estado_espumas"]:::shop
    MAD["taller_externo<br/>Madera / Externo<br/>estado_externo"]:::shop
  end

  MAT["taller_materiales<br/>n_interno + material"]:::tbl
  HMAT["taller_historial_materiales<br/>n_interno + egreso/ingreso"]:::tbl
  GD["guias_despachos<br/>n_interno + guia"]:::tbl
  BIT["bitacora_taller<br/>texto libre<br/>sin odt_id obligatorio"]:::weak
  MS["movimientos_stock<br/>stock historico<br/>sin trabajo_id"]:::weak

  VD --> CL
  VW --> CL
  CM --> CL
  LV --> CL
  VD --> OC
  VW --> OC
  CM --> OC
  LV --> OC

  CL -.-> OC
  OC -.-> NI
  NI -.-> ODT
  NI -.-> PT
  NI -.-> MAT
  NI -.-> HMAT
  NI -.-> GD

  PT --> CONF
  PT --> ESP
  PT --> MAD
  BIT -.-> ODT
  MS -.-> OC

  P1["Resultado:<br/>el numero existe, pero el flujo queda fragil;<br/>hay duplicados, estados por columnas<br/>y operaciones dificiles de auditar"]:::problem
  CL --> P1
  PT --> P1
  BIT --> P1
  MS --> P1
```

## Chart 2 - Aqui vamos: ERP nuevo objetivo

```mermaid
flowchart LR
  classDef master fill:#DCFCE7,stroke:#16A34A,color:#111827,stroke-width:1px
  classDef core fill:#DBEAFE,stroke:#2563EB,color:#111827,stroke-width:1px
  classDef key fill:#FEF08A,stroke:#CA8A04,color:#111827,stroke-width:2px
  classDef op fill:#EDE9FE,stroke:#7C3AED,color:#111827,stroke-width:1px
  classDef shop fill:#FCE7F3,stroke:#DB2777,color:#111827,stroke-width:1px
  classDef guard fill:#FEE2E2,stroke:#DC2626,color:#111827,stroke-width:1px

  C["Cliente canonico<br/>cliente_id unico"]:::master
  P["Producto canonico<br/>producto_id unico"]:::master
  O["Orden de venta<br/>orden_id<br/>cliente_id requerido"]:::core
  OI["Items de venta<br/>orden_id + producto_id"]:::core
  W["Trabajo / ODT<br/>trabajo_id = odt_id<br/>llave central obligatoria"]:::key
  WI["Items de trabajo<br/>trabajo_id + producto_id"]:::op

  subgraph TN["Talleres normalizados"]
    TCONF["Confecciones<br/>taller_id"]:::shop
    TESP["Espumas<br/>taller_id"]:::shop
    TMAD["Madera / Externo<br/>taller_id"]:::shop
  end

  ROUTE["Asignacion item-taller<br/>odt_item_talleres<br/>trabajo_id indirecto + taller_id"]:::op
  BIT["Bitacora de trabajo<br/>trabajo_id obligatorio"]:::op
  MAT["Materiales usados<br/>trabajo_id obligatorio"]:::op
  HST["Historial materiales<br/>trabajo_id obligatorio"]:::op
  STK["Movimientos de stock<br/>trabajo_id obligatorio"]:::op
  DES["Despacho<br/>trabajo_id obligatorio"]:::op
  GUIA["Guia despacho<br/>trabajo_id obligatorio"]:::op
  CAJA["Caja / pagos<br/>trabajo_id cuando aplica"]:::op
  COB["Cobranza<br/>trabajo_id cuando aplica"]:::op
  REP["Reportes y auditoria<br/>filtran por trabajo_id"]:::op
  G["Regla nueva:<br/>ninguna operacion productiva<br/>sin trabajo_id"]:::guard

  C -->|"cliente_id"| O
  O -->|"orden_id"| OI
  P -->|"producto_id"| OI
  O -->|"crea"| W
  W -->|"trabajo_id"| WI
  P -->|"producto_id"| WI
  WI -->|"odt_item_id"| ROUTE
  ROUTE -->|"taller_id"| TCONF
  ROUTE -->|"taller_id"| TESP
  ROUTE -->|"taller_id"| TMAD

  W -->|"trabajo_id"| BIT
  W -->|"trabajo_id"| MAT
  W -->|"trabajo_id"| HST
  W -->|"trabajo_id"| STK
  W -->|"trabajo_id"| DES
  W -->|"trabajo_id"| GUIA
  W -->|"trabajo_id"| CAJA
  W -->|"trabajo_id"| COB
  W -->|"trabajo_id"| REP

  G --> W
  G --> WI
  G --> ROUTE
  G --> BIT
  G --> MAT
  G --> HST
  G --> STK
  G --> DES
  G --> GUIA
```

Notas de revision:

- En el ERP viejo, el dump confirma que `productos_taller` tiene columnas `taller_confecciones`, `taller_espumas` y `taller_externo`.
- En el PHP legacy, `taller_externo` se presenta al usuario como Taller Madera.
- En el ERP nuevo, el legacy no debe ser flujo operativo: solo sirve como antecedente de migracion y reconciliacion.
