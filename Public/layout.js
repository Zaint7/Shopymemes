// =============================================
// LAYOUT: carga el navbar y el footer compartidos en cada página
// Requiere cart.js cargado antes (usa updateCartBadge)
// =============================================
async function loadPartial(placeholderId, url) {
  const placeholder = document.getElementById(placeholderId);
  if (!placeholder) return false;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    placeholder.innerHTML = await res.text();
    return true;
  } catch (err) {
    console.error(`No se pudo cargar ${url}`, err);
    return false;
  }
}

// ---------- Footer + botón "volver arriba" ----------
document.addEventListener('DOMContentLoaded', async () => {
  if (!(await loadPartial('footer-placeholder', 'footer.html'))) return;

  const backToTopBtn = document.getElementById('backToTop');
  if (!backToTopBtn) return;
  window.addEventListener('scroll', () => {
    backToTopBtn.classList.toggle('show', window.scrollY > 300);
  }, { passive: true });
  backToTopBtn.addEventListener('click', () => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  });
});

// ---------- Navbar ----------
document.addEventListener('DOMContentLoaded', async () => {
  await loadPartial('navbar-placeholder', 'navbar.html');

  // Marca el link de la página actual (accesibilidad: aria-current)
  const currentPage = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('#navMenu .nav-link').forEach(link => {
    if (link.getAttribute('href') === currentPage) link.setAttribute('aria-current', 'page');
  });

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
      searchDropdown.removeAttribute('inert');
      searchToggleBtn.setAttribute('aria-expanded', 'true');
      searchInput.focus();
    }

    function closeSearch() {
      searchDropdown.classList.remove('open');
      searchDropdown.setAttribute('inert', ''); // cerrado: no se puede llegar con Tab
      searchToggleBtn.setAttribute('aria-expanded', 'false');
    }

    // Escape cierra el buscador y devuelve el foco a la lupa
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeSearch();
        searchToggleBtn.focus();
      }
    });

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
      const query = searchInput.value.trim().slice(0, LIMITS.searchQuery);
      if (!query) return;
      window.location.href = `index.html?search=${encodeURIComponent(query)}`;
    });

    // Si esta página ya es un resultado de búsqueda, deja el buscador abierto con el término escrito
    const params = new URLSearchParams(window.location.search);
    const currentSearch = params.get('search');
    if (currentSearch) {
      searchInput.value = currentSearch.slice(0, LIMITS.searchQuery);
      openSearch();
    }
  }
});