import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  /** Footer buttons; a Close button is added when omitted. */
  actions?: ComponentChildren;
}

/** Modal built on the native <dialog> element (focus trap + Esc for free). */
export function Dialog({ open, title, onClose, children, actions }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // True while we close the dialog ourselves because `open` turned false, so
  // the resulting `close` event isn't mistaken for the user dismissing it.
  const closingFromPropsRef = useRef(false);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) {
      closingFromPropsRef.current = true;
      d.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      class="dialog"
      aria-label={title}
      onClose={() => {
        if (closingFromPropsRef.current) closingFromPropsRef.current = false;
        else onClose();
      }}
      onClick={(e) => {
        // Tap on the backdrop closes the dialog.
        if (e.target === dialogRef.current) onClose();
      }}
    >
      {open && (
        <div class="dialog-body">
          <h2 class="dialog-title">{title}</h2>
          <div class="dialog-content">{children}</div>
          <div class="dialog-actions">
            {actions ?? (
              <button type="button" class="btn" onClick={onClose}>
                Close
              </button>
            )}
          </div>
        </div>
      )}
    </dialog>
  );
}

interface ConfirmProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog(p: ConfirmProps) {
  return (
    <Dialog
      open={p.open}
      title={p.title}
      onClose={p.onCancel}
      actions={
        <>
          <button type="button" class="btn" onClick={p.onCancel}>
            Cancel
          </button>
          <button
            type="button"
            class={p.danger ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={p.onConfirm}
          >
            {p.confirmLabel}
          </button>
        </>
      }
    >
      <p>{p.message}</p>
    </Dialog>
  );
}
