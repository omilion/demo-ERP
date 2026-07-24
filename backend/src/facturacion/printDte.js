// Representación impresa del DTE: HTML con timbre PDF417 según formato SII
// (recuadro rojo con RUT/tipo/folio, detalle, totales y timbre electrónico).

import bwipjs from 'bwip-js';
import { TIPOS_DTE } from './documento.js';
import { parseRecibidoDte } from './receptorDte.js';

const formatCLP = (value) => Number(value || 0).toLocaleString('es-CL');
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);

// El PDF417 se genera desde el TED en ISO-8859-1 (así lo leen los verificadores).
export const tedToPdf417DataUri = async (tedXml) => {
  const latin1Ted = Buffer.from(tedXml, 'latin1').toString('binary');
  const png = await bwipjs.toBuffer({
    bcid: 'pdf417',
    text: latin1Ted,
    columns: 14,
    eclevel: 5,
    scale: 2,
    binarytext: true
  });
  return `data:image/png;base64,${png.toString('base64')}`;
};

export const renderDteHtml = async ({ empresa, receptor, doc, totales, tedXml }) => {
  empresa = Object.fromEntries(Object.entries(empresa || {}).map(([key, value]) => [key, escapeHtml(value)]));
  receptor = Object.fromEntries(Object.entries(receptor || {}).map(([key, value]) => [key, escapeHtml(value)]));
  doc = { ...doc, items: (doc.items || []).map(item => Object.fromEntries(Object.entries(item).map(([key, value]) => [key, typeof value === 'string' ? escapeHtml(value) : value]))), referencias: (doc.referencias || []).map(ref => Object.fromEntries(Object.entries(ref).map(([key, value]) => [key, typeof value === 'string' ? escapeHtml(value) : value]))) };
  const timbre = await tedToPdf417DataUri(tedXml);
  const nombreTipo = (TIPOS_DTE[doc.tipoDte] || `DTE ${doc.tipoDte}`).toUpperCase();
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
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; padding: 24px; }
  .head { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
  .emisor h1 { font-size: 15px; margin-bottom: 4px; }
  .emisor p { line-height: 1.4; }
  .cuadro { border: 3px solid #c00; color: #c00; text-align: center; padding: 10px 18px; min-width: 230px; }
  .cuadro .rut { font-size: 15px; font-weight: bold; }
  .cuadro .tipo { font-size: 12px; font-weight: bold; margin: 6px 0; }
  .cuadro .folio { font-size: 14px; font-weight: bold; }
  .cuadro .sii { font-size: 10px; margin-top: 6px; color: #c00; }
  .receptor { border: 1px solid #999; border-radius: 4px; padding: 8px 10px; margin-bottom: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 2px 18px; }
  table.detalle { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  table.detalle th { background: #eee; border: 1px solid #999; padding: 4px 6px; text-align: left; }
  table.detalle td { border: 1px solid #ccc; padding: 4px 6px; vertical-align: top; }
  td.num, th.num { text-align: right; }
  .pie { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; }
  .timbre { text-align: center; }
  .timbre img { width: 260px; }
  .timbre p { font-size: 9px; margin-top: 2px; }
  table.totales { border-collapse: collapse; min-width: 220px; }
  table.totales td { padding: 3px 8px; border: 1px solid #ccc; }
  table.totales tr.total td { font-weight: bold; font-size: 13px; background: #eee; }
  table.refs { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 10px; }
  table.refs td, table.refs th { border: 1px solid #ccc; padding: 3px 6px; text-align: left; }
</style></head>
<body>
  <div class="head">
    <div class="emisor">
      <h1>${empresa.razonSocial || ''}</h1>
      <p>${empresa.giro || ''}</p>
      <p>${empresa.direccion || ''}${empresa.comuna ? `, ${empresa.comuna}` : ''}${empresa.ciudad ? `, ${empresa.ciudad}` : ''}</p>
    </div>
    <div class="cuadro">
      <div class="rut">R.U.T.: ${empresa.rut || ''}</div>
      <div class="tipo">${nombreTipo}</div>
      <div class="folio">N&deg; ${doc.folio ?? 'BORRADOR'}</div>
      <div class="sii">S.I.I. — ${empresa.ciudad || 'SANTIAGO'}</div>
    </div>
  </div>

  <div class="receptor">
    <span><strong>Señor(es):</strong> ${receptor.razonSocial || ''}</span>
    <span><strong>R.U.T.:</strong> ${receptor.rut || ''}</span>
    <span><strong>Giro:</strong> ${receptor.giro || ''}</span>
    <span><strong>Fecha emisión:</strong> ${doc.fechaEmision || ''}</span>
    <span><strong>Dirección:</strong> ${receptor.direccion || ''}${receptor.comuna ? `, ${receptor.comuna}` : ''}</span>
    <span><strong>Ciudad:</strong> ${receptor.ciudad || ''}</span>
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
