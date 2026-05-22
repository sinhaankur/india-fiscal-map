/* Country selector — switches between per-country pages. */
(function () {
  const sel = document.getElementById('country-select');
  if (!sel) return;
  const routes = { india: 'index.html', usa: 'usa.html' };
  sel.addEventListener('change', () => {
    const target = routes[sel.value];
    if (target) window.location.href = target;
  });
})();
