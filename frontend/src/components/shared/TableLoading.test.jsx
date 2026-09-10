import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Table } from './index.jsx'

describe('Table loading state', () => {
  afterEach(cleanup)

  it('muestra el skeleton y oculta el mensaje vacío mientras carga', () => {
    render(
      <Table
        columns={[{ key: 'nombre', label: 'Nombre' }]}
        rows={[]}
        loading
        emptyMessage="No hay ventas registradas"
      />
    )

    expect(screen.getByRole('status', { name: 'Cargando datos' })).toBeTruthy()
    expect(screen.queryByText('No hay ventas registradas')).toBeNull()
  })
})
