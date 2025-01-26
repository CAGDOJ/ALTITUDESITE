// Inicializar ícones Lucide
lucide.createIcons();

// Dados dos cursos
const cursos = [
    { id: 1, name: 'Matemática Básica', progress: 75 },
    { id: 2, name: 'Fundamentos de Física', progress: 60 },
    { id: 3, name: 'Introdução à Programação', progress: 90 }
];

// Elementos DOM
const darkModeToggle = document.getElementById('darkModeToggle');
const navButtons = document.querySelectorAll('.nav-button');
const contents = document.querySelectorAll('.content');
const cursosContainer = document.querySelector('.cursos');

// Dark Mode
function toggleDarkMode() {
    document.body.classList.toggle('dark');
    const icon = darkModeToggle.querySelector('i');
    if (document.body.classList.contains('dark')) {
        icon.setAttribute('data-lucide', 'sun');
    } else {
        icon.setAttribute('data-lucide', 'moon');
    }
    lucide.createIcons();
}

darkModeToggle.addEventListener('click', toggleDarkMode);

// Navegação
function switchTab(tabId) {
    // Atualizar botões
    navButtons.forEach(button => {
        button.classList.toggle('active', button.dataset.tab === tabId);
    });

    // Atualizar conteúdo
    contents.forEach(content => {
        content.classList.toggle('hidden', content.id !== tabId);
    });
}

navButtons.forEach(button => {
    button.addEventListener('click', () => switchTab(button.dataset.tab));
});

// Renderizar cursos
function renderCursos() {
    cursosContainer.innerHTML = cursos.map(curso => `
        <div class="curso">
            <div class="curso-header">
                <span>${curso.name}</span>
                <span>${curso.progress}%</span>
            </div>
            <div class="progress-bar">
                <div class="progress-value" style="width: ${curso.progress}%"></div>
            </div>
        </div>
    `).join('');
}

// Inicialização
renderCursos();
