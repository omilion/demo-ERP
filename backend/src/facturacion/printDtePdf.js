// Representación impresa del DTE en PDF real (ver en navegador, bajar,
// imprimir) — mismo contenido que printDte.js (HTML) pero dibujado a mano
// con pdfkit en vez de un motor de render de Chrome: sin binario pesado,
// seguro para un VPS chico de memoria/disco justos.
//
// El layout sigue a propósito el formato clásico del Portal de Facturación
// Gratuita del SII (recuadro rojo de tipo/folio, etiquetas azules, tablas de
// líneas negras, timbre + glosa abajo a la izquierda, totales en azul abajo
// a la derecha): es el formato que cualquier receptor chileno reconoce de
// inmediato como una factura electrónica válida.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import { TIPOS_DTE, IND_TRASLADO, TIPO_DESPACHO } from './documento.js';
import { tedToPdf417Png } from './printDte.js';
import { parseRecibidoDte } from './receptorDte.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_ICON = fs.readFileSync(path.join(__dirname, 'assets', 'plastimar-icon.png'));

const formatCLP = (value) => '$ ' + Number(value || 0).toLocaleString('es-CL');
const PAGE_MARGIN = 40;
const PAGE_WIDTH = 595.28; // A4 puntos
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const RED = '#cc0000';
const BLUE = '#0033a0';
const BLACK = '#000000';
const GRAY_TEXT = '#444444';

const FMA_PAGO = { 1: 'Contado', 2: 'Crédito', 3: 'Sin costo (entrega gratuita)' };

function drawRect(doc, x, y, w, h, opts = {}) {
  doc.rect(x, y, w, h);
  if (opts.fill) doc.fillAndStroke(opts.fill, opts.stroke || BLACK);
  else doc.strokeColor(opts.stroke || BLACK).lineWidth(opts.lineWidth || 1).stroke();
}

