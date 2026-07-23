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
import { loadCertificate } from './firma.js';
import { parseCaf } from './caf.js';
import { buildDocumento, isBoleta, TIPOS_DTE } from './documento.js';
import { buildDte, buildEnvio } from './envio.js';
import { toLatin1Buffer, XML_DECL, normalizeRut, isValidRut, formatDate } from './xmlUtil.js';
import * as sii from './siiClient.js';

const ESTADOS_ACEPTADO = new Set(['EPR', 'DOK', 'SOK', 'EOK']);
const ESTADOS_RECHAZADO = new Set(['RCH', 'RFR', 'RSC', 'RCT', 'FAU', 'FNA']);

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
    const rut = normalizeRut(empresa.rutEnvia || cert.rutTitular);
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
    receptor.rut = normalizeRut(receptor.rut);
    if (!receptor.rut || !isValidRut(receptor.rut)) {
      throw new Error('El receptor no tiene un RUT válido.');
    }
    if (!receptor.razonSocial) throw new Error('El receptor no tiene razón social.');
    return receptor;
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
      resolved.push({
        ...ref,
        tipoDocRef: ref.tipoDocRef || String(referenced.tipoDte),
        folioRef: ref.folioRef || String(referenced.folio),
        fechaRef: ref.fechaRef || referenced.fechaEmision || formatDate()
      });
    }
    return resolved;
  };

  const emitir = async (docId) => {
    const doc = await db.documentos.get(docId);
    if (!doc) throw new Error('Documento no encontrado.');
    if (!['borrador', 'error'].includes(doc.estado)) {
      throw new Error(`El documento ya fue emitido (estado: ${doc.estado}).`);
    }
    if (!TIPOS_DTE[doc.tipoDte]) throw new Error(`Tipo de DTE no soportado: ${doc.tipoDte}.`);

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
    const referencias = await resolveReferencias(doc);

    const asignacion = await db.cafs.tomarFolio(doc.tipoDte, empresa.ambiente);
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

  const enviar = async (docIds) => {
    const docs = [];
    for (const idValue of docIds) {
      const doc = await db.documentos.get(idValue);
      if (!doc) throw new Error(`Documento ${idValue} no encontrado.`);
      if (doc.estado !== 'emitido' && doc.estado !== 'enviado') {
        throw new Error(`El documento folio ${doc.folio ?? '?'} no está emitido (estado: ${doc.estado}).`);
      }
      if (!doc.xml) throw new Error(`El documento folio ${doc.folio ?? '?'} no tiene XML.`);
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

    const xmlLatin1 = toLatin1Buffer(xml);
    const filename = `EnvioDTE_${empresa.rut}_${Date.now()}.xml`;

    // uploadEnvioDte/uploadEnvioBoleta parten el RUT por "-" para armar los
    // campos rutSender/dvSender; empresa.rut se guarda formateado con puntos
    // (ver EmpresaConfig) y el SII rechaza esos puntos (STATUS 6 en DTE,
    // HTTP 400 "RUT de la Empresa invalido" en boletas si no se limpia antes.
    const rutEmisorSii = normalizeRut(empresa.rut);
    if (!rutEmisorSii) throw new Error('El RUT de la empresa emisora no es válido.');

    let resultado;
    if (esBoleta) {
      const token = await sii.getTokenBoleta(ambiente, cert);
      resultado = await sii.uploadEnvioBoleta({ ambiente, token, rutEnvia: firmante, rutEmisor: rutEmisorSii, filename, xmlLatin1 });
    } else {
      const token = await sii.getToken(ambiente, cert);
      resultado = await sii.uploadEnvioDte({ ambiente, token, rutEnvia: firmante, rutEmisor: rutEmisorSii, filename, xmlLatin1 });
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
    }

    const codigo = String(resultado.estado || '').toUpperCase();
    let estado = doc.estado;
    if (ESTADOS_ACEPTADO.has(codigo)) estado = 'aceptado';
    else if (ESTADOS_RECHAZADO.has(codigo)) estado = 'rechazado';

    const detalle = [codigo, resultado.glosa].filter(Boolean).join(' — ');
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
