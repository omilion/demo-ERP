// D:\plastimar-erp-v2\backend\src\facturacion\engine.js
// Orquestación de facturación: toma documentos guardados en la base, asigna
// folios desde los CAF, construye y firma los XML y habla con el SII.
//
// Adaptado de HM ERP: misma interfaz publica y orden de validaciones, pero
// async-ificado porque el adapter Prisma (facturacion/db.js) es async, a
// diferencia del adapter better-sqlite3 sincrono de HM. Libros IECV/RCOF
// quedan fuera de este puerto (ver spec).

import fs from 'node:fs';
import path from 'node:path';
import { assertXmlSignatures, loadCertificate } from './firma.js';
import { parseCaf } from './caf.js';
import { assertDteLineLimits, buildDocumento, isBoleta, TIPOS_DTE } from './documento.js';
import { buildDte, buildEnvio } from './envio.js';
import { toLatin1Buffer, XML_DECL, normalizeRut, isValidRut, formatDate } from './xmlUtil.js';
import * as sii from './siiClient.js';
import { assertNotaDteInput } from './notas.js';

const ESTADOS_ACEPTADO = new Set(['DOK', 'EOK', 'RPR']);
const ESTADOS_RECHAZADO = new Set(['RCH', 'RFR', 'RSC', 'RCT', 'FAU', 'FNA']);
const ESTADOS_DOCUMENTO_VIGENTE = new Set(['emitido', 'enviado', 'aceptado']);
const TIPOS_VENTA_TRIBUTARIA = new Set([33, 39]);
const TIPOS_RECEPTOR_TRIBUTARIO_COMPLETO = new Set([33, 34, 43, 46, 52, 56, 61]);

export const resolveDatosReceptor = (doc, value = {}) => {
  const receptor = { ...value };
  if (isBoleta(doc?.tipoDte)) {
    receptor.rut = normalizeRut(receptor.rut) || '66666666-6';
    receptor.razonSocial = receptor.razonSocial || 'Consumidor Final';
    return receptor;
  }

  receptor.rut = normalizeRut(receptor.rut);
  if (!receptor.rut || !isValidRut(receptor.rut)) {
    throw new Error('El receptor no tiene un RUT válido.');
  }
  if (!receptor.razonSocial) throw new Error('El receptor no tiene razón social.');

  if (TIPOS_RECEPTOR_TRIBUTARIO_COMPLETO.has(Number(doc?.tipoDte))) {
    const faltantes = ['giro', 'direccion', 'comuna'].filter(campo => !String(receptor[campo] || '').trim());
    if (faltantes.length) {
      throw new Error(`Completa los datos tributarios del receptor antes de facturar. Faltan: ${faltantes.join(', ')}.`);
    }
  }
  return receptor;
};

const anulaDocumento = (referencias, docId) => (Array.isArray(referencias) ? referencias : [])
  .some(ref => Number(ref?.docLocalId) === Number(docId) && (
    Number(ref?.codRef) === 1
    || (!ref?.codRef && /anul/i.test(String(ref?.razon || '')))
  ));

export const findDocumentoVentaVigente = (doc, documentosVenta = []) => {
  if (!doc?.ordenId || !TIPOS_VENTA_TRIBUTARIA.has(Number(doc.tipoDte))) return null;
  const notasCreditoActivas = documentosVenta.filter(item =>
    Number(item.tipoDte) === 61 && ESTADOS_DOCUMENTO_VIGENTE.has(String(item.estado))
  );
  return documentosVenta.find(item => {
    if (Number(item.id) === Number(doc.id)) return false;
    if (!TIPOS_VENTA_TRIBUTARIA.has(Number(item.tipoDte))) return false;
    if (!ESTADOS_DOCUMENTO_VIGENTE.has(String(item.estado))) return false;
    return !notasCreditoActivas.some(nc => anulaDocumento(nc.referencias, item.id));
  }) || null;
};

export const assertMismoReceptorReferencia = (doc, referenced) => {
  const receptorRut = normalizeRut(doc?.receptor?.rut);
  const referencedRut = normalizeRut(referenced?.receptor?.rut);
  if ([56, 61].includes(Number(doc?.tipoDte)) && receptorRut && referencedRut && receptorRut !== referencedRut) {
    throw new Error(`La Nota de Credito/Debito y el documento referenciado deben pertenecer al mismo receptor (${receptorRut} != ${referencedRut}).`);
  }
};