// Tabla simple dibujada a mano (pdfkit no trae tablas): cada fila se mide
// antes de dibujar para saber si entra en la pagina o hay que saltar.
function drawTableRow(doc, x, y, cols, values, opts = {}) {
  const rowHeight = opts.height || 16;
  let cx = x;
  for (let i = 0; i < cols.length; i++) {
    const col = cols[i];
    drawRect(doc, cx, y, col.width, rowHeight, { fill: opts.fill, stroke: opts.stroke || BLACK });
    doc
      .fillColor(opts.color || BLACK)
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

  // Membrete: isotipo + razon social a la izquierda; recuadro ROJO de
  // RUT/tipo de documento/folio a la derecha — la convencion visual estandar
  // que el SII usa en su propio portal de facturacion gratuita y que
  // cualquier receptor chileno reconoce de inmediato.
  const boxWidth = 190;
  const boxX = PAGE_MARGIN + CONTENT_WIDTH - boxWidth;
  const logoSize = 40;
  const textX = PAGE_MARGIN + logoSize + 10;
  const textWidth = boxX - textX - 16;
  pdf.image(LOGO_ICON, PAGE_MARGIN, y, { width: logoSize, height: logoSize });
  pdf.font('Helvetica-Bold').fontSize(13).fillColor(BLACK).text((empresa.razonSocial || '').toUpperCase(), textX, y, { width: textWidth });
  pdf.font('Helvetica').fontSize(8).fillColor(GRAY_TEXT);
  pdf.text(`Giro: ${empresa.giro || ''}`, textX, pdf.y + 2, { width: textWidth });
  const direccionLinea = [empresa.direccion, empresa.comuna, empresa.ciudad].filter(Boolean).join(', ');
  pdf.text(direccionLinea, textX, pdf.y + 1, { width: textWidth });
  const contactoLinea = [empresa.email ? `eMail: ${empresa.email}` : null, empresa.telefono ? `Teléfono: ${empresa.telefono}` : null].filter(Boolean).join('   ');
  if (contactoLinea) pdf.text(contactoLinea, textX, pdf.y + 1, { width: textWidth });
  pdf.text('Tipo de Venta: Del Giro', textX, pdf.y + 1, { width: textWidth });

  const boxHeight = 68;
  drawRect(pdf, boxX, y, boxWidth, boxHeight, { stroke: RED, lineWidth: 1.5 });
  pdf.fillColor(RED).font('Helvetica-Bold').fontSize(10).text(`R.U.T.: ${empresa.rut || ''}`, boxX, y + 8, { width: boxWidth, align: 'center' });
  pdf.fontSize(11).text(nombreTipo, boxX + 6, pdf.y + 6, { width: boxWidth - 12, align: 'center' });
  pdf.fontSize(12).text(`N° ${doc.folio ?? 'BORRADOR'}`, boxX, pdf.y + 4, { width: boxWidth, align: 'center' });
  pdf.font('Helvetica-Bold').fontSize(8).fillColor(RED).text(`S.I.I. — ${(empresa.ciudad || 'SANTIAGO').toUpperCase()}`, boxX, y + boxHeight + 4, { width: boxWidth, align: 'center' });

  y = PAGE_MARGIN + Math.max(logoSize, boxHeight) + 26;

  // Receptor: caja de borde negro, etiquetas en azul sin negrita — mismo
  // esquema que usa el SII en su portal (Señor(es)/R.U.T./Giro/Dirección/
  // Comuna/Ciudad).
  const esGuia = doc.tipoDte === 52;
  const motivoTraslado = esGuia ? (IND_TRASLADO[Number(doc.extra?.indTraslado)] || 'No informado') : '';
  const tipoDespachoTexto = esGuia ? (TIPO_DESPACHO[Number(doc.extra?.tipoDespacho)] || 'No informado') : '';
  const receptorHeight = esGuia ? 88 : 72;
  drawRect(pdf, PAGE_MARGIN, y, CONTENT_WIDTH, receptorHeight);
  const half = CONTENT_WIDTH / 2;
  const receptorLinea = (label, value, x, ry, opts = {}) => {
    pdf.font('Helvetica').fontSize(8).fillColor(BLUE).text(`${label} `, x + 8, ry, { width: 90, lineBreak: false });
    pdf.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(BLACK)
      .text(value || '', x + 8 + 90, ry - 0.5, { width: half - 16 - 90, lineBreak: false, ellipsis: true });
  };
  receptorLinea('SEÑOR(ES):', receptor.razonSocial, PAGE_MARGIN, y + 8);
  receptorLinea('FECHA EMISIÓN:', doc.fechaEmision, PAGE_MARGIN + half, y + 8);
  receptorLinea('R.U.T.:', receptor.rut, PAGE_MARGIN, y + 24);
  receptorLinea('GIRO:', receptor.giro, PAGE_MARGIN + half, y + 24);
  receptorLinea('DIRECCIÓN:', receptor.direccion, PAGE_MARGIN, y + 40);
  receptorLinea('COMUNA / CIUDAD:', [receptor.comuna, receptor.ciudad].filter(Boolean).join(' / '), PAGE_MARGIN + half, y + 40);
  receptorLinea('TIPO DE COMPRA:', 'Del Giro', PAGE_MARGIN, y + 56);
  if (esGuia) {
    receptorLinea('TIPO DE TRASLADO:', motivoTraslado, PAGE_MARGIN, y + 72);
    receptorLinea('TIPO DE DESPACHO:', tipoDespachoTexto, PAGE_MARGIN + half, y + 72);
  }

  y += receptorHeight + 16;

  // Detalle: columnas al estilo SII (Codigo/Descripcion/Cantidad/Precio/
  // %Impto Adic./%Desc./Valor). Plastimar no vende categorias con impuesto
  // adicional (alcoholes/tabaco/lujo de la Ley de IVA) asi que esa columna
  // siempre queda en blanco — se mantiene por formato, no por dato real.
  const cols = [
    { width: 48, align: 'left' },
    { width: CONTENT_WIDTH - 48 - 38 - 60 - 42 - 38 - 72, align: 'left' },
    { width: 38, align: 'right' },
    { width: 60, align: 'right' },
    { width: 42, align: 'right' },
    { width: 38, align: 'right' },
    { width: 72, align: 'right' },
  ];
  const headers = ['Código', 'Descripción', 'Cantidad', 'Precio', '%Imp.Adic.', '%Desc.', 'Valor'];
  y += drawTableRow(pdf, PAGE_MARGIN, y, cols, headers, { color: BLUE, fontSize: 7.5 });

  const bottomLimit = pdf.page.height - PAGE_MARGIN - 110; // deja espacio para timbre/totales
  items.forEach((item) => {
    if (y > bottomLimit) {
      pdf.addPage();
      y = PAGE_MARGIN;
      y += drawTableRow(pdf, PAGE_MARGIN, y, cols, headers, { color: BLUE, fontSize: 7.5 });
    }
    const bruto = Math.round((item.cantidad || 1) * (item.precio || 0));
    const monto = item.precio ? formatCLP(bruto - Math.round(item.descuentoMonto || 0)) : '';
    const pctDesc = item.descuentoMonto && bruto ? `${((item.descuentoMonto / bruto) * 100).toFixed(1)}%` : '';
    y += drawTableRow(pdf, PAGE_MARGIN, y, cols, [
      item.codigo || '-',
      item.nombre || '',
      String(item.cantidad ?? 1),
      item.precio ? formatCLP(item.precio) : '',
      '-',
      pctDesc,
      monto,
    ], { fontSize: 8 });
    // Descripcion extendida (DscItem): licitaciones publicas/FNDR/Mineduc/Serviu
    // piden pegar el nombre del proyecto o concurso completo. drawTableRow no
    // hace wrap (una linea con ellipsis), asi que se imprime aparte debajo del
    // nombre, con wrap real, dentro del ancho de la columna Descripcion.
    if (item.descripcion) {
      const detailX = PAGE_MARGIN + cols[0].width;
      const detailWidth = cols[1].width - 4;
      pdf.font('Helvetica').fontSize(7);
      const descHeight = pdf.heightOfString(item.descripcion, { width: detailWidth, lineGap: 1 });
      if (y + descHeight + 6 > bottomLimit) { pdf.addPage(); y = PAGE_MARGIN; }
      pdf.fillColor(GRAY_TEXT).text(item.descripcion, detailX, y + 2, { width: detailWidth, lineGap: 1 });
      pdf.fillColor(BLACK);
      y += descHeight + 6;
    }
  });

  y += 4;
  const formaPagoTexto = FMA_PAGO[Number(doc.extra?.formaPago)] || FMA_PAGO[1];
  pdf.font('Helvetica').fontSize(8).fillColor(BLUE).text('FORMA DE PAGO: ', PAGE_MARGIN, y, { continued: true });
  pdf.fillColor(BLACK).text(formaPagoTexto);
  y = pdf.y + 10;

  // Referencias
  if (referencias.length) {
    const refCols = [
      { width: 110, align: 'left' },
      { width: 80, align: 'left' },
      { width: 90, align: 'left' },
      { width: CONTENT_WIDTH - 110 - 80 - 90, align: 'left' },
    ];
    y += drawTableRow(pdf, PAGE_MARGIN, y, refCols, ['Doc. Ref.', 'Folio', 'Fecha', 'Razón'], { color: BLUE, fontSize: 8 });
    for (const ref of referencias) {
      if (y > bottomLimit) { pdf.addPage(); y = PAGE_MARGIN; }
      y += drawTableRow(pdf, PAGE_MARGIN, y, refCols, [ref.tipoDocRef || ref.codRef || '', ref.folioRef || '', ref.fechaRef || '', ref.razon || ''], { fontSize: 8 });
    }
    y += 10;
  }

  // Pie: timbre PDF417 + glosa legal a la izquierda, totales en azul a la
  // derecha — igual que el formato clasico del SII.
  if (y > bottomLimit + 20) { pdf.addPage(); y = PAGE_MARGIN; }
  const timbreWidth = 190;
  // El PDF417 no es cuadrado: hay que medir el alto real de la imagen antes
  // de escribir debajo, si no el texto queda encima del codigo de barras
  // (altura variable segun el largo del TED, no es un ratio fijo).
  const timbreImg = pdf.openImage(timbrePng);
  const timbreHeight = timbreWidth * (timbreImg.height / timbreImg.width);
  pdf.image(timbrePng, PAGE_MARGIN, y, { width: timbreWidth });
  const nroResol = empresa.nroResol ?? 0;
  const anioResol = empresa.fchResol ? String(empresa.fchResol).slice(0, 4) : '';
  pdf.font('Helvetica').fontSize(7).fillColor(BLACK)
    .text('Timbre Electrónico SII', PAGE_MARGIN, y + timbreHeight + 6, { width: timbreWidth, align: 'center' })
    .text(`Res. ${nroResol} de ${anioResol} — Verifique documento: www.sii.cl`, PAGE_MARGIN, pdf.y, { width: timbreWidth, align: 'center' });

  const totalesRows = [
    totales.neto !== null && totales.neto !== undefined ? ['MONTO NETO', formatCLP(totales.neto)] : null,
    totales.exento ? ['MONTO EXENTO', formatCLP(totales.exento)] : null,
    totales.iva ? [`I.V.A. ${totales.tasaIva}%`, formatCLP(totales.iva)] : null,
    ['IMPUESTO ADICIONAL', formatCLP(0)],
    ['TOTAL', formatCLP(totales.total)],
  ].filter(Boolean);
  const totalesWidth = 230;
  const totalesX = PAGE_MARGIN + CONTENT_WIDTH - totalesWidth;
  const totalesCols = [{ width: totalesWidth * 0.55, align: 'left' }, { width: totalesWidth * 0.45, align: 'right' }];
  let ty = y;
  totalesRows.forEach(([label, value], i) => {
    const isTotal = i === totalesRows.length - 1;
    ty += drawTableRow(pdf, totalesX, ty, totalesCols, [label, value], {
      color: isTotal ? BLACK : BLUE,
      fontSize: isTotal ? 10 : 8,
      height: isTotal ? 20 : 16,
    });
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
