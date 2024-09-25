<script>
// Seleciona o botão de menu e o menu móvel
const menuToggle = document.querySelector('.menu-toggle');
const mobileMenu = document.querySelector('.mobile-menu');

// Adiciona um evento de clique ao botão de menu
menuToggle.addEventListener('click', () => {
    // Alterna a classe 'active' no menu móvel
    mobileMenu.classList.toggle('active');
});
</script>