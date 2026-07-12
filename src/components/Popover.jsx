import { useLayoutEffect, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// A small popover that closes on outside click or Escape. Portals its
// content to document.body and positions it with position: fixed, computed
// from an anchor marker left behind at the popover's original spot in the
// tree. This is the actual fix for a popover rendering clipped inside a
// scrollable ancestor (the sidebar's own overflow-y: auto, confirmed the
// real cause, not a z-index problem: position: absolute only escapes its
// container visually until an ancestor sets overflow, at which point it is
// clipped regardless of z-index). See docs/resolution-log.md.
//
// Positions itself in two passes, both before paint: first below-left of
// the anchor (a reasonable guess, before the popover's own size is known),
// then, once its real rendered size is known, resolves all four edges at
// once: flips right-aligned if it would overflow the viewport's right edge,
// clamps the resulting left edge to a margin if it's still off the left
// edge (a real risk at phone width, not just desktop), and flips to open
// above the anchor instead of below if it would overflow the bottom edge.
// See docs/design-system.md's "Responsive" section.
export default function Popover({ children, onClose }) {
  const anchorRef = useRef(null);
  const popRef = useRef(null);
  const [coords, setCoords] = useState(null);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    setCoords({ top: rect.bottom + 6, left: rect.left, right: null, resolved: false });
  }, []);

  useLayoutEffect(() => {
    if (!coords || coords.resolved) return;
    const pop = popRef.current;
    const anchor = anchorRef.current;
    if (!pop || !anchor) return;
    const anchorRect = anchor.getBoundingClientRect();
    const popRect = pop.getBoundingClientRect();
    const margin = 8;

    // Horizontal: left-aligned by default; flip to right-aligned if that
    // would overflow the right edge, then clamp whichever edge is still
    // used so the popover never starts left of the margin either.
    let left = anchorRect.left;
    let right = null;
    if (left + popRect.width > window.innerWidth - margin) {
      left = null;
      right = window.innerWidth - anchorRect.right;
    }
    if (left !== null) {
      if (left < margin) left = margin;
    } else if (window.innerWidth - right - popRect.width < margin) {
      right = window.innerWidth - margin - popRect.width;
    }

    // Vertical: below the anchor by default; flip above it if that would
    // overflow the bottom edge. If it doesn't fit above either (a genuinely
    // tall popover on a short screen), clamp to the top margin rather than
    // pushing off both edges at once.
    let top = anchorRect.bottom + 6;
    if (top + popRect.height > window.innerHeight - margin) {
      const above = anchorRect.top - popRect.height - 6;
      top = above >= margin ? above : margin;
    }

    setCoords({ top, left, right, resolved: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords]);

  useEffect(() => {
    function onDoc(e) {
      // A popover can itself contain another popover (a picker inside the
      // sidebar's Add-task popover): both portal to document.body as
      // separate subtrees, so popRef.current.contains(e.target) alone would
      // miss a click inside the nested one and close this one by mistake.
      // Checking for any .popover ancestor covers that without tracking
      // parent/child relationships explicitly.
      const inAnyPopover = e.target.closest && e.target.closest('.popover');
      const onAnchor = anchorRef.current && anchorRef.current.contains(e.target);
      if (!inAnyPopover && !onAnchor) onClose();
    }
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <>
      <span ref={anchorRef} style={{ position: 'absolute', width: 0, height: 0 }} />
      {coords
        ? createPortal(
            <div
              className="popover"
              ref={popRef}
              style={{
                position: 'fixed',
                top: coords.top,
                left: coords.left === null ? 'auto' : coords.left,
                right: coords.right === null ? 'auto' : coords.right
              }}
            >
              {children}
            </div>,
            document.body
          )
        : null}
    </>
  );
}
