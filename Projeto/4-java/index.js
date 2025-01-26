<script>
    document.addEventListener('DOMContentLoaded', function() {
        const menuIcon = document.getElementById('menu-icon');
        const dropdownMenu = document.getElementById('dropdown-menu');

        menuIcon.addEventListener('click', function() {
            dropdownMenu.classList.toggle('active');
        });

        // Fechar o dropdown ao clicar fora dele
        document.addEventListener('click', function(event) {
            if (!menuIcon.contains(event.target) && !dropdownMenu.contains(event.target)) {
                dropdownMenu.classList.remove('active');
            }
        });
    });
</script>