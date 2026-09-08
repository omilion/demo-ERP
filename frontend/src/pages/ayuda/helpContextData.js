import { HELP_DOCUMENTS, helpDocumentsForUser } from './helpDocuments'

export const SECTION_HELP_MAP = {
  // --- VENTAS Y CRM ---
  ventas: {
    sectionKey: 'ventas',
    sectionTitle: 'Matriz de Ventas',
    sectionBadge: 'Área Comercial',
    docId: 'DOC-02',
    href: '/ayuda/roles/02_ROL_VENTAS_Y_LICITACIONES/index.html',
    summary: 'La Matriz de Ventas centraliza el ciclo comercial: desde el registro del cliente y cotización hasta la confirmación de la orden y su seguimiento hacia Bodega o Taller.',
    checklist: [
      'Revisa el estado de entrega y pago en los filtros superiores antes de accionar un pedido.',
      'Si un pedido tiene productos a fabricar, pasa por "Pasar a Taller" para activar la ODT.',
      'El cierre de la orden ocurre automáticamente cuando se junta estado Pagada y Entregada.',
    ],
    warnings: [
      'No anules ventas que ya tienen despachos en tránsito sin coordinar previamente con Bodega.',
      'No modifiques precios ni apliques descuentos fuera de las reglas autorizadas por jefatura.',
    ],
    relatedArticles: [
      { id: 'ART-V1', title: 'Crear Venta Sala o venta directa', description: 'Selección de cliente, detalle de ítems, cálculo de fecha tope y plazo.', href: '/ayuda/roles/02_ROL_VENTAS_Y_LICITACIONES/index.html#seccion-3' },
      { id: 'ART-V2', title: 'Licitaciones y Compras Ágiles', description: 'Registro de oportunidades desde CRM y posterior conversión formal a venta.', href: '/ayuda/roles/02_ROL_VENTAS_Y_LICITACIONES/index.html#seccion-4' },
      { id: 'ART-V3', title: 'Reglas de Descuento y Aprobaciones', description: 'Cómo solicitar excepciones sin romper el motor de márgenes.', href: '/ayuda/roles/08_ROL_ADMINISTRACION/index.html' },
      { id: 'ART-V4', title: 'Seguimiento de etapas en la Matriz', description: 'Comprensión de los estados: Pendiente, En preparación, Despachado, Entregado.', href: '/ayuda/roles/02_ROL_VENTAS_Y_LICITACIONES/index.html' },
    ],
  },
  'ventas-nueva': {
    sectionKey: 'ventas-nueva',
    sectionTitle: 'Formulario de Nueva Venta',
    sectionBadge: 'Ingreso Comercial',
    docId: 'DOC-02',
    href: '/ayuda/roles/02_ROL_VENTAS_Y_LICITACIONES/index.html#seccion-3',
    summary: 'Ingreso de ventas de Sala, Convenio Marco, Trato Directo o Marketplace. Asegúrate de verificar stock disponible antes de comprometer fechas de entrega.',
    checklist: [
      'Identifica el tipo de venta correcto (Sala, Convenio Marco, Marketplace, Web).',
      'Valida que los datos de contacto y comuna de despacho estén completos y con correo válido.',
      'Si un producto es "Transitorio" o no tiene stock, requerirá paso por Taller.',
    ],
    warnings: [
      'No crees clientes ficticios; para consumidor final en Sala, deja el cliente vacío sólo si la política lo permite.',
      'Presiona "Crear Venta" una sola vez para evitar órdenes duplicadas.',
    ],
    relatedArticles: [
      { id: 'ART-VN1', title: 'Convenio Marco y Órdenes de Compra', description: 'Verificación de no duplicidad de OC del portal Mercado Público.', href: '/ayuda/roles/02_ROL_VENTAS_Y_LICITACIONES/index.html' },
      { id: 'ART-VN2', title: 'Cálculo de plazos y días hábiles', description: 'Cómo el sistema calcula la fecha tope según el tipo de producto.', href: '/ayuda/roles/02_ROL_VENTAS_Y_LICITACIONES/index.html' },
    ],
  },
  crm: {
    sectionKey: 'crm',
    sectionTitle: 'CRM y Pipeline Comercial',
    sectionBadge: 'Prospección y Licitaciones',
    docId: 'DOC-02',
    href: '/ayuda/roles/02_ROL_VENTAS_Y_LICITACIONES/index.html#seccion-4',
    summary: 'Embudo de oportunidades comerciales: contacto inicial, cotizaciones enviadas, licitaciones públicas y acuerdos de Compra Ágil.',
    checklist: [
      'Registra las bitácoras y gestiones de llamada o reunión en cada lead.',
      'Convierte a venta únicamente las oportunidades adjudicadas o ganadas.',
      'Los coordinadores comerciales pueden auditar y reasignar prospectos del equipo.',
    ],
    warnings: [
      'Una cotización en CRM no reserva stock físico hasta que se convierte formalmente en venta.',
    ],
    relatedArticles: [
      { id: 'ART-CRM1', title: 'Ciclo de vida del Lead en CRM', description: 'De Nueva Oportunidad a Cotización y Negocio Ganado.', href: '/ayuda/roles/02_ROL_VENTAS_Y_LICITACIONES/index.html' },
      { id: 'ART-CRM2', title: 'Adjudicación y conversión a venta', description: 'Mapeo de ítems cotizados hacia la orden de trabajo.', href: '/ayuda/roles/02_ROL_VENTAS_Y_LICITACIONES/index.html' },
    ],
  },
  clientes: {
    sectionKey: 'clientes',
    sectionTitle: 'Directorio de Clientes',
    sectionBadge: 'Ficha Comercial',
    docId: 'DOC-02',
    href: '/ayuda/roles/02_ROL_VENTAS_Y_LICITACIONES/index.html',
    summary: 'Gestión de RUTs, razones sociales, giros comerciales, direcciones de sucursales y condiciones de crédito de clientes.',
    checklist: [
      'Verifica el RUT chileno con dígito verificador correcto.',
      'Registra el giro tributario oficial para permitir la emisión de Facturas electrónicas.',
    ],
    warnings: [
      'RUTs con formato erróneo causarán rechazos posteriores en la emisión de DTE del SII.',
    ],
    relatedArticles: [
      { id: 'ART-CLI1', title: 'Manejo de sucursales por cliente', description: 'Asignación de direcciones de entrega múltiples.', href: '/ayuda/roles/02_ROL_VENTAS_Y_LICITACIONES/index.html' },
    ],
  },

  // --- BODEGA Y DESPACHO ---
  bodega: {
    sectionKey: 'bodega',
    sectionTitle: 'Bodega e Inventario',
    sectionBadge: 'Gestión de Existencias',
    docId: 'DOC-03',
    href: '/ayuda/roles/03_ROL_BODEGA/index.html',
    summary: 'Control físico de inventario, consulta de stock, catálogo de productos, ubicaciones y kardex de movimientos de bodega.',
    checklist: [
      'Revisa los niveles de stock actual antes de despachar o autorizar retiros.',
      'Todo movimiento de inventario genera automáticamente una traza en MovimientoBodega.',
      'Usa el botón de exportación para auditar saldos en planillas Excel o CSV.',
    ],
    warnings: [
      'Nunca ajustes stock a ciegas; si hay descuadraturas físicas, documenta el motivo en la bitácora.',
    ],
    relatedArticles: [
      { id: 'ART-B1', title: 'Manual de Bodega y Logística', description: 'Flujo completo de recepción, almacenamiento y despacho.', href: '/ayuda/roles/03_ROL_BODEGA/index.html' },
      { id: 'ART-B2', title: 'Trazabilidad de Kardex', description: 'Comprender los tipos de movimiento: ingreso, egreso, reserva y daño.', href: '/ayuda/roles/03_ROL_BODEGA/index.html' },
      { id: 'ART-B3', title: 'Ubicaciones físicas y locaciones', description: 'Gestión de racks, bodegas satélite y bloques de taller.', href: '/ayuda/roles/03_ROL_BODEGA/index.html' },
    ],
  },
  picking: {
    sectionKey: 'picking',
    sectionTitle: 'Panel de Picking',
    sectionBadge: 'Preparación de Pedidos',
    docId: 'DOC-03',
    href: '/ayuda/roles/03_ROL_BODEGA/index.html',
    summary: 'En esta pantalla el bodeguero revisa los pedidos pendientes de retiro o despacho y confirma las cantidades físicas recogidas en rack.',
    checklist: [
      'Confirma el picking línea por línea marcando el casillero de verificación.',
      'Si una línea no está disponible completa, reporta la incidencia antes de cerrar.',
      'El sistema exige picking confirmado antes de poder pasar a la fase de Packing.',
    ],
    warnings: [
      'No intentes armar el bulto en Packing sin haber confirmado el picking previo en este panel.',
    ],
    relatedArticles: [
      { id: 'ART-PK1', title: 'Confirmación de Picking por ítem', description: 'Validación visual y código de barras de unidades preparadas.', href: '/ayuda/roles/03_ROL_BODEGA/index.html' },
      { id: 'ART-PK2', title: 'Sustituciones e incidencias de picking', description: 'Qué hacer ante quiebres de stock en pasillo.', href: '/ayuda/roles/03_ROL_BODEGA/index.html' },
    ],
  },
  packing: {
    sectionKey: 'packing',
    sectionTitle: 'Panel de Packing',
    sectionBadge: 'Embalaje y Bultos',
    docId: 'DOC-03',
    href: '/ayuda/roles/03_ROL_BODEGA/index.html',
    summary: 'Armado de paquetes, bultos y paletas. Registro del número de bulto, peso, dimensiones y estado de preparación previo al despacho.',
    checklist: [
      'Asigna un identificador claro a cada bulto (ej: B-21268-01).',
      'Ingresa peso y medidas reales para cubicación del transporte de carga.',
      'Verifica que todas las unidades confirmadas en picking estén incluidas.',
    ],
    warnings: [
      'No cierres bultos con cantidades mayores a las autorizadas en la orden de venta.',
    ],
    relatedArticles: [
      { id: 'ART-PAC1', title: 'Embalaje y etiquetado de bultos', description: 'Estándares de empaque para productos plásticos y espumas.', href: '/ayuda/roles/03_ROL_BODEGA/index.html' },
    ],
  },
  despachos: {
    sectionKey: 'despachos',
    sectionTitle: 'Despachos y Salidas',
    sectionBadge: 'Logística y Reparto',
    docId: 'DOC-04',
    href: '/ayuda/roles/04_ROL_DESPACHO/index.html',
    summary: 'Programación de vehículos, emisión de Guías de Despacho (DTE 52 o borrador interno) y registro de la cadena de seguimiento hasta la entrega.',
    checklist: [
      'Selecciona el transporte adecuado: Camión propio, Retiro en bodega o Courier externo.',
      'Sigue la cadena estricta de tracking: Preparado → Patio → Didáctico → Reparto → Entregado.',
      'Registra la firma o comprobante de entrega para cerrar la trazabilidad.',
    ],
    warnings: [
      'No saltes etapas de tracking; el sistema rechaza transiciones directas no consecutivas.',
      'Verifica si la guía requiere emisión SII o si opera como guía de traslado interno.',
    ],
    relatedArticles: [
      { id: 'ART-DES1', title: 'Cadena de Tracking obligatoria', description: 'Transiciones válidas y puntos de control en ruta.', href: '/ayuda/roles/04_ROL_DESPACHO/index.html' },
      { id: 'ART-DES2', title: 'Despacho Parcial de órdenes mixtas', description: 'Cómo despachar stock disponible y mantener saldo de taller abierto.', href: '/ayuda/roles/04_ROL_DESPACHO/index.html' },
      { id: 'ART-DES3', title: 'Emisión de Guía DTE 52', description: 'Campos requeridos por el SII para traslado de mercaderías.', href: '/ayuda/roles/04_ROL_DESPACHO/index.html' },
    ],
  },
  'stock-ingresos': {
    sectionKey: 'stock-ingresos',
    sectionTitle: 'Ingreso de Mercadería',
    sectionBadge: 'Recepción de Proveedores',
    docId: 'DOC-03',
    href: '/ayuda/roles/03_ROL_BODEGA/index.html',
    summary: 'Recepción de insumos y materias primas provenientes de proveedores nacionales o importaciones. Aplicación directa a stock de inventario.',
    checklist: [
      'Compara la factura física o electrónica del proveedor contra el conteo físico recibido.',
      'Verifica precios y costos unitarios para el recálculo ponderado.',
    ],
    warnings: [
      'Asegúrate de no aplicar dos veces el mismo ingreso de stock para evitar saldos falsos.',
    ],
    relatedArticles: [
      { id: 'ART-ING1', title: 'Recepción y costeo de mercadería', description: 'Impacto del ingreso en el costo medio ponderado.', href: '/ayuda/roles/03_ROL_BODEGA/index.html' },
    ],
  },

  // --- TALLER Y FABRICACIÓN ---
  taller: {
    sectionKey: 'taller',
    sectionTitle: 'Órdenes de Taller (ODT)',
    sectionBadge: 'Producción y Fábrica',
    docId: 'DOC-05',
    href: '/ayuda/roles/05_ROL_TALLER/index.html',
    summary: 'Supervisión de órdenes de trabajo de manufactura: asignación de operarios, consumo de materiales, control de etapas y aprobación de calidad.',
    checklist: [
      'Cada jefe de taller es responsable de supervisar y aprobar exclusivamente las órdenes de su área.',
      'Registra los consumos reales de materias primas e insumos antes de dar por lista la ODT.',
      'El cierre de la ODT requiere pasar obligatoriamente por Control de Calidad aprobado.',
    ],
    warnings: [
      'Una ODT en estado "Pendiente" no puede cerrarse directamente; debe avanzar por sus etapas.',
      'Cualquier merma excesiva debe justificarse en la bitácora del taller.',
    ],
    relatedArticles: [
      { id: 'ART-TAL1', title: 'Transiciones y ciclo de vida de una ODT', description: 'De Pendiente a En proceso, Control calidad y Terminada.', href: '/ayuda/roles/05_ROL_TALLER/index.html' },
      { id: 'ART-TAL2', title: 'Control de Calidad y Cierre seguro', description: 'Criterios de aceptación para liberación a Bodega.', href: '/ayuda/roles/05_ROL_TALLER/index.html' },
      { id: 'ART-TAL3', title: 'Historial de Materiales y Costos', description: 'Descuento de materia prima y trazabilidad de bloques de espuma.', href: '/ayuda/roles/05_ROL_TALLER/index.html' },
    ],
  },
  'taller-operario': {
    sectionKey: 'taller-operario',
    sectionTitle: 'Ficha del Operario de Taller',
    sectionBadge: 'Panel del Operario',
    docId: 'DOC-05B',
    href: '/ayuda/roles/05_ROL_TALLER/FICHA_RAPIDA_OPERARIO.html',
    summary: 'Vista simplificada para operarios de taller: inicio de jornada, reporte de avance cuantitativo, pausas operativas y marcado de etapa lista.',
    checklist: [
      'Presiona "Iniciar Trabajo" al comenzar la labor asignada.',
      'Si te detienes por falta de material o mantención, selecciona "Pausar" e indica el motivo.',
      'Al completar las unidades, ingresa la cantidad terminada y marca la etapa como "Lista".',
    ],
    warnings: [
      'El operario no puede cerrar la ODT general; el cierre final es atribución del Jefe de Taller.',
    ],
    relatedArticles: [
      { id: 'ART-OP1', title: 'Ficha rápida del Operario', description: 'Guía paso a paso en 5 minutos para trabajo en máquina.', href: '/ayuda/roles/05_ROL_TALLER/FICHA_RAPIDA_OPERARIO.html' },
      { id: 'ART-OP2', title: 'Registro de bitácora y pausas', description: 'Cómo declarar interrupciones sin perjudicar métricas.', href: '/ayuda/roles/05_ROL_TALLER/FICHA_RAPIDA_OPERARIO.html' },
    ],
  },

  // --- CAJA Y COBRANZA ---
  caja: {
    sectionKey: 'caja',
    sectionTitle: 'Caja y Turnos',
    sectionBadge: 'Gestión de Efectivo',
    docId: 'DOC-06',
    href: '/ayuda/roles/06_ROL_CAJA_Y_COBRANZA/index.html',
    summary: 'Administración de turnos de cajero, ingresos por ventas de mostrador, egresos por gastos menores autorizados y arqueo diario.',
    checklist: [
      'Abre el turno al inicio del día confirmando el fondo fijo de apertura.',
      'Todo ingreso por venta debe imputarse contra el documento referencial (Boleta o Factura).',
      'Realiza el arqueo físico de efectivo y transbank antes de cerrar el turno.',
    ],
    warnings: [
      'No registres pagos de ventas directamente en movimientos manuales; hazlo por Cobranza.',
      'Un turno cerrado no puede reabrirse ni modificarse.',
    ],
    relatedArticles: [
      { id: 'ART-CAJ1', title: 'Apertura y Cierre de Turno', description: 'Procedimiento de apertura, conteo ciego y arqueo final.', href: '/ayuda/roles/06_ROL_CAJA_Y_COBRANZA/index.html' },
      { id: 'ART-CAJ2', title: 'Egresos y gastos de caja chica', description: 'Comprobantes obligatorios para egresos menores.', href: '/ayuda/roles/06_ROL_CAJA_Y_COBRANZA/index.html' },
    ],
  },
  cobranza: {
    sectionKey: 'cobranza',
    sectionTitle: 'Cobranza y Cartera',
    sectionBadge: 'Cuentas por Cobrar',
    docId: 'DOC-06',
    href: '/ayuda/roles/06_ROL_CAJA_Y_COBRANZA/index.html',
    summary: 'Control de cuentas por cobrar a clientes, registro de documentos de venta (Boletas/Facturas referenciales) y abonos de cartera pendiente.',
    checklist: [
      'Registra primero la Boleta o Factura para crear la obligación referencial de pago.',
      'Imputa los abonos bancarios o cheques indicando número de transferencia u operación.',
      'Monitorea el estado financiero de las ventas: No pagada, Parcial o Pagada.',
    ],
    warnings: [
      'El monto del abono jamás puede superar el saldo pendiente del documento.',
    ],
    relatedArticles: [
      { id: 'ART-COB1', title: 'Documentos referenciales vs Pagos', description: 'Por qué Plastimar desacopla la obligación legal del medio de pago.', href: '/ayuda/roles/06_ROL_CAJA_Y_COBRANZA/index.html' },
      { id: 'ART-COB2', title: 'Gestión de créditos y cobranza vencida', description: 'Alertas de mora y bloqueo preventivo de despacho.', href: '/ayuda/roles/06_ROL_CAJA_Y_COBRANZA/index.html' },
    ],
  },
  'pagos-proveedores': {
    sectionKey: 'pagos-proveedores',
    sectionTitle: 'Pagos a Proveedores',
    sectionBadge: 'Cuentas por Pagar',
    docId: 'DOC-06',
    href: '/ayuda/roles/06_ROL_CAJA_Y_COBRANZA/index.html',
    summary: 'Gestión de facturas de proveedores por pagar, control de fechas de vencimiento, abonos parciales y conciliación de cuentas por pagar.',
    checklist: [
      'Revisa las facturas próximas a vencer para evitar intereses o corte de suministros.',
      'Registra abonos con respaldo de transferencia bancaria o egreso de caja chica.',
      'Al pagar el 100% de la factura, el sistema actualiza el estado automáticamente a "Pagado".',
    ],
    warnings: [
      'Documentos anulados no permiten registro de abonos ni alteraciones de saldo.',
    ],
    relatedArticles: [
      { id: 'ART-PROV1', title: 'Registro de facturas y notas de crédito de compra', description: 'Impacto de NC en el saldo neto del proveedor.', href: '/ayuda/roles/06_ROL_CAJA_Y_COBRANZA/index.html' },
      { id: 'ART-PROV2', title: 'Abonos parciales e imputación', description: 'Trazabilidad de pagos múltiples contra una sola factura.', href: '/ayuda/roles/06_ROL_CAJA_Y_COBRANZA/index.html' },
    ],
  },

  // --- FACTURACIÓN Y SII ---
  facturacion: {
    sectionKey: 'facturacion',
    sectionTitle: 'Facturación Electrónica (DTE)',
    sectionBadge: 'Tributaria y SII',
    docId: 'DOC-07',
    href: '/ayuda/roles/07_ROL_FACTURACION_DTE/index.html',
    summary: 'Emisión y recepción de Documentos Tributarios Electrónicos (DTE 33 Factura, DTE 39 Boleta, DTE 52 Guía de Despacho, DTE 61 Nota de Crédito).',
    checklist: [
      'Revisa el borrador tributario y vista previa antes del envío definitivo al SII.',
      'Verifica el estado del Track ID retornado por el WebService del SII.',
      'Toda Nota de Crédito exige referenciar el folio y tipo de documento original.',
    ],
    warnings: [
      'En Marcha Blanca no se deben emitir documentos reales sin autorización expresa de gerencia.',
      'Nunca reutilices folios que hayan recibido rechazo tributario sin consultar al administrador.',
    ],
    relatedArticles: [
      { id: 'ART-FAC1', title: 'Manual de Facturación DTE', description: 'Flujo completo de emisión, consulta de Track ID y notas de crédito.', href: '/ayuda/roles/07_ROL_FACTURACION_DTE/index.html' },
      { id: 'ART-FAC2', title: 'Borrador vs Emisión oficial', description: 'Uso de documentos internos durante marcha blanca.', href: '/ayuda/roles/07_ROL_FACTURACION_DTE/index.html' },
    ],
  },

  // --- RECURSOS HUMANOS ---
  rrhh: {
    sectionKey: 'rrhh',
    sectionTitle: 'Recursos Humanos',
    sectionBadge: 'Personal y Nómina',
    docId: 'DOC-08',
    href: '/ayuda/roles/08_ROL_ADMINISTRACION/index.html',
    summary: 'Fichas de personal, control de asistencia, jornadas laborales, licencias médicas, contratos y certificados de trabajadores.',
    checklist: [
      'Mantén actualizados los datos previsionales y de contacto de cada trabajador.',
      'El acceso a remuneraciones y salarios está estrictamente restringido por perfil rrhh.remuneracion.',
    ],
    warnings: [
      'Cuentas de observación o solo lectura no tienen acceso a ver sueldos líquidos.',
    ],
    relatedArticles: [
      { id: 'ART-RR1', title: 'Ficha del Trabajador y Contratos', description: 'Registro de ingresos, cargos y sucursales asignadas.', href: '/ayuda/roles/08_ROL_ADMINISTRACION/index.html' },
    ],
  },

  // --- GERENCIA Y COSTEO ---
  costeo: {
    sectionKey: 'costeo',
    sectionTitle: 'Costeo de Fabricación',
    sectionBadge: 'Estructura de Costos',
    docId: 'DOC-01',
    href: '/ayuda/01_DOSSIER_GERENCIA/index.html',
    summary: 'Fórmulas, recetas de manufactura, tarifas horarias por centro de costo, tiempos de proceso y cálculo de margen de contribución.',
    checklist: [
      'Revisa que los insumos tengan asignado costo unitario actualizado.',
      'Monitorea el impacto de las tarifas operativas en el precio sugerido de venta.',
    ],
    warnings: [
      'Cambiar tarifas globales de costeo recalcula las proyecciones de todas las recetas activas.',
    ],
    relatedArticles: [
      { id: 'ART-COS1', title: 'Dossier para Gerencia', description: 'Supervisión de márgenes, puntos de equilibrio y control de pérdidas.', href: '/ayuda/01_DOSSIER_GERENCIA/index.html' },
    ],
  },

  // --- ADMINISTRACIÓN ---
  usuarios: {
    sectionKey: 'usuarios',
    sectionTitle: 'Administración de Usuarios y Roles',
    sectionBadge: 'Seguridad y Accesos',
    docId: 'DOC-08',
    href: '/ayuda/roles/08_ROL_ADMINISTRACION/index.html',
    summary: 'Gestión de credenciales, asignación de los 9 roles oficiales, permisos funcionales extra, bloqueo de cuentas y auditoría de accesos.',
    checklist: [
      'Aplica el principio de mínimo privilegio: asigna el rol específico según la función real.',
      'Al cambiar contraseña a un usuario, su sesión previa se revoca inmediatamente en todos los dispositivos.',
      'Usa permisosExtra de forma aditiva para otorgar funciones puntuales sin elevar a Administrador.',
    ],
    warnings: [
      'Nunca compartas cuentas de usuario; cada acción queda registrada con nombre y timestamp en AuditLog.',
    ],
    relatedArticles: [
      { id: 'ART-ADM1', title: 'Manual de Administración y Seguridad', description: 'Manejo de roles, bajas inmediatas y rotación de contraseñas.', href: '/ayuda/roles/08_ROL_ADMINISTRACION/index.html' },
      { id: 'ART-ADM2', title: 'Permisos funcionales granulares', description: 'Cómo acotar funciones como entregas, aprobación de descuentos o avances.', href: '/ayuda/roles/08_ROL_ADMINISTRACION/index.html' },
    ],
  },

  // --- DEFECTO / GENERAL ---
  general: {
    sectionKey: 'general',
    sectionTitle: 'Centro de Operaciones',
    sectionBadge: 'Plastimar ERP 3.0',
    docId: 'DOC-00',
    href: '/ayuda/00_MAPA_DOCUMENTACION_Y_GUIA_INICIO/index.html',
    summary: 'Bienvenido al sistema ERP SisGestión 3.0 de Plastimar. Consulta los manuales oficiales de operación correspondientes a tu rol.',
    checklist: [
      'Familiarízate con los atajos del menú superior y campana de notificaciones.',
      'Si encuentras un error o duda durante la Marcha Blanca, utiliza el botón "Reportar observación".',
      'Todos los manuales detallados están disponibles para consulta permanente.',
    ],
    warnings: [
      'Ante dudas sobre stock, pagos o despachos, no improvises: consulta a tu supervisor.',
    ],
    relatedArticles: [
      { id: 'ART-GEN1', title: 'Guía de Inicio Rápido de Marcha Blanca', description: 'Reglas de juego, responsables y protocolo de contingencia.', href: '/ayuda/00_MAPA_DOCUMENTACION_Y_GUIA_INICIO/index.html' },
      { id: 'ART-GEN2', title: 'Cómo reportar una Falla o Mejora', description: 'Guía para documentar observaciones con número de orden y captura.', href: '/ayuda/widget/09_GUIA_FEEDBACK_Y_REPORTE_FALLAS/index.html' },
      { id: 'ART-GEN3', title: 'Dossier General de Gerencia', description: 'Flujos transversales e indicadores clave de desempeño.', href: '/ayuda/01_DOSSIER_GERENCIA/index.html' },
    ],
  },
}

