// Representación impresa del DTE en PDF real (ver en navegador, bajar,
// imprimir) — mismo contenido que printDte.js (HTML) pero dibujado a mano
// con pdfkit en vez de un motor de render de Chrome: sin binario pesado,
// seguro para un VPS chico de memoria/disco justos.

import PDFDocument from 'pdfkit';
import { TIPOS_DTE } from './documento.js';
import { tedToPdf417Png } from './printDte.js';
import { parseRecibidoDte } from './receptorDte.js';

const formatCLP = (value) => '$ ' + Number(value || 0).toLocaleString('es-CL');
const PAGE_MARGIN = 40;
const PAGE_WIDTH = 595.28; // A4 puntos
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const RED = '#cc0000';
const GRAY_BORDER = '#999999';
const GRAY_FILL = '#eeeeee';

function drawRect(doc, x, y, w, h, opts = {}) {
  doc.rect(x, y, w, h);
  if (opts.fill) doc.fillAndStroke(opts.fill, opts.stroke || GRAY_BORDER);
  else doc.strokeColor(opts.stroke || GRAY_BORDER).lineWidth(opts.lineWidth || 1).stroke();
}

// Tabla simple dibujada a mano (pdfkit no trae tablas): cada fila se mide
// antes de dibujar para saber si entra en la pagina o hay que saltar.
function drawTableRow(doc, x, y, cols, values, opts = {}) {
  const rowHeight = opts.height || 16;
  let cx = x;
  for (let i = 0; i < cols.length; i++) {
    const col = cols[i];
    drawRect(doc, cx, y, col.width, rowHeight, { fill: opts.fill });
    doc
      .fillColor('#111111')
      .font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(opts.fontSize || 8)
      .text(String(values[i] ?? ''), cx + 4, y + rowHeight / 2 - (opts.fontSize || 8) / 2, {
        width: col.width - 8,
        align: col.align || 'left',
        lineBreak: false,
        ellipsis: true,
      });
    cx += col.width;
  }
  return rowHeight;
}

