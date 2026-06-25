
// ========= القائمة الجانبية (للموبايل) =========
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('active');
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    if (window.innerWidth <= 992) {
      document.getElementById('sidebar').classList.remove('active');
    }
  });
});
