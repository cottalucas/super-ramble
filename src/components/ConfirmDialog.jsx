// Shared delete confirmation. The destructive action is the one loud control;
// Cancel stays quiet. See docs/design-system.md.
export default function ConfirmDialog({ title, message, confirmLabel = 'Delete', onConfirm, onCancel }) {
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal confirm-modal" role="alertdialog" aria-label={title}>
        <div className="confirm-body">
          <h3>{title}</h3>
          {message ? <p>{message}</p> : null}
        </div>
        <div className="modal-footer">
          <div className="right">
            <button type="button" className="btn btn-ghost" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={onConfirm}>
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
