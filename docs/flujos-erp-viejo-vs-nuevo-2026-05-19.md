# Flujos ERP viejo vs ERP nuevo - 2026-05-19

Este documento contiene dos charts Mermaid:

1. flujo real observado en el ERP PHP legacy;
2. flujo objetivo obligatorio para el ERP nuevo.

## Chart 1 - ERP viejo legacy

```mermaid
flowchart TB
  classDef module fill:#FEF3C7,stroke:#D97706,color:#111827,stroke-width:1px
  classDef tbl fill:#E0F2FE,stroke:#0284C7,color:#111827,stroke-width:1px
  classDef weak fill:#FEE2E2,stroke:#DC2626,color:#111827,stroke-width:1px
  classDef note fill:#F3F4F6,stroke:#6B7280,color:#111827,stroke-dasharray:4 3

  subgraph M["Modulos de venta separados"]
    VD["venta_directa"]:::module
    VW["venta_web"]:::module
    CM["convenio_marco"]:::module
    LV["licitacion_venta"]:::module
  end

  C["clientes<br/>sin RUT unico"]:::weak
  OC["orden_compra_sistema<br/>n_interno + rut_cliente/email"]:::tbl
  ODTC["odts<br/>n_interno + texto ODT/transporte"]:::tbl
  T["taller<br/>n_interno + estado_general"]:::tbl
  PT["productos_taller<br/>n_interno + columnas por taller"]:::tbl
  TT["taller_materiales<br/>n_interno + material"]:::tbl
  TH["taller_historial_materiales<br/>n_interno + egreso/ingreso"]:::tbl
  B["bitacora_taller<br/>fecha + usuario + texto libre"]:::weak
  GD["guias_despachos<br/>n_interno + n_guia"]:::tbl
  MS["movimientos_stock<br/>codigo_interno + stock snapshot"]:::weak

  VD -->|"copia/usa rut_cliente"| C
  VW -->|"copia/usa email"| C
  CM -->|"copia/usa rut_cliente"| C
  LV -->|"copia/usa rut_cliente"| C

  VD --> OC
  VW --> OC
  CM --> OC
  LV --> OC

  C -. "referencia textual sin FK estable" .-> OC
  OC -. "n_interno" .-> ODTC
  OC -. "n_interno" .-> T
  OC -. "n_interno" .-> GD
  T -. "n_interno" .-> PT
  T -. "n_interno" .-> TT
  T -. "n_interno" .-> TH
  PT -. "estado por columnas de taller" .-> T
  B -. "sin n_interno ni odt_id" .-> T
  MS -. "no apunta a orden ni ODT" .-> OC

  R1["Problema estructural:<br/>relaciones por texto o n_interno,<br/>duplicados y operaciones huerfanas"]:::note
  C --> R1
  B --> R1
  MS --> R1
```

## Chart 2 - ERP nuevo objetivo

```mermaid
flowchart TB
  classDef master fill:#DCFCE7,stroke:#16A34A,color:#111827,stroke-width:1px
  classDef core fill:#DBEAFE,stroke:#2563EB,color:#111827,stroke-width:1px
  classDef operation fill:#EDE9FE,stroke:#7C3AED,color:#111827,stroke-width:1px
  classDef guard fill:#FEE2E2,stroke:#DC2626,color:#111827,stroke-width:1px
  classDef legacy fill:#F3F4F6,stroke:#6B7280,color:#111827,stroke-dasharray:4 3

  CC["cliente canonico<br/>clientes.clientes"]:::master
  P["producto canonico<br/>catalogo.productos"]:::master
  O["orden de venta<br/>ventas.ordenes<br/>cliente_id requerido"]:::core
  OI["items de venta<br/>ventas.orden_items<br/>producto_id requerido"]:::core
  W["trabajo / ODT<br/>taller.odts<br/>orden_id requerido"]:::operation
  WI["items de trabajo<br/>taller.odt_items<br/>odt_id + producto_id"]:::operation
  WT["estado por taller<br/>taller.odt_item_talleres<br/>taller_id requerido"]:::operation
  BIT["bitacora de trabajo<br/>taller.bitacora_taller<br/>odt_id requerido"]:::operation
  MAT["materiales usados<br/>taller.taller_materiales<br/>odt_id requerido"]:::operation
  HMAT["historial materiales<br/>taller.taller_historial_materiales<br/>odt_id requerido"]:::operation
  DES["despacho<br/>bodega.despachos<br/>orden_id requerido"]:::operation
  GUIA["guia despacho<br/>bodega.guias_despachos<br/>orden_id requerido"]:::operation
  CAJA["caja / pagos<br/>caja.movimientos_caja<br/>orden_id cuando aplica"]:::operation
  COB["cobranza<br/>ventas.cobranza_historico<br/>orden_id cuando aplica"]:::operation
  G["guardas API + constraints DB<br/>bloquean nuevas operaciones huerfanas"]:::guard
  LEG["legacy no reconciliado<br/>solo lectura / staging<br/>no alimenta operacion nueva"]:::legacy

  CC -->|"cliente_id"| O
  O -->|"orden_id"| W
  O -->|"orden_id"| DES
  O -->|"orden_id"| GUIA
  O -->|"orden_id"| CAJA
  O -->|"orden_id"| COB
  O -->|"orden_id"| OI
  P -->|"producto_id"| OI
  W -->|"odt_id"| WI
  WI -->|"odt_item_id"| WT
  P -->|"producto_id"| WI
  W -->|"odt_id"| BIT
  W -->|"odt_id"| MAT
  W -->|"odt_id"| HMAT

  G --> CC
  G --> O
  G --> W
  G --> BIT
  G --> MAT
  G --> HMAT
  G --> DES
  G --> GUIA

  LEG -. "se reconcilia antes de validar constraints" .-> CC
  LEG -. "n_interno -> orden -> ODT" .-> W
  LEG -. "sin evidencia queda historico no operativo" .-> G
```
