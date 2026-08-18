import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { gsap } from '../../../lib/gsap';
import useScrollLock from '../../../hooks/useScrollLock';
import { isValidPincode, savePincode } from '../../../lib/pincode';
import './PincodeModal.css';

/**
 * Premium delivery-location modal.
 * - Escape closes, click outside closes, focus moves to the input on open
 *   and returns to the trigger on close.
 * - Subtle GSAP entrance animation (reduced-motion aware).
 */
export default function PincodeModal({ open, onClose, onSaved, pincode }) {
  const rootRef = useRef(null);
  const dialogRef = useRef(null);
  const inputRef = useRef(null);
  const [value, setValue] = useState(pincode || '');
  const [error, setError] = useState(null);

  useScrollLock(open);

  useEffect(() => {
    if (open) setValue(pincode || '');
  }, [open, pincode]);

  // Entrance animation. Context is scoped to the whole modal (backdrop + dialog).
  useLayoutEffect(() => {
    if (!open) return undefined;
    const context = gsap.context(() => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: reduce)', () => {
        gsap.set('[data-pincode-dialog]', { clearProps: 'opacity,transform' });
        gsap.set('[data-pincode-backdrop]', { clearProps: 'opacity' });
      });
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.fromTo(
          '[data-pincode-backdrop]',
          { opacity: 0 },
          { opacity: 1, duration: 0.3, ease: 'power2.out' }
        );
        gsap.fromTo(
          '[data-pincode-dialog]',
          { y: 26, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.45, ease: 'power2.out', delay: 0.05 }
        );
      });
      return () => mm.revert();
    }, rootRef);
    return () => context.revert();
  }, [open]);

  // Keyboard + focus handling.
  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement;
    inputRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [open, onClose]);

  const handleSubmit = useCallback(
    (event) => {
      event.preventDefault();
      const trimmed = value.trim();
      if (!isValidPincode(trimmed)) {
        setError('Enter a valid 6-digit pincode');
        inputRef.current?.focus();
        return;
      }
      if (!savePincode(trimmed)) {
        setError('Could not save the pincode. Try again.');
        return;
      }
      setError(null);
      onSaved(trimmed);
      onClose();
    },
    [value, onSaved, onClose]
  );

  if (!open) return null;

  return (
    <div
      className="pincode-modal"
      data-pincode-backdrop
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      ref={rootRef}
    >
      <div
        className="pincode-modal__dialog"
        data-pincode-dialog
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pincode-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="pincode-modal__close"
          aria-label="Close delivery location dialog"
          onClick={onClose}
        >
          ×
        </button>
        <p className="pincode-modal__eyebrow">Delivery</p>
        <h2 id="pincode-modal-title" className="pincode-modal__title">
          Check Delivery
        </h2>
        <p className="pincode-modal__hint">Enter your pincode</p>
        <form onSubmit={handleSubmit} noValidate>
          <div className="pincode-modal__field">
            <input
              ref={inputRef}
              className="pincode-modal__input"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              autoComplete="postal-code"
              placeholder="560001"
              aria-label="Pincode"
              aria-invalid={error ? 'true' : undefined}
              aria-describedby={error ? 'pincode-modal-error' : undefined}
              value={value}
              onChange={(event) => {
                setValue(event.target.value.replace(/\D/g, ''));
                if (error) setError(null);
              }}
            />
            <button type="submit" className="pincode-modal__submit">
              Check
            </button>
          </div>
          {error && (
            <p id="pincode-modal-error" className="pincode-modal__error" role="alert">
              {error}
            </p>
          )}
        </form>
        <p className="pincode-modal__note">
          We use your pincode to confirm availability and delivery times in your area.
        </p>
      </div>
    </div>
  );
}