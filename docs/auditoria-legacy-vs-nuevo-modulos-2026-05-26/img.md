# Auditoria legacy vs nuevo - img

Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\img`  
Estado final: **Aprobado**

## Como se mostraba / funcionaba en legacy

`img` no era una pantalla. Era una carpeta de assets usada por muchas pantallas PHP:

- Login/menu: `logo.png`, `fondo.jpg`.
- Reportes PDF: `logo_reportes.jpg`.
- Notas de venta/licitation: `membrete_nota_venta.png`, `membrete_licitacion.png`.
- Taller/impresion: `banner_impresion2.jpg`, `victo_negro.jpg`, `reloj.jpg`.
- Catalogo/productos: `no_foto_chica.jpg`.
- Loaders/decoracion: `indicator.gif`, `up.png`, `uno.png`, `dos.png`, `tres.png`, `victo_chico.png`.

## Como se muestra hoy en la plataforma nueva

- No se migra la carpeta completa.
- Branding y membretes deben resolverse por configuracion (`logoUrl`) y plantillas nuevas.
- Productos usan `fotoUrl`, `fotoUrlGrande` y `fotosGaleria`.
- Las fotos migradas se sirven desde `/uploads` con raiz `UPLOADS_DIR`.
- El placeholder legacy de producto sin foto se conserva en `frontend/public/legacy-img/no_foto_chica.jpg`.

## Comparacion

| Aspecto | Legacy | Plataforma nueva | Estado |
| --- | --- | --- | --- |
| Placeholder producto | `img/no_foto_chica.jpg` | `frontend/public/legacy-img/no_foto_chica.jpg` | Cubierto |
| Fotos reales producto | Rutas externas/legacy de fotos chicas/grandes | `/uploads/fotos_chicas` y `/uploads/fotos_grandes` servidos por backend | Cubierto infraestructura |
| Logo sistema | `img/logo.png` hardcodeado | Branding React/config `logoUrl` | Reemplazado |
| Logo reportes | `img/logo_reportes.jpg` | Pendiente por plantilla de reportes/documentos | Fuera de este sprint |
| Membretes | PNG hardcodeados | Deben salir de plantilla nueva/config empresa | Fuera de este sprint |
| Loader gif | `indicator.gif` | Estados React | Reemplazado |
| Iconos decorativos | PNG/JPG legacy | Iconos/componentes modernos | Reemplazado |

## Brechas cerradas

- Placeholder de producto sin foto.
- Entrega backend de `/uploads`.
- Proxy dev de `/uploads`.
- Documentacion de produccion para `UPLOADS_DIR` y nginx.

## Evidencia legacy revisada

- `consulta_precios/lista.php`
- `bodega/lista.php`
- `bodega/subir_foto/index.php`
- `menu_top.php`
- `index.php`
- `gastos/lista_pdf.php`
- `cotizar_licitacion/imprimir_licitacion.php`
- `venta_directa/nota_venta.php`
- `taller/imprime_ficha.php`
- `css/estilos_sitio.css`

## Resultado

Sprint asociado: `SPR-25-img`  
Resultado: **aprobado con cambios de codigo y asset**  
Validacion: Hubble y Rawls aprobaron sin P0/P1.  
Pruebas: 9 tests focalizados OK, `test:ci` 109 tests OK, lint OK, build OK.
