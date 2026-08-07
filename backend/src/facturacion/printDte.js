// Representación impresa del DTE: HTML con timbre PDF417 según formato SII
// (recuadro rojo con RUT/tipo/folio, detalle, totales y timbre electrónico).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bwipjs from 'bwip-js';
import { TIPOS_DTE, IND_TRASLADO, TIPO_DESPACHO } from './documento.js';
import { parseRecibidoDte } from './receptorDte.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Mismo isotipo recortado que usa printDtePdf.js (el logo original trae el
// wordmark en blanco, pensado para fondo oscuro — no sirve sobre hoja blanca).
const LOGO_ICON_DATA_URI = `data:image/png;base64,${fs.readFileSync(path.join(__dirname, 'assets', 'plastimar-icon.png')).toString('base64')}`;

const formatCLP = (value) => Number(value || 0).toLocaleString('es-CL');
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);

// El PDF417 se genera desde el TED en ISO-8859-1 (así lo leen los verificadores).
export const tedToPdf417Png = async (tedXml) => {
  const latin1Ted = Buffer.from(tedXml, 'latin1').toString('binary');
  return bwipjs.toBuffer({
    bcid: 'pdf417',
    text: latin1Ted,
    columns: 14,
    eclevel: 5,
    scale: 2,
    binarytext: true
  });
};

export const tedToPdf417DataUri = async (tedXml) => {
  const png = await tedToPdf417Png(tedXml);
  return `data:image/png;base64,${png.toString('base64')}`;
};

