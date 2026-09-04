// Interactividad compartida de los manuales de Marcha Blanca Plastimar.

document.addEventListener('DOMContentLoaded', () => {
  const header = document.querySelector('.doc-header')
  if (header && !document.querySelector('.doc-version-bar')) {
    const version = document.createElement('div')
    version.className = 'doc-version-bar'
    version.innerHTML = '<strong>Marcha Blanca · MB-1.1</strong><span>Revisado 04-09-2026 · Validar con la jefatura del módulo</span>'
    header.insertAdjacentElement('afterend', version)
  }

  let modal = document.getElementById('lightbox-modal')
  let previousFocus = null

  if (!modal) {
    modal = document.createElement('div')
    modal.id = 'lightbox-modal'
    modal.className = 'lightbox-modal'
    modal.setAttribute('role', 'dialog')
    modal.setAttribute('aria-modal', 'true')
    modal.setAttribute('aria-label', 'Vista ampliada de la captura')
    modal.setAttribute('aria-hidden', 'true')
    modal.innerHTML = `
      <button type="button" class="lightbox-close" title="Cerrar (Esc)" aria-label="Cerrar vista ampliada">&times;</button>
      <img class="lightbox-content" id="lightbox-img" src="" alt="">
      <div class="lightbox-caption-text" id="lightbox-caption"></div>
    `
    document.body.appendChild(modal)
  }

  const closeButton = modal.querySelector('.lightbox-close')
  const lightboxImage = modal.querySelector('#lightbox-img')
  const lightboxCaption = modal.querySelector('#lightbox-caption')

  const closeLightbox = () => {
    modal.classList.remove('active')
    modal.setAttribute('aria-hidden', 'true')
    document.body.classList.remove('lightbox-open')
    lightboxImage.removeAttribute('src')
    if (previousFocus) previousFocus.focus()
  }

  const openLightbox = container => {
    const image = container.querySelector('.screenshot-img')
    if (!image) return
    previousFocus = container
    const caption = container.closest('.screenshot-wrapper')?.querySelector('.screenshot-caption')?.textContent || image.alt
    lightboxImage.src = image.src
    lightboxImage.alt = image.alt || 'Captura ampliada'
    lightboxCaption.textContent = caption
    modal.classList.add('active')
    modal.setAttribute('aria-hidden', 'false')
    document.body.classList.add('lightbox-open')
    closeButton.focus()
  }

  closeButton.addEventListener('click', closeLightbox)
  modal.addEventListener('click', event => {
    if (event.target === modal) closeLightbox()
  })
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && modal.classList.contains('active')) closeLightbox()
  })

  document.querySelectorAll('.screenshot-container').forEach(container => {
    container.setAttribute('role', 'button')
    container.setAttribute('tabindex', '0')
    container.setAttribute('aria-label', 'Ampliar captura en pantalla completa')
    container.addEventListener('click', () => openLightbox(container))
    container.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        openLightbox(container)
      }
    })
  })

  document.querySelectorAll('.btn-print').forEach(button => {
    button.setAttribute('type', 'button')
    button.setAttribute('title', 'Abre el diálogo del navegador para imprimir o guardar como PDF')
    button.addEventListener('click', () => window.print())
  })
})
