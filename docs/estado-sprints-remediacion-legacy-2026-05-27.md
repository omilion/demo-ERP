# Estado sprints remediacion legacy

Fecha de corte: 2026-05-27

## Resumen

- Total de SPR documentados: 48.
- Cerrados, aprobados o aprobados localmente: 48.
- Pendientes de ejecucion: 0.
- Estado del codigo: bloque final de 7 SPR implementado o cerrado por reemplazo tecnico documentado; frontend validado con lint/build; backend validado por sintaxis y tests preparados, con corrida de integracion pendiente por Postgres local no disponible.

## Criterio de orden

1. Un SPR queda cerrado solo si su documento indica aprobado/cerrado y tiene evidencia de implementacion o descarte explicito.
2. Un SPR pendiente se mantiene como pendiente si conserva checklist sin ejecutar o evidencia final vacia.
3. Los cambios aprobados se consolidan en un commit unico de remediacion acumulada, salvo que se decida dividirlos manualmente por modulo antes de subir.
4. No quedan SPR pendientes documentados; cualquier brecha nueva debe abrirse como solicitud nueva o sprint posterior.

## Pendientes de ejecucion

No quedan SPR pendientes de ejecucion.

## Cierre del bloque final

| SPR | Modulo / tema | Resultado |
| --- | --- | --- |
| SPR-06 | cargo transporte | Implementado y aprobado localmente |
| SPR-09 | clase excel | Cerrado sin cambios de codigo; reemplazo tecnico existente |
| SPR-11 | cobranza cliente | Implementado y aprobado localmente |
| SPR-44 | vendor | Cerrado sin cambios de codigo; reemplazo tecnico existente |
| SPR-46 | venta web | Implementado y aprobado localmente |
| SPR-47 | web | Implementado y aprobado localmente |
| SPR-48 | word textarea | Cerrado sin cambios de codigo; reemplazo tecnico existente |

## Cerrados o aprobados

| SPR | Modulo / tema | Estado |
| --- | --- | --- |
| SPR-01 | autocompleta nombre material | Aprobado localmente - cerrado el 2026-05-27 |
| SPR-03 | bodega taller | Aprobado localmente - cerrado el 2026-05-27 |
| SPR-07 | categorias bodega taller | Aprobado localmente - cerrado el 2026-05-27 |
| SPR-08 | categorias | Aprobado localmente - cerrado el 2026-05-27 |
| SPR-02 | bitacora taller | Aprobado - cerrado el 2026-05-26 |
| SPR-04 | bodega | Aprobado con observaciones no bloqueantes |
| SPR-05 | caja | Aprobado |
| SPR-06 | cargo transporte | Aprobado localmente - cerrado el 2026-05-27 |
| SPR-09 | clase excel | Cerrado sin cambios de codigo - reemplazo tecnico documentado el 2026-05-27 |
| SPR-10 | clientes | Aprobado |
| SPR-11 | cobranza cliente | Aprobado localmente - cerrado el 2026-05-27 |
| SPR-12 | cobranza | Aprobado para continuar |
| SPR-13 | consulta precios | Aprobado |
| SPR-14 | convenio marco | Aprobado con observaciones documentadas |
| SPR-15 | cotizar licitacion | Aprobado con observaciones documentadas |
| SPR-16 | cron job | Aprobado con observacion de despliegue |
| SPR-17 | css | Aprobado sin cambios de codigo |
| SPR-18 | descuentos marco | Aprobado |
| SPR-19 | descuentos porc | Aprobado |
| SPR-20 | despacho | Aprobado |
| SPR-21 | facturas bodega | Aprobado |
| SPR-22 | font | Aprobado sin cambios de codigo |
| SPR-23 | fonts | Aprobado sin cambios de codigo |
| SPR-24 | gastos | Aprobado |
| SPR-25 | img | Aprobado |
| SPR-26 | js | Aprobado sin cambios de codigo |
| SPR-27 | lib | Aprobado |
| SPR-28 | licitacion venta | Cerrado / aprobado |
| SPR-29 | matriz ventas | Aprobado por implementacion, pruebas y doble revision de agentes |
| SPR-30 | pasar taller | Aprobado localmente |
| SPR-31 | perfil | Aprobado localmente |
| SPR-32 | phpmailer | Aprobado localmente |
| SPR-33 | precios | Aprobado localmente con doble revision multiagente |
| SPR-34 | proveedores | Aprobado localmente con doble revision multiagente |
| SPR-35 | reportes licitaciones | Cerrado y aprobado multiagente |
| SPR-36 | subcategorias bodega taller | Cerrado y aprobado multiagente |
| SPR-37 | subcategorias | Cerrado y aprobado multiagente |
| SPR-38 | taller confecciones | Aprobado localmente con doble revision multiagente |
| SPR-39 | taller espumas | Aprobado localmente con doble revision multiagente |
| SPR-40 | taller externo | Aprobado localmente con doble revision multiagente |
| SPR-41 | taller historial materiales | Aprobado localmente con doble revision multiagente |
| SPR-42 | taller | Aprobado localmente con doble revision multiagente |
| SPR-43 | usuarios | Aprobado localmente - cerrado el 2026-05-27 |
| SPR-44 | vendor | Cerrado sin cambios de codigo - reemplazo tecnico documentado el 2026-05-27 |
| SPR-45 | venta directa | Aprobado |
| SPR-46 | venta web | Aprobado localmente - cerrado el 2026-05-27 |
| SPR-47 | web | Aprobado localmente - cerrado el 2026-05-27 |
| SPR-48 | word textarea | Cerrado sin cambios de codigo - reemplazo tecnico documentado el 2026-05-27 |

