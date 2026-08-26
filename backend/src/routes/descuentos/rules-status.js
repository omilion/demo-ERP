export function discountRulesEnabled() {
  return process.env.DESCUENTOS_REGLAS_ENABLED !== 'false'
}

export function discountRulesDisabledResponse() {
  return {
    code: 'DESCUENTOS_REGLAS_DESHABILITADOS',
    error: 'Los descuentos con reglas están temporalmente deshabilitados por administración. No se aplicó ningún descuento; contacta a un administrador comercial.',
  }
}
