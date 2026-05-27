# Estado sprints remediacion legacy

Fecha de corte: 2026-05-27

## Resumen

- Total de SPR documentados: 48.
- Cerrados, aprobados o aprobados localmente: 36.
- Pendientes de ejecucion: 12.
- Estado del codigo: bloque Taller/Historial implementado y validado localmente; queda pendiente consolidar commit final de este lote antes de seguir con nuevos SPR.

## Criterio de orden

1. Un SPR queda cerrado solo si su documento indica aprobado/cerrado y tiene evidencia de implementacion o descarte explicito.
2. Un SPR pendiente se mantiene como pendiente si conserva checklist sin ejecutar o evidencia final vacia.
3. Los cambios aprobados se consolidan en un commit unico de remediacion acumulada, salvo que se decida dividirlos manualmente por modulo antes de subir.
4. Los 17 pendientes deben tratarse como el backlog siguiente; no estan dentro del bloque limpio de cierre actual.

## Pendientes de ejecucion

| SPR | Modulo / tema | Estado |
| --- | --- | --- |
| SPR-01 | autocompleta nombre material | Pendiente de ejecucion |
| SPR-03 | bodega taller | Pendiente de ejecucion |
| SPR-06 | cargo transporte | Pendiente de ejecucion |
| SPR-07 | categorias bodega taller | Pendiente de ejecucion |
| SPR-08 | categorias | Pendiente de ejecucion |
| SPR-09 | clase excel | Pendiente de ejecucion |
| SPR-11 | cobranza cliente | Pendiente de ejecucion |
| SPR-43 | usuarios | Pendiente de ejecucion |
| SPR-44 | vendor | Pendiente de ejecucion |
| SPR-46 | venta web | Pendiente de ejecucion |
| SPR-47 | web | Pendiente de ejecucion |
| SPR-48 | word textarea | Pendiente de ejecucion |

## Orden sugerido para continuar

1. SPR-03 bodega taller.
2. SPR-07 categorias bodega taller.
3. SPR-01 autocompleta nombre material.
4. SPR-08 categorias.
5. SPR-43 usuarios.
6. SPR-46 venta web.
7. SPR-47 web.
8. SPR-11 cobranza cliente.
9. SPR-06 cargo transporte.
10. SPR-09 clase excel.
11. SPR-44 vendor.
12. SPR-48 word textarea.

Este orden prioriza flujo operativo y datos productivos antes que librerias, assets o utilidades legacy.

## Cerrados o aprobados

| SPR | Modulo / tema | Estado |
| --- | --- | --- |
| SPR-02 | bitacora taller | Aprobado - cerrado el 2026-05-26 |
| SPR-04 | bodega | Aprobado con observaciones no bloqueantes |
| SPR-05 | caja | Aprobado |
| SPR-10 | clientes | Aprobado |
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
| SPR-45 | venta directa | Aprobado |

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
| `npm.cmd run test:ci -- --reporter=dot` | OK, 16 archivos, 126 tests. |
| `npm.cmd run test:full -- --reporter=dot` | OK, 49 archivos, 432 tests. |
| `frontend: npm.cmd run build` | OK, build Vite generado. Warning no bloqueante por chunk mayor a 500 kB. |
| `frontend: npm.cmd run lint` | OK, ESLint sin errores. |

Nota: una primera corrida backend sin `DATABASE_URL` fallo por ambiente local no configurado; no corresponde a una regresion del codigo. Con `DATABASE_URL` correcto, `odts.test.js`, `test:ci` y `test:full` pasaron.
