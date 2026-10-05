// Shared modal. Legacy code fills #modalContent and calls showModal()/closeModal(); clicking the
// dark backdrop closes it (bound in public/legacy/30-modal.js).
export default function ModalOverlay() {
  return (
    <div className="overlay" id="overlay">
      <div className="modal" id="modalContent"></div>
    </div>
  );
}