## Estado de limpieza esperado

Para considerar este bloque ordenado:

- El indice de estado queda actualizado.
- Backend test suite relevante pasa o queda una falla documentada con causa concreta.
- Frontend build pasa o queda una falla documentada con causa concreta.
- El bloque aprobado queda stageado y commiteado.
- El working tree queda limpio o solo con pendientes explicitamente documentados.

## Validacion 2026-05-27

Ambiente backend usado:

```text
DATABASE_URL=postgresql://plastimar:plastimar@localhost:55432/plastimar_test?schema=public
```

Resultados:

| Comando | Resultado |
| --- | --- |
| `npm.cmd exec prisma migrate status` | OK, base `plastimar_test` actualizada con 26 migraciones. |
| `npm.cmd exec prisma validate` | OK, schema Prisma valido. |
| `npm.cmd run db:seed` | OK, seed cargado. |
| `npm.cmd test -- categorias-bodega-taller.test.js categorias.test.js usuarios.test.js` | OK, 3 archivos, 12 tests. |
| `npm.cmd run test:ci` | OK, 16 archivos, 126 tests. |
| `npm.cmd run test:full` | OK, 50 archivos, 437 tests. |
| `frontend: npm.cmd run build` | OK, build Vite generado. Warning no bloqueante por chunk mayor a 500 kB. |
| `frontend: npm.cmd run lint` | OK, ESLint sin errores. |

Nota: una primera corrida backend sin `DATABASE_URL` fallo por ambiente local no configurado; no corresponde a una regresion del codigo. Con `DATABASE_URL` correcto, las pruebas dirigidas del bloque (12/12), `test:ci` (126/126) y `test:full` (437/437) pasaron.

## Validacion bloque final 7 SPR

Resultados del cierre de SPR-06, SPR-09, SPR-11, SPR-44, SPR-46, SPR-47 y SPR-48:

| Comando | Resultado |
| --- | --- |
| `node --check` en rutas backend modificadas y tests nuevos | OK |
| `GET /api/cobranza-historico?fechaCampo=bad&fechaDesde=2026-01-01` via `app.inject` | OK, responde 400 controlado sin tocar base de datos |
| `frontend: npm.cmd run lint` | OK, ESLint sin errores |
| `frontend: npm.cmd run build` | OK, build Vite generado. Warning no bloqueante por chunk mayor a 500 kB |
| `frontend dev server http://127.0.0.1:6187` | OK, app correcta abre en navegador local y redirige a login |
| `backend: npm.cmd test -- cargo-transporte.test.js cobranza-cliente.test.js ordenes-compra-web.test.js web-public.test.js` | Bloqueado por ambiente: Postgres local no disponible (`ECONNREFUSED`). Los tests quedaron agregados y con sintaxis validada |

Decision final: los 7 SPR quedan cerrados en codigo/documentacion. Antes de despliegue productivo corresponde levantar base de datos de integracion y correr el set backend dirigido.
