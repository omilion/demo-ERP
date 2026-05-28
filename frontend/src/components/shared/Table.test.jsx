import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { Table } from './index.jsx'

describe('Table', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('renders zoom controls, fixed column widths and cell titles', () => {
    render(
      <Table
        columns={[
          { key: 'nombre', label: 'Nombre' },
          { key: 'codigoInterno', label: 'Cod.' },
          { key: '_acc', label: '', render: () => 'Editar' },
        ]}
        rows={[
          { id: 1, nombre: 'Producto con nombre demasiado largo para una celda normal', codigoInterno: 'ABC-123' },
        ]}
        getRowKey={row => row.id}
      />
    )

    const range = screen.getByLabelText('Zoom de tabla')
    const table = document.querySelector('.data-table')
    const cols = table.querySelectorAll('col')

    expect(range.value).toBe('100')
    expect(table).toBeTruthy()
    expect(cols).toHaveLength(3)
    expect(cols[0].style.width).toBe('220px')
    expect(cols[1].style.width).toBe('124px')
    expect(cols[2].style.width).toBe('118px')
    expect(screen.getByTitle('Producto con nombre demasiado largo para una celda normal')).toBeTruthy()

    fireEvent.change(range, { target: { value: '80' } })

    expect(screen.getByText('80%')).toBeTruthy()
    expect(cols[0].style.width).toBe('176px')
    expect(window.localStorage.getItem('plastimar.tableZoom')).toBe('0.8')
  })
})