export function resolveHelpContext(pathname = '/') {
  const clean = pathname.toLowerCase().replace(/\/$/, '') || '/'

  if (clean === '/ventas/nueva') return SECTION_HELP_MAP['ventas-nueva']
  if (clean.startsWith('/ventas')) return SECTION_HELP_MAP.ventas
  if (clean.startsWith('/crm') || clean.startsWith('/licitaciones')) return SECTION_HELP_MAP.crm
  if (clean.startsWith('/clientes')) return SECTION_HELP_MAP.clientes

  if (clean === '/bodega/picking') return SECTION_HELP_MAP.picking
  if (clean === '/bodega/packing') return SECTION_HELP_MAP.packing
  if (clean.startsWith('/despachos')) return SECTION_HELP_MAP.despachos
  if (clean.startsWith('/stock-ingresos')) return SECTION_HELP_MAP['stock-ingresos']
  if (clean.startsWith('/bodega') || clean.startsWith('/telas') || clean.startsWith('/ordenes-compra')) return SECTION_HELP_MAP.bodega

  if (clean === '/taller/operario' || clean.startsWith('/taller-operario') || clean.startsWith('/bitacora-taller')) return SECTION_HELP_MAP['taller-operario']
  if (clean.startsWith('/taller') || clean.startsWith('/pasar-taller') || clean.startsWith('/historial-materiales') || clean.startsWith('/excepciones-taller')) return SECTION_HELP_MAP.taller

  if (clean.startsWith('/caja')) return SECTION_HELP_MAP.caja
  if (clean.startsWith('/cobranza')) return SECTION_HELP_MAP.cobranza
  if (clean.startsWith('/pagos-proveedores') || clean.startsWith('/proveedores')) return SECTION_HELP_MAP['pagos-proveedores']

  if (clean.startsWith('/facturacion')) return SECTION_HELP_MAP.facturacion
  if (clean.startsWith('/rrhh')) return SECTION_HELP_MAP.rrhh
  if (clean.startsWith('/costeo') || clean.startsWith('/reportes')) return SECTION_HELP_MAP.costeo
  if (clean.startsWith('/usuarios') || clean.startsWith('/config') || clean.startsWith('/descuentos') || clean.startsWith('/admin')) return SECTION_HELP_MAP.usuarios

  return SECTION_HELP_MAP.general
}

