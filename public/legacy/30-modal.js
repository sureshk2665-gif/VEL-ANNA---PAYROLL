/* ================= MODAL ================= */
function showModal(){ document.getElementById('overlay').classList.add('show'); }
function closeModal(){ document.getElementById('overlay').classList.remove('show'); document.getElementById('modalContent').classList.remove('modal-wide'); }
document.getElementById('overlay').addEventListener('click',e=>{ if(e.target.id==='overlay') closeModal(); });