export const estadoDesdeRespuestaSii = (estadoActual, resultado = {}) => {
  const codigo = String(resultado.estado || '').toUpperCase();
  const resumen = resultado.resumen || {};
  if (codigo === 'EPR') {
    const informados = Number(resumen.informados || 0);
    const aceptados = Number(resumen.aceptados || 0);
    const reparos = Number(resumen.reparos || 0);
    const rechazados = Number(resumen.rechazados || 0);

    // En normativa SII, los documentos aceptados con reparos (reparos) son legalmente válidos y aceptados
    if (informados > 0 && (aceptados + reparos) === informados && rechazados === 0) {
      return 'aceptado';
    }
    if (rechazados > 0 && aceptados === 0 && reparos === 0) return 'rechazado';
    return estadoActual;
  }
  if (ESTADOS_ACEPTADO.has(codigo)) return 'aceptado';
  if (ESTADOS_RECHAZADO.has(codigo)) return 'rechazado';
  return estadoActual;
};

export const requiereConsultaIndividualDte = (resultado = {}) => {
  const codigo = String(resultado.estado || '').toUpperCase();
  const resumen = resultado.resumen || {};
  return codigo === 'EPR'
    && Number(resumen.informados) > 0
    && (Number(resumen.rechazados) > 0
      || Number(resumen.reparos) > 0
      || (Number(resumen.aceptados) === 0 && Number(resumen.rechazados) === 0));
};

