
// ========= القائمة الجانبية (للموبايل والتابلت) =========
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    sidebar.classList.toggle('open');
    sidebar.classList.toggle('active');
  }
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    if (window.innerWidth <= 992) {
      const sidebar = document.getElementById('sidebar');
      if (sidebar) {
        sidebar.classList.remove('open');
        sidebar.classList.remove('active');
      }
    }
  });
});
