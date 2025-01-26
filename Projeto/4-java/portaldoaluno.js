// Exemplo de interação com JavaScript
document.addEventListener('DOMContentLoaded', function() {
    const atividades = document.querySelectorAll('.atividades li');
    atividades.forEach(atividade => {
        atividade.addEventListener('click', function() {
            alert(`Atividade selecionada: ${this.textContent}`);
        });
    });
});