export const renderDteHtml = async ({ empresa, receptor, doc, totales, tedXml }) => {
  empresa = Object.fromEntries(Object.entries(empresa || {}).map(([key, value]) => [key, escapeHtml(value)]));
  receptor = Object.fromEntries(Object.entries(receptor || {}).map(([key, value]) => [key, escapeHtml(value)]));
  doc = { ...doc, items: (doc.items || []).map(item => Object.fromEntries(Object.entries(item).map(([key, value]) => [key, typeof value === 'string' ? escapeHtml(value) : value]))), referencias: (doc.referencias || []).map(ref => Object.fromEntries(Object.entries(ref).map(([key, value]) => [key, typeof value === 'string' ? escapeHtml(value) : value]))) };
  const timbre = await tedToPdf417DataUri(tedXml);
  const nombreTipo = (TIPOS_DTE[doc.tipoDte] || `DTE ${doc.tipoDte}`).toUpperCase();
  // Guía de despacho (52): el motivo de traslado no se mostraba en ningun
  // lado de la vista — solo quedaba en el XML. Se agrega explicito en la
  // cabecera, en negrita.
  const esGuia = doc.tipoDte === 52;
  const motivoTraslado = esGuia ? (IND_TRASLADO[Number(doc.extra?.indTraslado)] || 'No informado') : '';
  const tipoDespachoTexto = esGuia ? (TIPO_DESPACHO[Number(doc.extra?.tipoDespacho)] || 'No informado') : '';
  const filas = (doc.items || []).map((item, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${item.nombre}${item.descripcion ? `<br><small>${item.descripcion}</small>` : ''}</td>
      <td class="num">${item.cantidad ?? 1}</td>
      <td>${item.unidad || ''}</td>
      <td class="num">${item.precio ? formatCLP(item.precio) : ''}</td>
      <td class="num">${item.precio ? formatCLP(Math.round((item.cantidad || 1) * item.precio) - Math.round(item.descuentoMonto || 0)) : ''}</td>
    </tr>`).join('');

  const referencias = (doc.referencias || []).map(ref => `
    <tr><td>${ref.tipoDocRef || ref.codRef || ''}</td><td>${ref.folioRef || ''}</td><td>${ref.fechaRef || ''}</td><td>${ref.razon || ''}</td></tr>`).join('');

  const totalesHtml = [
    totales.neto !== null && totales.neto !== undefined ? `<tr><td>Neto</td><td class="num">$ ${formatCLP(totales.neto)}</td></tr>` : '',
    totales.exento ? `<tr><td>Exento</td><td class="num">$ ${formatCLP(totales.exento)}</td></tr>` : '',
    totales.iva ? `<tr><td>IVA ${totales.tasaIva}%</td><td class="num">$ ${formatCLP(totales.iva)}</td></tr>` : '',
    `<tr class="total"><td>TOTAL</td><td class="num">$ ${formatCLP(totales.total)}</td></tr>`
  ].join('');

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<style>
  :root { --brand: #6B21D6; --brand-tint: #F1EAFB; --ink: #1A1A1A; --gray: #5B5B5B; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: var(--ink); padding: 24px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding-bottom: 12px; border-bottom: 2px solid var(--brand); margin-bottom: 14px; }
  .emisor { display: flex; gap: 12px; align-items: center; }
  .emisor img { width: 40px; height: 40px; flex-shrink: 0; }
  .emisor h1 { font-size: 15px; margin-bottom: 4px; letter-spacing: 0.2px; }
  .emisor p { line-height: 1.4; color: var(--gray); }
  .cuadro { border: 3px solid #c00; color: #c00; text-align: center; padding: 10px 18px; min-width: 230px; }
  .cuadro .rut { font-size: 15px; font-weight: bold; }
  .cuadro .tipo { font-size: 12px; font-weight: bold; margin: 6px 0; }
  .cuadro .folio { font-size: 14px; font-weight: bold; }
  .cuadro .sii { font-size: 10px; margin-top: 6px; color: #c00; }
  .receptor { position: relative; border: 1px solid #ccc; border-top: 3px solid var(--brand); border-radius: 4px; padding: 12px 10px 8px; margin: 18px 0 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 2px 18px; }
  .receptor .eyebrow { position: absolute; top: -9px; left: 8px; background: #fff; padding: 0 5px; font-size: 8px; font-weight: bold; letter-spacing: 0.5px; color: var(--brand); }
  .receptor .motivo-guia { font-weight: bold; color: var(--brand); }
  table.detalle { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  table.detalle th { background: var(--brand-tint); color: var(--brand); border: 1px solid #ddd; padding: 5px 6px; text-align: left; text-transform: uppercase; font-size: 9px; letter-spacing: 0.3px; }
  table.detalle td { border: 1px solid #ddd; padding: 4px 6px; vertical-align: top; }
  table.detalle td small { color: var(--gray); }
  td.num, th.num { text-align: right; }
  .pie { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; padding-top: 12px; border-top: 1px solid var(--brand-tint); }
  .timbre { text-align: center; }
  .timbre img { width: 260px; }
  .timbre p { font-size: 9px; margin-top: 2px; color: var(--gray); }
  table.totales { border-collapse: collapse; min-width: 220px; }
  table.totales td { padding: 4px 8px; border: 1px solid #ddd; }
  table.totales tr.total td { font-weight: bold; font-size: 13px; background: var(--brand); color: #fff; border-color: var(--brand); }
  table.refs { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 10px; }
  table.refs th { background: var(--brand-tint); color: var(--brand); text-transform: uppercase; font-size: 9px; letter-spacing: 0.3px; }
  table.refs td, table.refs th { border: 1px solid #ddd; padding: 3px 6px; text-align: left; }
</style></head>
<body>
  <div class="head">
    <div class="emisor">
      <img src="${LOGO_ICON_DATA_URI}" alt="Plastimar">
      <div>
        <h1>${(empresa.razonSocial || '').toUpperCase()}</h1>
        <p>${empresa.giro || ''}</p>
        <p>${empresa.direccion || ''}${empresa.comuna ? `, ${empresa.comuna}` : ''}${empresa.ciudad ? `, ${empresa.ciudad}` : ''}</p>
      </div>
    </div>
    <div class="cuadro">
      <div class="rut">R.U.T.: ${empresa.rut || ''}</div>
      <div class="tipo">${nombreTipo}</div>
      <div class="folio">N&deg; ${doc.folio ?? 'BORRADOR'}</div>
      <div class="sii">S.I.I. — ${empresa.ciudad || 'SANTIAGO'}</div>
    </div>
  </div>

  <div class="receptor">
    <span class="eyebrow">RECEPTOR</span>
    <span><strong>Señor(es):</strong> ${receptor.razonSocial || ''}</span>
    <span><strong>R.U.T.:</strong> ${receptor.rut || ''}</span>
    <span><strong>Giro:</strong> ${receptor.giro || ''}</span>
    <span><strong>Fecha emisión:</strong> ${doc.fechaEmision || ''}</span>
    <span><strong>Dirección:</strong> ${receptor.direccion || ''}${receptor.comuna ? `, ${receptor.comuna}` : ''}</span>
    <span><strong>Ciudad:</strong> ${receptor.ciudad || ''}</span>
    ${esGuia ? `<span class="motivo-guia"><strong>Tipo de Traslado:</strong> ${motivoTraslado}</span><span class="motivo-guia"><strong>Tipo de Despacho:</strong> ${tipoDespachoTexto}</span>` : ''}
  </div>

  <table class="detalle">
    <thead><tr><th>#</th><th>Detalle</th><th class="num">Cant.</th><th>Unidad</th><th class="num">P. Unitario</th><th class="num">Monto</th></tr></thead>
    <tbody>${filas}</tbody>
  </table>

  ${referencias ? `<table class="refs"><thead><tr><th>Doc. Ref.</th><th>Folio</th><th>Fecha</th><th>Razón</th></tr></thead><tbody>${referencias}</tbody></table>` : ''}

  <div class="pie">
    <div class="timbre">
      <img src="${timbre}" alt="Timbre Electrónico SII">
      <p>Timbre Electrónico SII</p>
      <p>Res. ${empresa.nroResol ?? 0} de ${empresa.fchResol ? String(empresa.fchResol).slice(0, 4) : ''} — Verifique documento: www.sii.cl</p>
    </div>
    <table class="totales"><tbody>${totalesHtml}</tbody></table>
  </div>
</body></html>`;
};

// Un DTE recibido se imprime con el mismo layout/timbre; se vuelve a parsear
// desde su XML inmutable para que la vista no dependa de campos editables.
export const renderDteRecibidoHtml = async (recibido) => {
  const parsed = parseRecibidoDte(recibido.xml)
  if (!parsed.tedXml) throw new Error('El DTE recibido no contiene TED; no es posible mostrar un visor fiel.')
  return renderDteHtml({ empresa: parsed.emisor, receptor: parsed.receptor, doc: parsed, totales: parsed.totales, tedXml: parsed.tedXml })
}
