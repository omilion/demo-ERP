# Respuesta a observaciones del cliente - Modulo Bodega

Fecha de revision: 26-05-2026

Fuente revisada: `C:\Users\flipe\Downloads\OBSERVACIONES MODULO BODEGA (1).docx`.

Criterio: se mantiene el orden y el texto original de cada observacion del cliente. El estado indica si hoy esta disponible en la plataforma, si esta parcial, si debe implementarse o si requiere validacion/datos.

## Resumen ejecutivo

- Ya existe base funcional para Bodega, Consulta de Precios, Ingreso de Mercaderia, Despachos y Ventas.
- La mayor brecha no es que falte todo el modulo, sino que varias pantallas no replican aun el comportamiento/visualizacion legacy que pide el cliente.
- Lo mas importante a implementar en este bloque: filtros completos, columnas solicitadas, doble click a detalle/edicion, exportacion Excel, ajustes de contraste/densidad, codigo maestro y campos faltantes de producto.
- Lo que requiere validacion con legacy: creacion de factura desde ingreso de mercaderia, matriz de ventas del dia y filtros/acciones exactas.
- Lo que parece fuera del alcance directo de este bloque si no estaba comprometido: integracion completa de documentos SII. Multas si existe como base y puede integrarse visualmente donde falte.

## Imagenes revisadas

- Imagen 1: listado legacy de Bodega/Inventario.
- Imagen 2: formulario actual de producto.
- Imagen 3: Consulta de Precios actual.
- Imagen 4: botones/filtros legacy.
- Imagen 5: Ingreso de Mercaderia actual.
- Imagen 6: menu legacy de ingreso/consulta de facturas.
- Imagen 7: listado legacy de Despachos.
- Imagen 8: formulario legacy de nueva factura.
- Imagen 9: matriz/listado legacy de Ventas.

## Revision punto por punto

