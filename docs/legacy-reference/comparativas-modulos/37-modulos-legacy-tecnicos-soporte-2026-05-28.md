# 37 - Modulos legacy tecnicos o de soporte: decision comparativa

Fecha de comparacion: 2026-05-28

Estado del bloque: **Reemplazo tecnico / Parcial por validar segun caso**.

## Resumen ejecutivo

Los elementos legacy tecnicos no deben tratarse como pantallas faltantes. La mayoria corresponde a librerias PHP, assets, utilidades, cron, mail o soporte web que el ERP actual reemplaza con React/Vite, APIs modernas, jobs backend, import/export controlado y configuracion.

## Decisiones por componente

| Legacy tecnico | Equivalente actual | Decision |
|---|---|---|
| `autocompleta_nombre_material` | Autocomplete en productos/materiales, ODT y bodega taller. | Reemplazo tecnico; validar flujo exacto de consumo. |
| `clase_excel`, `lib` | CSV/XLSX moderno, importador bodega con dry-run, exports backend. | Reemplazo tecnico; XLSX nativo solo si cliente lo exige. |
| `cron_job` | Jobs backend, validaciones, `stockCritico.mjs`, reportes. | Parcial; validar cron productivo real. |
| `css`, `js`, `font`, `fonts`, `vendor` | React/Vite, componentes compartidos, iconos modernos, CSS actual. | Reemplazo tecnico; no son modulos de usuario. |
| `img` | Assets actuales, placeholder legacy y `/uploads`. | Reemplazo tecnico; migrar solo imagenes utiles. |
| `phpmailer` | Firmas email/configuracion y eventual servicio email moderno. | Parcial; validar SMTP/transaccional. |
| `web`, `usuarios-web`, `banners` | `/ordenes-compra`, `/config` Banners Web, Usuarios Web, APIs `banners` y `usuarios-web`. | Parcial; comparar si cliente pide portal publico completo. |
| `word_textarea` | Textareas React y documentos/impresiones por modulo. | Reemplazo tecnico. |

## Mejoras actuales transversales

- Menos dependencias PHP legacy.
- Validacion backend central.
- Import/export controlado.
- Assets y uploads separados.
- Seguridad y permisos integrados.
- Jobs backend versionables.

## Brechas candidatas

| Brecha | Impacto | Recomendacion |
|---|---|---|
| Cron productivo | Puede haber automatismos legacy no documentados. | Revisar cron real antes de cierre. |
| SMTP/envio email | Firmas no equivalen a envio transaccional. | Definir servicio email si hay correos reales. |
| Portal web publico | Puede existir alcance fuera del ERP interno. | Comparar `web/usuarios-web/banners` solo si cliente lo solicita. |
| PDF/Excel exactos | Varias areas legacy usaban PDF/Excel PHP. | Implementar formatos exactos solo por requisito formal. |

## Detalles legacy que ya no tienen sentido conservar

- Bootstrap/jQuery/Glyphicons/vendor PHP como deuda funcional.
- Migrar carpetas completas de imagenes sin uso.
- Replicar utilidades PHP internas cuando existe API moderna.
- Tratar soporte tecnico como modulo de usuario.

## Decision del bloque

Bloque **mayoritariamente reemplazado tecnicamente**. Solo reabrir cron, SMTP, portal web o formatos PDF/XLSX si el cliente confirma uso real.

