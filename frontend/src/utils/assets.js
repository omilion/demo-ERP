export const PRODUCT_PLACEHOLDER_IMAGE = '/legacy-img/no_foto_chica.jpg'

export function useProductPlaceholderOnError(event) {
  const img = event.currentTarget
  if (img.src.includes(PRODUCT_PLACEHOLDER_IMAGE)) {
    img.style.display = 'none'
    return
  }
  img.src = PRODUCT_PLACEHOLDER_IMAGE
}