| # | Pregunta u observacion del cliente | Estado hoy | Que vimos en plataforma | Implicancia / accion sugerida | Imagen |
|---:|---|---|---|---|---|
| 1 | BODEGA INVENTARIO | Encabezado de sección | Corresponde al módulo Bodega / Inventario revisado contra la pantalla actual y la referencia legacy. | Sin implementación específica: se usa como separador del informe. | Imágenes 1 a 4 |
| 2 | AGREGAR FILTROS DE BUSQUEDA: | Parcial | Hoy existen búsqueda general y filtros por proveedor, categoría, ubicación, ID Marco y estado. No están todos los filtros solicitados ni con la experiencia legacy completa. | Implementar una barra de filtros más completa y visible, alineada al legacy. | Imagen 1 / Imagen 4 |
| 3 | PUBLICADO EN LA WEB SI O NO , QUE LO MUESTRE TAMBIEN EN LA TABLA. | Parcial | El dato existe como `visibleWeb` y el backend permite filtrar por él, pero la tabla de Bodega no lo muestra como columna. | Agregar columna `Mostrar web` y filtro Si/No en la tabla. | Imagen 1 |
| 4 | FILTROS CON MENU DESPEGABLE. | Parcial | Estado inventario ya usa desplegable. Proveedor, categoría, ubicación e ID Marco están como campos de texto. | Convertir filtros principales a desplegables cuando exista catálogo de datos confiable. | Imagen 4 |
| 5 | PERMITA ENTRAR AL EDITAR CON DOBLE CLICK | Pendiente | La tabla permite editar con botón de acción, pero no se detectó doble click sobre la fila. | Agregar doble click en fila para abrir edición/detalle. | Imagen 1 |
| 6 | GENERAR DESCARGABLES, EXPORTAR EXCEL, MASIVO STOCK, MASIVO PRECIOS, MASIVO WEB, ETC.. | Parcial | Existe exportación CSV e importación masiva para stock, precios y productos. No queda resuelto como Excel ni como flujo masivo web visible para el usuario. | Agregar exportación Excel y dejar accesos masivos separados para stock, precios y web. | Imagen 1 |
| 7 | SE MUESTRE NOMBRE DEL PROVEEDOR. | Parcial | El producto tiene proveedor y Consulta de Precios lo muestra. La tabla principal de Bodega no lo muestra. | Agregar columna Proveedor en Bodega Inventario. | Imagen 1 |
| 8 | LAS FOTOS NO ESTAN COINCIDIENDO CON EL NOMBRE DEL PRODUCTO O CODIGO. | Duda / revisión de datos | La plataforma soporta foto por producto y galería, pero esta observación apunta a calidad de datos o asociación de imágenes. | Auditar productos con imagen, código y nombre; corregir registros o migración si hay cruces. | Imagen 1 / Imagen 3 |
| 9 | NO MOSTRAR STOCK MINIMO EN EL STOCK. | Pendiente UI | Hoy el stock se muestra junto con el mínimo en la misma columna (`stock/minimo`). | Separar u ocultar stock mínimo en la tabla principal; dejarlo solo en edición/alertas. | Imagen 1 |
| 10 | TRABAJAR CODIGO MAESTRO: tenemos el caso , que un mismo producto lo venden varios proveedores diferentes, se necesita crear un código maestro que agrupe estos distintos códigos sumando stock e indicando precio ponderado. | Implementar | Existe relación entre productos, pero no se confirmó una lógica funcional de código maestro que agrupe proveedores, sume stock y calcule precio ponderado. | Implementar modelo/flujo de código maestro con agrupación, stock total y precio ponderado. | Imagen 1 |
| 11 | BOTON “Ingreso de Mercaderia” modificar por “CREAR NUEVO” | Pendiente menor | El botón existe con el texto `Ingreso Mercadería`. | Renombrar botón a `Crear nuevo`. | Imagen 1 |
| 12 | El orden de la tabla debe ser:FOTO – CODIGO-MOSTRAR WEB-NOMBRE- CATEGORIA- SUBCATEGORIA-PRECIO COSTO- PRECIO VENTA – PRECIO LICITACION – STOCK – PROVEEDOR – ESTADO. | Implementar | La tabla actual no tiene ese orden ni todas esas columnas. Hoy muestra foto, código, nombre, categoría, stock/minimo, estado, precio y acciones. | Reordenar columnas y agregar campos faltantes: mostrar web, subcategoría, precio costo, venta, licitación y proveedor. | Imagen 1 |
| 13 | AGREGAR FILTRO SUBCATEGORIA | Pendiente | El modelo contempla subcategoría, pero no se ve filtro de subcategoría en Bodega. | Agregar filtro y columna/subcampo asociado a subcategoría. | Imagen 1 |
| 14 | PERMITIR MULTIPLES FILTROS. | Parcial | Hoy se pueden combinar algunos filtros, pero no están todos los solicitados ni con una interfaz clara de filtros múltiples. | Completar filtros múltiples con estado visible y botón limpiar. | Imagen 1 / Imagen 4 |
| 15 | PARA ESTA SECCION: | Encabezado de sección | Introduce observaciones del formulario de producto/edición. | Sin implementación específica: se usa como separador del informe. | Imagen 2 |
| 16 | FALTA AGREGAR SUBCATEGORIA | Pendiente | El dato existe en backend, pero no está expuesto claramente en el formulario actual de producto. | Agregar campo Subcategoría en creación/edición. | Imagen 2 |
| 17 | UBICACIÓN FISICA DEBE SER MENU DESPEGABLE, NO CAMPO ABIERTO | Pendiente | Ubicación física está como campo abierto de texto. | Crear catálogo/lista de ubicaciones y cambiar el campo a desplegable. | Imagen 2 |
| 18 | FALTA AGREGAR PRECIO LICITACION | Pendiente | Existe precio Marco/Convenio, pero no un campo explícito `Precio licitación` en el formulario. | Agregar precio licitación o renombrar/clarificar si corresponde al precio Marco actual. | Imagen 2 |
| 19 | FALTA AGREGAR EDAD, MATERIALIDAD | Pendiente | No se detectaron campos visibles para edad ni materialidad en producto. | Agregar campos de atributos técnicos del producto. | Imagen 2 |
| 20 | PRECIO WEB, VIENE POR DEFECTO DE PRECIO COSTO VS PROVEEDOR | Parcial | Precio web existe, pero se carga como campo editable. En web pública se usa precio web y cae a precio lista si no existe. | Definir regla de cálculo por proveedor/costo y aplicar valor por defecto automático. | Imagen 2 |
| 21 | AGREGAR DESCRIPCION LICITACION | Pendiente | No se detectó campo específico para descripción de licitación. | Agregar descripción licitación en producto. | Imagen 2 |
| 22 | ELIMINAR DESCRIPCION LARGA | Pendiente menor | El formulario mantiene un campo `Descripción larga`. | Eliminarlo de la UI o reemplazarlo por los campos específicos solicitados. | Imagen 2 |
| 23 | AGREGAR DESCRIPCION LINK DE COMPRA | Pendiente | No se detectó campo específico para link de compra. | Agregar campo link/descripcion de compra. | Imagen 2 |
| 24 | AGREGAR HISTORIAL DE PRECIO COSTO E STOCK. | Parcial | Existe historial de precio para precio lista y movimientos de stock. Falta asegurar historial específico de precio costo y vista clara para ambos. | Consolidar historial de precio costo y stock en la ficha de producto. | Imagen 2 |
| 25 | PERMITIR AGREGAR MAS 1 FOTOGRAFIA. | Disponible hoy | El formulario soporta galería de fotos (`fotosGaleria`) además de foto principal. | Mantener y mejorar la carga si se requiere una experiencia más visual. | Imagen 2 |
| 26 | TODOS LOS PRODUCTOS CON CODIGO “MK” SE DEBEN NOTIFICAR A TALLER. | Pendiente | No se encontró una regla automática de notificación a taller para códigos MK. | Implementar regla de notificación al crear/editar/importar productos con código MK. | Imagen 2 |
| 27 | ACHICAR LOS CAMPOS, NO TRABAJAR CON LETRAS GRIS, UTILIZAR NEGRO, CANSA LA VISTA, TRABAJAR MAS COMPACTO. | Implementar UI | La observación es válida como ajuste de usabilidad. Hay varias vistas con campos amplios y texto secundario gris. | Compactar formularios/tablas y subir contraste del texto. | Imagen 2 / Imagen 3 |
| 28 | PERMITIR MULTIPLES FILTROS | Parcial | Repite el punto 14, aplicado a la zona de consulta/listado. | Completar filtros múltiples en Bodega y Consulta de Precios. | Imagen 4 |
| 29 | AGREGAR BOTONES DE FILTRO | Pendiente UI | Los filtros existen como inputs, no como botones tipo legacy. | Agregar botones/accesos de filtro según la referencia legacy. | Imagen 4 |
| 30 | AGREGAR ESTOS Y SUBCATEGORIA, MOSTRAR WEB. | Parcial | Mostrar web existe como dato, subcategoría existe en modelo, pero no están correctamente visibles en la tabla/filtros actuales. | Agregar columnas/filtros de subcategoría y mostrar web. | Imagen 4 |
| 31 | MOSTRAR PRECIO COSTO , PRECIO VENTA, PRECIO LICITACION, PROVEEDOR, STOCK | Parcial | Consulta de Precios muestra proveedor, stock, precio lista y precio marco. Falta separar costo/venta/licitación con nombres exactos. | Ajustar columnas y nomenclatura de precios. | Imagen 3 / Imagen 4 |
| 32 | AGREGAR BUSQUEDA DE FILTROS | Parcial | Existe búsqueda general. Falta búsqueda dentro de filtros/desplegables o filtros más guiados. | Agregar búsqueda en filtros cuando haya listas largas. | Imagen 4 |
| 33 | DEBE CONTENER TODA ESTA INFORMACION | Parcial | La pantalla actual contiene parte de la información; no contiene toda la información de la referencia legacy. | Completar columnas/campos según los puntos 30 y 31. | Imagen 3 / Imagen 4 |
| 34 | PERMITIR CREAR NUEVA FACTURA, PROBAR ESTA FUNCIONALIDAD EN LEGACY PARA QUE LO ENTIENDAN | Parcial / requiere validación legacy | Ingreso de Mercadería lista documentos y permite aplicar stock; el flujo de factura/proveedor existe separado. Falta validar si replica la creación legacy. | Revisar legacy con el cliente/equipo y ajustar flujo de crear nueva factura desde ingreso de mercadería. | Imagen 5 / Imagen 6 / Imagen 8 |
| 35 | MODULO DESPACHOS | Encabezado de sección | Introduce observaciones del módulo Despachos. | Sin implementación específica: se usa como separador del informe. | Imagen 7 |
| 36 | DEBE MOSTRAR TODA ESTA INFORMACION | Parcial | Despachos muestra datos logísticos principales, pero no replica toda la grilla legacy de la imagen. | Alinear columnas con referencia legacy y definir qué campos son obligatorios. | Imagen 7 |
| 37 | PERMITIR BUSQUEDAS PENDIENTE DE DESPACHOS POR RUT CLIENTE, REGION, COMUNA, CIUDAD. | Parcial | Backend soporta región, comuna y cliente/RUT por filtro de cliente. La UI muestra comuna y cliente, pero no región ni ciudad como filtros explícitos. | Agregar filtros visibles para RUT cliente, región y ciudad; dejar pendiente por defecto si corresponde. | Imagen 7 |
| 38 | Lo mas similar posible a como esta actualmente, | Implementar UI | La vista actual no es idéntica al legacy; usa diseño nuevo. | Ajustar visualización y columnas buscando equivalencia funcional con legacy. | Imagen 7 |
| 39 | Doble click y entrar al detalle de la venta (Ver legacy) | Pendiente | Se detectan enlaces/acciones, pero no doble click de fila hacia detalle de venta como comportamiento legacy. | Agregar doble click en despacho para abrir detalle de venta/orden asociada. | Imagen 7 |
| 40 | MODULO VENTAS: | Encabezado de sección | Introduce observaciones del módulo Ventas. | Sin implementación específica: se usa como separador del informe. | Imagen 9 |
| 41 | En general cuesta mucho leerlo, faltan varias visualizaciones y funcionalidades. | Implementar UI | La matriz actual existe, pero la observación de legibilidad es consistente con la necesidad de compactar y mejorar columnas/vistas. | Ajustar densidad, contraste, jerarquía visual y columnas de ventas. | Imagen 9 |
| 42 | Debe ser replicado lo mas parecido al sistema actual en cuanto a visualización. | Implementar UI | La vista actual no replica la matriz legacy en forma exacta. | Rediseñar matriz de ventas para acercarla al legacy manteniendo permisos y datos del sistema nuevo. | Imagen 9 |
| 43 | Documentos agregar todo tipo documento generado por SII, como también la opción de MULTAS. | Parcial / fuera de este alcance para SII | Multas existen como módulo/API y se reflejan en despachos. La integración completa de documentos SII no se ve resuelta y depende de integración tributaria/documental. | Incluir multas en visualización donde falte. Documentos SII completos deben tratarse como alcance aparte si no estaba comprometido en fase actual. | Imagen 9 |
| 44 | Indicar el tipo de venta WEB, LICITACION, SALA , ETC.. | Disponible hoy | Ventas ya maneja y muestra tipo de venta, con filtros/pestañas para web, licitación y convenio. | Revisar si falta etiqueta SALA u otra nomenclatura exacta del legacy. | Imagen 9 |
| 45 | Matriz venta lo tenemos automatizado para la ventas generadas durante el día (hoy) ** Ver legacy | Parcial | La matriz tiene pestaña/filtro `Hoy`, pero falta confirmar si reproduce exactamente la automatización legacy. | Validar regla legacy de ventas del día y ajustar si hay diferencias. | Imagen 9 |
| 46 | Permitir exportaciones de Excel.. | Parcial | Existe exportación CSV en Ventas/Despachos/Bodega; no Excel nativo. | Agregar exportación Excel donde el cliente la solicita. | Imagen 9 |
| 47 | Filtros, etc.. jugar en legacy | Requiere validación legacy | No es una funcionalidad puntual; pide revisar el comportamiento del sistema antiguo. | Hacer walkthrough legacy y cerrar checklist de filtros/acciones esperadas. | Imagen 9 |

## Archivos de evidencia

- Texto extraido del Word: `C:\Users\flipe\OneDrive\Documentos\New project 4\plastimar\docs\observaciones-modulo-bodega-extract\texto_extraido.txt`
- Imagenes extraidas: `C:\Users\flipe\OneDrive\Documentos\New project 4\plastimar\docs\observaciones-modulo-bodega-extract\images`
- Hoja de contacto: `C:\Users\flipe\OneDrive\Documentos\New project 4\plastimar\docs\observaciones-modulo-bodega-extract\contact_sheet.jpg`
