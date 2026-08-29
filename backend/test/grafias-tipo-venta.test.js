// Las grafias de tipo de venta se definian por separado en cinco modulos, con
// conjuntos distintos, de modo que el mismo filtro entregaba totales distintos
// segun la pantalla. Este test fija el catalogo unico para que no vuelva a
// divergir en silencio: cualquier modulo que agregue una grafia a mano y no al
// catalogo hace fallar el barrido del final.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  GRAFIAS_CONVENIO_MARCO,
  GRAFIAS_LICITACION,
  GRAFIAS_VENTA_DIRECTA,
  GRAFIAS_VENTA_SALA,
  LICITACION_MOJIBAKE,
  TIPO_VENTA_VALUES,
  TIPOS_VENTA_MOSTRADOR,
  grafiasDeTipoVenta,
  normalizeTipoVenta,
  tipoVentaFromSlug,
} from '../src/routes/ventas/estados-normalize.js'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const RUTAS = path.join(AQUI, '..', 'src', 'routes')

describe('catalogo de grafias de tipo de venta', () => {
  it('incluye la forma canonica y la legacy sin tilde', () => {
    expect(GRAFIAS_LICITACION).toContain('Licitación')
    expect(GRAFIAS_LICITACION).toContain('Licitacion')
  })

  // El mojibake existe realmente en la base: UTF-8 leido como latin1 en alguna
  // importacion. Hasta ahora solo el reporte de comisiones lo contemplaba, asi
  // que esas ordenes quedaban fuera del resto de las pantallas.
  it('incluye el mojibake heredado de la importacion', () => {
    expect(LICITACION_MOJIBAKE).toBe('LicitaciÃ³n')
    expect(GRAFIAS_LICITACION).toContain(LICITACION_MOJIBAKE)
  })

  it('cubre ambas capitalizaciones de convenio marco y venta sala', () => {
    expect(GRAFIAS_CONVENIO_MARCO).toEqual(expect.arrayContaining(['Convenio Marco', 'Convenio marco']))
    expect(GRAFIAS_VENTA_SALA).toEqual(expect.arrayContaining(['Venta Sala', 'Venta sala']))
    expect(GRAFIAS_VENTA_DIRECTA).toEqual(expect.arrayContaining(['Venta directa', 'Venta Directa']))
  })

  it('no repite valores, que en un IN serian ruido', () => {
    for (const grafias of [GRAFIAS_LICITACION, GRAFIAS_CONVENIO_MARCO, TIPOS_VENTA_MOSTRADOR]) {
      expect(new Set(grafias).size).toBe(grafias.length)
    }
  })
})

describe('agrupacion de venta de mostrador', () => {
  it('reune sala y directa', () => {
    expect(TIPOS_VENTA_MOSTRADOR).toEqual(expect.arrayContaining([
      ...GRAFIAS_VENTA_SALA,
      ...GRAFIAS_VENTA_DIRECTA,
    ]))
  })

  // Plastimar confirmo que 'Normal' es la venta simple, un tipo propio, no una
  // forma de escribir la venta de meson. Son 60 ordenes, todas sin pagar y de
  // los ultimos tres meses.
  it('no incluye Normal, que es la venta simple', () => {
    expect(TIPOS_VENTA_MOSTRADOR).not.toContain('Normal')
  })

  it('Normal se filtra por su propio tipo', () => {
    expect(grafiasDeTipoVenta('normal')).toEqual(['Normal'])
  })

  // Es una agrupacion de negocio, no de grafia: Convenio Marco es un tipo
  // distinto y no debe colarse aqui, como ocurria en matriz-ventas.
  it('no arrastra Convenio Marco', () => {
    for (const grafia of GRAFIAS_CONVENIO_MARCO) {
      expect(TIPOS_VENTA_MOSTRADOR).not.toContain(grafia)
    }
  })
})