export const renderDtePdf = async ({ empresa = {}, receptor = {}, doc = {}, totales = {}, tedXml }) => {
  const timbrePng = await tedToPdf417Png(tedXml);
  const nombreTipo = (TIPOS_DTE[doc.tipoDte] || `DTE ${doc.tipoDte}`).toUpperCase();
  const items = doc.items || [];
  const referencias = doc.referencias || [];

  const pdf = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN, bufferPages: true });
  const chunks = [];
  pdf.on('data', chunk => chunks.push(chunk));
  const done = new Promise((resolve, reject) => {
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
  });

  let y = PAGE_MARGIN;

  // Encabezado: emisor a la izquierda, recuadro rojo folio/tipo a la derecha
  const boxWidth = 200;
  const boxX = PAGE_MARGIN + CONTENT_WIDTH - boxWidth;
  pdf.font('Helvetica-Bold').fontSize(13).fillColor('#111111').text(empresa.razonSocial || '', PAGE_MARGIN, y, { width: boxWidth - 20 });
  pdf.font('Helvetica').fontSize(9);
  const direccionLinea = [empresa.direccion, empresa.comuna, empresa.ciudad].filter(Boolean).join(', ');
  pdf.text(empresa.giro || '', PAGE_MARGIN, pdf.y + 2, { width: boxWidth - 20 });
  pdf.text(direccionLinea, PAGE_MARGIN, pdf.y + 1, { width: boxWidth - 20 });

  const boxHeight = 70;
  drawRect(pdf, boxX, y, boxWidth, boxHeight, { stroke: RED, lineWidth: 1.5 });
  pdf.fillColor(RED).font('Helvetica-Bold').fontSize(11).text(`R.U.T.: ${empresa.rut || ''}`, boxX, y + 8, { width: boxWidth, align: 'center' });
  pdf.fontSize(10).text(nombreTipo, boxX, pdf.y + 4, { width: boxWidth, align: 'center' });
  pdf.fontSize(11).text(`N° ${doc.folio ?? 'BORRADOR'}`, boxX, pdf.y + 2, { width: boxWidth, align: 'center' });
  pdf.font('Helvetica').fontSize(8).text(`S.I.I. — ${empresa.ciudad || 'SANTIAGO'}`, boxX, pdf.y + 4, { width: boxWidth, align: 'center' });

  y = PAGE_MARGIN + boxHeight + 14;

  // Receptor
  const receptorHeight = 56;
  drawRect(pdf, PAGE_MARGIN, y, CONTENT_WIDTH, receptorHeight);
  pdf.fillColor('#111111').font('Helvetica').fontSize(9);
  const half = CONTENT_WIDTH / 2;
  const receptorLinea = (label, value, x, ry) => pdf.text(`${label} ${value || ''}`, x + 8, ry, { width: half - 16, lineBreak: false, ellipsis: true });
  receptorLinea('Señor(es):', receptor.razonSocial, PAGE_MARGIN, y + 6);
  receptorLinea('R.U.T.:', receptor.rut, PAGE_MARGIN + half, y + 6);
  receptorLinea('Giro:', receptor.giro, PAGE_MARGIN, y + 22);
  receptorLinea('Fecha emisión:', doc.fechaEmision, PAGE_MARGIN + half, y + 22);
  receptorLinea('Dirección:', [receptor.direccion, receptor.comuna].filter(Boolean).join(', '), PAGE_MARGIN, y + 38);
  receptorLinea('Ciudad:', receptor.ciudad, PAGE_MARGIN + half, y + 38);

  y += receptorHeight + 14;

  // Detalle
  const cols = [
    { width: 24, align: 'left' },
    { width: CONTENT_WIDTH - 24 - 40 - 50 - 70 - 80, align: 'left' },
    { width: 40, align: 'right' },
    { width: 50, align: 'right' },
    { width: 70, align: 'right' },
    { width: 80, align: 'right' },
  ];
  const headers = ['#', 'Detalle', 'Cant.', 'Unidad', 'P. Unitario', 'Monto'];
  y += drawTableRow(pdf, PAGE_MARGIN, y, cols, headers, { fill: GRAY_FILL, bold: true, fontSize: 8 });

  const bottomLimit = pdf.page.height - PAGE_MARGIN - 90; // deja espacio para timbre/totales
  items.forEach((item, i) => {
    if (y > bottomLimit) {
      pdf.addPage();
      y = PAGE_MARGIN;
      y += drawTableRow(pdf, PAGE_MARGIN, y, cols, headers, { fill: GRAY_FILL, bold: true, fontSize: 8 });
    }
    const monto = item.precio ? formatCLP(Math.round((item.cantidad || 1) * item.precio) - Math.round(item.descuentoMonto || 0)) : '';
    y += drawTableRow(pdf, PAGE_MARGIN, y, cols, [
      String(i + 1),
      item.nombre || '',
      String(item.cantidad ?? 1),
      item.unidad || '',
      item.precio ? formatCLP(item.precio) : '',
      monto,
    ], { fontSize: 8 });
  });

  y += 10;

  // Referencias
  if (referencias.length) {
    const refCols = [
      { width: 110, align: 'left' },
      { width: 80, align: 'left' },
      { width: 90, align: 'left' },
      { width: CONTENT_WIDTH - 110 - 80 - 90, align: 'left' },
    ];
    y += drawTableRow(pdf, PAGE_MARGIN, y, refCols, ['Doc. Ref.', 'Folio', 'Fecha', 'Razón'], { fill: GRAY_FILL, bold: true, fontSize: 8 });
    for (const ref of referencias) {
      if (y > bottomLimit) { pdf.addPage(); y = PAGE_MARGIN; }
      y += drawTableRow(pdf, PAGE_MARGIN, y, refCols, [ref.tipoDocRef || ref.codRef || '', ref.folioRef || '', ref.fechaRef || '', ref.razon || ''], { fontSize: 8 });
    }
    y += 10;
  }

  // Pie: timbre a la izquierda, totales a la derecha
  if (y > bottomLimit + 20) { pdf.addPage(); y = PAGE_MARGIN; }
  const timbreWidth = 200;
  pdf.image(timbrePng, PAGE_MARGIN, y, { width: timbreWidth });
  const nroResol = empresa.nroResol ?? 0;
  const anioResol = empresa.fchResol ? String(empresa.fchResol).slice(0, 4) : '';
  pdf.font('Helvetica').fontSize(7).fillColor('#111111')
    .text('Timbre Electrónico SII', PAGE_MARGIN, y + timbreWidth * 0.32 + 6, { width: timbreWidth, align: 'center' })
    .text(`Res. ${nroResol} de ${anioResol} — Verifique documento: www.sii.cl`, PAGE_MARGIN, pdf.y, { width: timbreWidth, align: 'center' });

  const totalesRows = [
    totales.neto !== null && totales.neto !== undefined ? ['Neto', formatCLP(totales.neto)] : null,
    totales.exento ? ['Exento', formatCLP(totales.exento)] : null,
    totales.iva ? [`IVA ${totales.tasaIva}%`, formatCLP(totales.iva)] : null,
    ['TOTAL', formatCLP(totales.total)],
  ].filter(Boolean);
  const totalesWidth = 220;
  const totalesX = PAGE_MARGIN + CONTENT_WIDTH - totalesWidth;
  const totalesCols = [{ width: totalesWidth * 0.5, align: 'left' }, { width: totalesWidth * 0.5, align: 'right' }];
  let ty = y;
  totalesRows.forEach(([label, value], i) => {
    const isTotal = i === totalesRows.length - 1;
    ty += drawTableRow(pdf, totalesX, ty, totalesCols, [label, value], { fill: isTotal ? GRAY_FILL : undefined, bold: isTotal, fontSize: isTotal ? 10 : 8, height: isTotal ? 20 : 16 });
  });

  pdf.end();
  return done;
};

// Un DTE recibido se imprime con el mismo layout/timbre; se vuelve a parsear
// desde su XML inmutable para que la vista no dependa de campos editables.
export const renderDteRecibidoPdf = async (recibido) => {
  const parsed = parseRecibidoDte(recibido.xml);
  if (!parsed.tedXml) throw new Error('El DTE recibido no contiene TED; no es posible generar un PDF fiel.');
  return renderDtePdf({ empresa: parsed.emisor, receptor: parsed.receptor, doc: parsed, totales: parsed.totales, tedXml: parsed.tedXml });
};
