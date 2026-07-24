document.addEventListener('DOMContentLoaded', () => {
  const menuIcon = document.getElementById('menu-icon');
  const dropdownMenu = document.getElementById('dropdown-menu');

  if (!menuIcon || !dropdownMenu) return;

  const setOpen = (open) => {
    dropdownMenu.classList.toggle('active', open);
    menuIcon.setAttribute('aria-expanded', String(open));
  };

  menuIcon.setAttribute('role', 'button');
  menuIcon.setAttribute('tabindex', '0');
  menuIcon.setAttribute('aria-haspopup', 'true');
  menuIcon.setAttribute('aria-expanded', 'false');
  menuIcon.setAttribute('aria-controls', 'dropdown-menu');

  menuIcon.addEventListener('click', (event) => {
    event.stopPropagation();
    setOpen(!dropdownMenu.classList.contains('active'));
  });

  menuIcon.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setOpen(!dropdownMenu.classList.contains('active'));
    }

    if (event.key === 'Escape') setOpen(false);
  });

  dropdownMenu.addEventListener('click', (event) => event.stopPropagation());
  document.addEventListener('click', () => setOpen(false));
});