describe('normalizeTipoVenta escribe siempre la forma canonica', () => {
  it('resuelve toda grafia de licitacion a la canonica', () => {
    for (const grafia of ['Licitación', 'Licitacion', 'licitacion', '  LICITACION  ']) {
      expect(normalizeTipoVenta(grafia)).toBe('Licitación')
    }
  })

  it('resuelve las capitalizaciones de convenio marco y venta sala', () => {
    expect(normalizeTipoVenta('Convenio marco')).toBe('Convenio Marco')
    expect(normalizeTipoVenta('venta sala')).toBe('Venta Sala')
  })

  it('devuelve null para un tipo desconocido, en vez de inventarlo', () => {
    expect(normalizeTipoVenta('Tipo Inventado')).toBeNull()
    expect(normalizeTipoVenta('')).toBeNull()
    expect(normalizeTipoVenta(null)).toBeNull()
  })
})

// Compra Agil se ofrecia en el selector al editar una venta pero no estaba en la
// validacion, de modo que guardar respondia 400. Trato Directo no existia en
// ninguna parte, asi que esas ventas quedaban mezcladas en Convenio Marco.
describe('tipos que faltaban en el catalogo', () => {
  it('acepta Compra Agil y Trato Directo', () => {
    expect(TIPO_VENTA_VALUES).toContain('Compra Ágil')
    expect(TIPO_VENTA_VALUES).toContain('Trato Directo')
    expect(normalizeTipoVenta('compra agil')).toBe('Compra Ágil')
    expect(normalizeTipoVenta('trato directo')).toBe('Trato Directo')
  })

  it('no los mete en la agrupacion de mostrador', () => {
    expect(TIPOS_VENTA_MOSTRADOR).not.toContain('Compra Ágil')
    expect(TIPOS_VENTA_MOSTRADOR).not.toContain('Trato Directo')
  })
})

// Los filtros de pantalla viajan como slug. Pasarlos crudos al `where` no
// coincide con ninguna fila; devolver {} deja la consulta sin filtro y muestra
// todo. Ambos fallan en silencio, en direcciones opuestas.
describe('resolucion de slugs de filtro', () => {
  it('resuelve el slug de cada tipo del catalogo', () => {
    for (const tipo of TIPO_VENTA_VALUES) {
      const slug = tipo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-')
      expect(tipoVentaFromSlug(slug)).toBe(tipo)
    }
  })

  it('devuelve null para un slug que no existe', () => {
    expect(tipoVentaFromSlug('no-existe')).toBeNull()
    expect(tipoVentaFromSlug('')).toBeNull()
  })

  it('entrega todas las grafias del tipo, no solo la canonica', () => {
    expect(grafiasDeTipoVenta('licitacion')).toEqual(expect.arrayContaining([...GRAFIAS_LICITACION]))
    expect(grafiasDeTipoVenta('convenio-marco')).toEqual(expect.arrayContaining([...GRAFIAS_CONVENIO_MARCO]))
  })

  it('un tipo sin grafias alternativas devuelve la canonica', () => {
    expect(grafiasDeTipoVenta('trato-directo')).toEqual(['Trato Directo'])
    expect(grafiasDeTipoVenta('compra-agil')).toEqual(['Compra Ágil'])
  })

  it('devuelve vacio si no lo reconoce, para que el llamador decida', () => {
    expect(grafiasDeTipoVenta('inventado')).toEqual([])
  })
})

describe('ningun modulo filtra por una sola grafia', () => {
  function archivosJs(dir) {
    const salida = []
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      const completo = path.join(dir, entrada.name)
      if (entrada.isDirectory()) salida.push(...archivosJs(completo))
      else if (entrada.name.endsWith('.js')) salida.push(completo)
    }
    return salida
  }

  // Un `where.tipo = 'Licitación'` deja fuera en silencio las ordenes escritas
  // por los importadores legacy. El filtro tiene que nombrar el catalogo.
  it('no quedan asignaciones de where.tipo con una grafia suelta', () => {
    const sospechoso = /(?:where\.tipo|ordenWhere\.tipo)\s*=\s*'(?:Licitaci|Convenio|Venta [Ss]ala|Venta [Dd]irecta)/
    const infractores = []
    for (const archivo of archivosJs(RUTAS)) {
      const src = fs.readFileSync(archivo, 'utf8')
      src.split('\n').forEach((linea, i) => {
        if (sospechoso.test(linea)) infractores.push(`${path.relative(RUTAS, archivo)}:${i + 1}`)
      })
    }
    expect(infractores).toEqual([])
  })
})