export function searchHelpArticles(term = '', user = null) {
  const normalized = term.trim().toLowerCase()
  if (!normalized) return []

  const results = []
  const userDocs = helpDocumentsForUser(user)

  // 1. Search in main documents
  for (const doc of userDocs) {
    if (doc.title.toLowerCase().includes(normalized) || doc.description.toLowerCase().includes(normalized) || doc.id.toLowerCase().includes(normalized)) {
      results.push({
        type: 'doc',
        id: doc.id,
        title: doc.title,
        description: doc.description,
        href: doc.href,
        badge: 'Manual Oficial',
        tone: doc.tone || '#047857',
      })
    }
  }

  // 2. Search in section maps and related articles
  for (const sec of Object.values(SECTION_HELP_MAP)) {
    if (sec.sectionTitle.toLowerCase().includes(normalized) || sec.summary.toLowerCase().includes(normalized)) {
      if (!results.some(r => r.href === sec.href)) {
        results.push({
          type: 'section',
          id: sec.docId,
          title: sec.sectionTitle,
          description: sec.summary,
          href: sec.href,
          badge: sec.sectionBadge,
          tone: '#0369a1',
        })
      }
    }
    for (const art of sec.relatedArticles || []) {
      if (art.title.toLowerCase().includes(normalized) || art.description.toLowerCase().includes(normalized)) {
        results.push({
          type: 'article',
          id: art.id,
          title: art.title,
          description: art.description,
          href: art.href,
          badge: sec.sectionTitle,
          tone: '#475569',
        })
      }
    }
  }

  return results
}
