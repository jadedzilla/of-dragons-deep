import { useEffect, useRef } from "react";

/**
 * A modal <dialog>, shown while `open`. Closing (Esc, the backdrop, or `open` turning false) calls onClose.
 * focusRef: what to focus once shown (default: the dialog itself, so no button shows a focus ring).
 */
export function Dialog({ open, onClose, focusRef, closeOnBackdrop = true, children, ...props }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (open && !d.open) { d.showModal(); (focusRef?.current ?? d).focus(); }
    else if (!open && d.open) d.close();
  }, [open, focusRef]);
  return (
    <dialog ref={ref} onClose={() => onClose?.()} tabIndex={-1} {...props}
      onClick={e => { props.onClick?.(e); if (closeOnBackdrop && e.target === ref.current) ref.current.close(); }}>
      {children}
    </dialog>
  );
}
