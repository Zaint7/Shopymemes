// =============================================
// LAYOUT: carga el navbar compartido en cada página
// Requiere cart.js cargado antes (usa updateCartBadge)
// =============================================
document.addEventListener('DOMContentLoaded', async () => {
  const placeholder = document.getElementById('navbar-placeholder');

  if (placeholder) {
    try {
      const res = await fetch('navbar.html');
      placeholder.innerHTML = await res.text();
    } catch (err) {
      console.error('No se pudo cargar navbar.html', err);
    }
  }

  // Ahora que el navbar existe en la página, pinta el número del carrito
  updateCartBadge();

  // ---------- Buscador desplegable, debajo del divisor de colores ----------
  const searchDropdown = document.getElementById('searchDropdown');
  const searchForm = document.getElementById('searchForm');
  const searchInput = document.getElementById('searchInput');
  const searchToggleBtn = document.getElementById('searchToggleBtn');

  if (searchDropdown && searchForm && searchInput && searchToggleBtn) {
    function openSearch() {
      searchDropdown.classList.add('open');
      searchInput.focus();
    }

    function closeSearch() {
      searchDropdown.classList.remove('open');
    }

    searchToggleBtn.addEventListener('click', () => {
      searchDropdown.classList.contains('open') ? closeSearch() : openSearch();
    });

    // Clic fuera de la barra desplegada: la cierra
    document.addEventListener('click', (e) => {
      if (!searchDropdown.classList.contains('open')) return;
      const clickedInside = searchDropdown.contains(e.target) || searchToggleBtn.contains(e.target);
      if (!clickedInside) closeSearch();
    });

    // Enter en el campo: busca y lleva a los resultados en index.html
    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const query = searchInput.value.trim();
      if (!query) return;
      window.location.href = `index.html?search=${encodeURIComponent(query)}`;
    });

    // Si esta página ya es un resultado de búsqueda, deja el buscador abierto con el término escrito
    const params = new URLSearchParams(window.location.search);
    const currentSearch = params.get('search');
    if (currentSearch) {
      searchInput.value = currentSearch;
      openSearch();
    }
  }
});