export const createFacturacionEngine = ({ db, dataDir }) => {
  fs.mkdirSync(dataDir, { recursive: true });
  const certPath = path.join(dataDir, 'certificado.p12');

  const getEmpresa = async () => {
    const empresa = await db.getEmpresa();
    return {
      ambiente: 'certificacion',
      nroResol: 0,
      ...empresa
    };
  };

  const requireEmpresa = async () => {
    const empresa = await getEmpresa();
    const faltantes = ['rut', 'razonSocial', 'giro', 'direccion', 'comuna'].filter(f => !empresa[f]);
    if (faltantes.length) {
      throw new Error(`Configura la empresa antes de emitir. Faltan: ${faltantes.join(', ')}.`);
    }
    if (!empresa.fchResol) {
      throw new Error('Configura la fecha de resolución (FchResol) de la empresa.');
    }
    return empresa;
  };

  const certInfo = async () => {
    const empresa = await getEmpresa();
    if (!fs.existsSync(certPath)) return { cargado: false };
    if (!empresa.certPass) return { cargado: true, valido: false, error: 'Falta la contraseña del certificado.' };
    try {
      const cert = loadCertificate(certPath, empresa.certPass);
      return {
        cargado: true,
        valido: true,
        subject: cert.subject,
        validFrom: cert.validFrom,
        validTo: cert.validTo,
        rutTitular: cert.rutTitular
      };
    } catch (err) {
      return { cargado: true, valido: false, error: err.message };
    }
  };

  const loadCert = (empresa) => {
    if (!fs.existsSync(certPath)) {
      throw new Error('No hay certificado digital cargado. Súbelo en Configuración.');
    }
    if (!empresa.certPass) throw new Error('Falta la contraseña del certificado en Configuración.');
    return loadCertificate(certPath, empresa.certPass);
  };

  const saveCert = async (buffer, password) => {
    fs.writeFileSync(certPath, buffer);
    if (password !== undefined) {
      const empresa = await db.getEmpresa();
      await db.saveEmpresa({ ...empresa, certPass: password });
    }
    return certInfo();
  };

  const rutEnvia = (empresa, cert) => {
    const configurado = normalizeRut(empresa.rutEnvia);
    const titular = normalizeRut(cert.rutTitular);
    if (configurado && titular && configurado !== titular) {
      throw new Error(`El RUT que envia (${configurado}) no coincide con el titular del certificado (${titular}).`);
    }
    const rut = configurado || titular;
    if (!rut) {
      throw new Error('No se pudo determinar el RUT del firmante (rutEnvia). Configúralo en Configuración.');
    }
    return rut;
  };

  const resolveReceptor = async (doc, empresa) => {
    let receptor = { ...(doc.receptor || {}) };
    if (doc.clienteId) {
      const client = await db.clients.get(doc.clienteId);
      if (client) {
        receptor = {
          rut: receptor.rut || client.rut,
          razonSocial: receptor.razonSocial || client.razonSocial || client.name,
          giro: receptor.giro || client.giro,
          direccion: receptor.direccion || client.direccion,
          comuna: receptor.comuna || client.comuna,
          ciudad: receptor.ciudad || client.ciudad,
          email: receptor.email || client.emailDte
        };
      }
    }
    // Guía de traslado interno: el receptor es el propio emisor
    if (doc.tipoDte === 52 && Number(doc.extra?.indTraslado) === 5) {
      receptor = {
        rut: empresa.rut,
        razonSocial: empresa.razonSocial,
        giro: empresa.giro,
        direccion: empresa.direccion,
        comuna: empresa.comuna,
        ciudad: empresa.ciudad
      };
    }
    return resolveDatosReceptor(doc, receptor);
  };

  // Resuelve referencias que apuntan a documentos locales (docLocalId) al
  // folio/tipo/fecha reales del documento referenciado ya emitido.
  const resolveReferencias = async (doc) => {
    const referencias = doc.referencias || [];
    const resolved = [];
    for (const ref of referencias) {
      if (!ref.docLocalId) {
        resolved.push({ ...ref, fechaRef: ref.fechaRef || doc.fechaEmision || formatDate() });
        continue;
      }
      const referenced = await db.documentos.get(ref.docLocalId);
      if (!referenced || !referenced.folio) {
        throw new Error('La referencia apunta a un documento que aún no ha sido emitido (sin folio). Emite primero el documento original.');
      }
      assertMismoReceptorReferencia(doc, referenced);
      resolved.push({
        ...ref,
        tipoDocRef: ref.tipoDocRef || String(referenced.tipoDte),
        folioRef: ref.folioRef || String(referenced.folio),
        fechaRef: ref.fechaRef || referenced.fechaEmision || formatDate()
      });
    }
    return resolved;
  };

  const emitirDocumento = async (docId) => {
    const doc = await db.documentos.get(docId);
    if (!doc) throw new Error('Documento no encontrado.');
    if (!['borrador', 'error'].includes(doc.estado)) {
      throw new Error(`El documento ya fue emitido (estado: ${doc.estado}).`);
    }
    if (doc.estado === 'error' && doc.folio) {
      throw new Error(`El documento ya tiene folio ${doc.folio} y quedó con error. No se puede reemitir: revisa su rechazo o envío antes de cualquier acción manual.`);
    }
    if (!TIPOS_DTE[doc.tipoDte]) throw new Error(`Tipo de DTE no soportado: ${doc.tipoDte}.`);
    // Debe ejecutarse antes de cargar certificado o tomar folio: un documento
    // fuera del schema del SII no puede consumir un folio irrecuperable.
    assertDteLineLimits(doc);

    if (doc.ordenId && TIPOS_VENTA_TRIBUTARIA.has(Number(doc.tipoDte))) {
      const documentosVenta = await db.documentos.list({ ordenId: doc.ordenId });
      const vigente = findDocumentoVentaVigente(doc, documentosVenta);
      if (vigente) {
        const etiqueta = vigente.tipoDte === 39 ? 'Boleta' : 'Factura';
        throw new Error(`La venta #${doc.ordenId} ya tiene una ${etiqueta} vigente (folio ${vigente.folio ?? '?'}). Anulala con una Nota de Credito antes de emitir otra.`);
      }
    }

    const empresa = await requireEmpresa();
    const cert = loadCert(empresa);
    // Acteco no es obligatorio para boletas (buildEmisor no lo incluye en ese
    // schema) pero el SII SI lo exige para factura/guia/NC/ND: sin este check
    // el rechazo llega recien en enviar() (STATUS 7, XSD invalido) despues de
    // haber consumido un folio local.
    if (!isBoleta(doc.tipoDte) && !empresa.acteco) {
      throw new Error('Configura el Acteco (código de actividad económica) de la empresa antes de emitir.');
    }
    const receptor = await resolveReceptor(doc, empresa);
    const referencias = await resolveReferencias({ ...doc, receptor });
    await assertNotaDteInput({ doc: { ...doc, receptor, referencias }, db });

    const asignacion = await db.cafs.tomarFolio(doc.tipoDte, empresa.ambiente, empresa.fchResol);
    if (!asignacion) {
      throw new Error(`No hay folios disponibles para ${TIPOS_DTE[doc.tipoDte]} en ambiente ${empresa.ambiente}. Carga un CAF.`);
    }

    try {
      const caf = parseCaf(asignacion.caf.xml);
      const timestamp = new Date();
      const { documentoXml, totales, fechaEmision } = buildDocumento({
        empresa,
        receptor,
        doc: { ...doc, folio: asignacion.folio, referencias },
        caf,
        timestamp
      });
      const dteXml = buildDte(documentoXml, cert);

      return db.documentos.update(docId, {
        folio: asignacion.folio,
        fechaEmision,
        receptor,
        referencias,
        totales,
        xml: dteXml,
        ambiente: empresa.ambiente,
        estado: 'emitido',
        estadoDetalle: null
      });
    } catch (err) {
      // El folio ya quedó consumido: registrar el error sin perder el documento
      await db.documentos.update(docId, { estado: 'error', estadoDetalle: err.message });
      throw err;
    }
  };

  const emitir = async (docId) => {
    const doc = await db.documentos.get(docId);
    if (!doc) throw new Error('Documento no encontrado.');
    if (doc.ordenId && TIPOS_VENTA_TRIBUTARIA.has(Number(doc.tipoDte)) && db.documentos.withOrdenLock) {
      return db.documentos.withOrdenLock(doc.ordenId, () => emitirDocumento(docId));
    }
    return emitirDocumento(docId);
  };

  const enviarDocumentos = async (docIds) => {
    const docs = [];
    for (const idValue of docIds) {
      const doc = await db.documentos.get(idValue);
      if (!doc) throw new Error(`Documento ${idValue} no encontrado.`);
      // Una vez recibido un trackId, el DTE se consulta: no se vuelve a subir.
      // Esto evita que reintentos concurrentes generen envíos duplicados al SII.
      if (doc.estado !== 'emitido') {
        throw new Error(`El documento folio ${doc.folio ?? '?'} no está emitido (estado: ${doc.estado}).`);
      }
      if (!doc.xml) throw new Error(`El documento folio ${doc.folio ?? '?'} no tiene XML.`);
      // Los documentos antiguos pueden haberse emitido antes de que una
      // validación fuera endurecida. Revalidar el receptor impide enviarlos
      // al SII con un XML que será rechazado y evita perder trazabilidad.
      resolveDatosReceptor(doc, doc.receptor || {});
      docs.push(doc);
    }

    const empresa = await requireEmpresa();
    const cert = loadCert(empresa);
    const firmante = rutEnvia(empresa, cert);
    const ambiente = empresa.ambiente;

    const { xml, esBoleta } = buildEnvio({
      dtes: docs.map(d => ({ tipoDte: d.tipoDte, dteXml: d.xml })),
      empresa,
      cert,
      rutEnvia: firmante
    });
    assertXmlSignatures(xml, cert.certPem);

    const xmlLatin1 = toLatin1Buffer(xml);
    const filename = `EnvioDTE_${empresa.rut}_${Date.now()}.xml`;

    // uploadEnvioDte/uploadEnvioBoleta parten el RUT por "-" para armar los
    // campos rutSender/dvSender; empresa.rut se guarda formateado con puntos
    // (ver EmpresaConfig) y el SII rechaza esos puntos (STATUS 6 en DTE,
    // HTTP 400 "RUT de la Empresa invalido" en boletas si no se limpia antes.
    const rutEmisorSii = normalizeRut(empresa.rut);
    if (!rutEmisorSii) throw new Error('El RUT de la empresa emisora no es válido.');

    let resultado;
    try {
      if (esBoleta) {
        const token = await sii.getTokenBoleta(ambiente, cert);
        resultado = await sii.uploadEnvioBoleta({ ambiente, token, rutEnvia: firmante, rutEmisor: rutEmisorSii, filename, xmlLatin1 });
      } else {
        const token = await sii.getToken(ambiente, cert);
        resultado = await sii.uploadEnvioDte({ ambiente, token, rutEnvia: firmante, rutEmisor: rutEmisorSii, filename, xmlLatin1 });
      }
    } catch (error) {
      // Si el SII rechaza el upload (o la respuesta queda ambigua), no se
      // permite reemitir ni reenviar automáticamente el mismo folio. Queda
      // una evidencia persistente para conciliación manual.
      await Promise.all(docs.map(doc => db.documentos.update(doc.id, {
        estado: 'error',
        estadoDetalle: `Envío SII no confirmado: ${error?.message || 'error desconocido'}`,
      })));
      throw error;
    }

    const actualizados = [];
    for (const doc of docs) {
      actualizados.push(await db.documentos.update(doc.id, {
        estado: 'enviado',
        trackId: resultado.trackId,
        estadoDetalle: null
      }));
    }
    return { trackId: resultado.trackId, documentos: actualizados, envioXml: xml };
  };

  const enviar = async (docIds) => {
    const ids = [...new Set((Array.isArray(docIds) ? docIds : [docIds])
      .map(Number)
      .filter(id => Number.isInteger(id) && id > 0))]
      .sort((a, b) => a - b);
    if (!ids.length) throw new Error('Indica al menos un documento para enviar al SII.');
    if (db.documentos.withEnvioLock) {
      return db.documentos.withEnvioLock(ids, () => enviarDocumentos(ids));
    }
    return enviarDocumentos(ids);
  };

  const consultarEstado = async (docId) => {
    const doc = await db.documentos.get(docId);
    if (!doc) throw new Error('Documento no encontrado.');
    if (!doc.trackId) throw new Error('El documento no ha sido enviado al SII.');

    const empresa = await requireEmpresa();
    const cert = loadCert(empresa);
    const ambiente = doc.ambiente || empresa.ambiente;

    const rutEmisorSii = normalizeRut(empresa.rut);
    let resultado;
    if (isBoleta(doc.tipoDte)) {
      const token = await sii.getTokenBoleta(ambiente, cert);
      resultado = await sii.consultarEstadoBoleta({ ambiente, token, rutEmisor: rutEmisorSii, trackId: doc.trackId });
    } else {
      const token = await sii.getToken(ambiente, cert);
      resultado = await sii.consultarEstadoEnvio({ ambiente, token, rutEmisor: rutEmisorSii, trackId: doc.trackId });
      if (requiereConsultaIndividualDte(resultado)
        && doc.folio && doc.fechaEmision && doc.receptor?.rut && doc.totales?.total !== undefined) {
        try {
          resultado.detalleDte = await sii.consultarEstadoDte({
            ambiente,
            token,
            rutConsultante: rutEnvia(empresa, cert),
            rutEmisor: rutEmisorSii,
            rutReceptor: normalizeRut(doc.receptor.rut),
            tipoDte: doc.tipoDte,
            folio: doc.folio,
            fechaEmision: doc.fechaEmision,
            monto: doc.totales.total
          });
        } catch (error) {
          resultado.detalleDteError = error.message;
        }
      }
    }

    const codigo = String(resultado.estado || '').toUpperCase();
    const estado = estadoDesdeRespuestaSii(
      estadoDesdeRespuestaSii(doc.estado, resultado),
      resultado.detalleDte
    );

    const resumen = resultado.resumen;
    const detalleResumen = resumen?.informados !== null && resumen?.informados !== undefined
      ? `informados=${resumen.informados}, aceptados=${resumen.aceptados ?? 0}, rechazados=${resumen.rechazados ?? 0}, reparos=${resumen.reparos ?? 0}`
      : null;
    const detalleIndividual = resultado.detalleDte
      ? [
        resultado.detalleDte.estado,
        resultado.detalleDte.glosa,
        resultado.detalleDte.errorGlosa
      ].filter(Boolean).join(' — ')
      : resultado.detalleDteError;
    const detallePartes = [codigo, resultado.glosa, detalleResumen, detalleIndividual].filter(Boolean);
    const detalle = [...new Set(detallePartes.flatMap(p => String(p).split(' — ')))].join(' — ');
    const actualizado = await db.documentos.update(docId, {
      estado,
      estadoDetalle: detalle || doc.estadoDetalle
    });
    return { documento: actualizado, sii: resultado };
  };

  const descargarXml = async (docId) => {
    const doc = await db.documentos.get(docId);
    if (!doc || !doc.xml) throw new Error('El documento no tiene XML generado (emítelo primero).');
    return {
      filename: `DTE_T${doc.tipoDte}_F${doc.folio}.xml`,
      buffer: toLatin1Buffer(`${XML_DECL}\n${doc.xml}`)
    };
  };

  return { getEmpresa, requireEmpresa, certInfo, saveCert, emitir, enviar, consultarEstado, descargarXml, certPath };
};
