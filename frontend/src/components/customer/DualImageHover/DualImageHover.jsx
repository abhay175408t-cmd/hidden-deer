import useDualImageHover from '../../../hooks/useDualImageHover';
import './DualImageHover.css';

/**
 * The signature HIDDEN DEER media transition: a "person wearing" image by default,
 * crossfading to a clean product-only image on hover (and back on leave).
 *
 * If `secondary` is not provided the component renders a plain single image
 * (graceful fallback — no fake second image is ever created).
 *
 * Props:
 *   primary   { src, alt }  — default / lifestyle image
 *   secondary { src, alt }  — hover / product-only image (optional)
 *   alt       fallback alt text when primary.alt is missing
 *   eager     render with loading="eager" (above-the-fold content)
 *   children  overlay content rendered on top of the media
 */
export default function DualImageHover({ primary, secondary, alt, eager = false, className = '', children }) {
  const { rootRef, primaryRef, secondaryRef, enter, leave, setEnabled } = useDualImageHover();

  const hasPrimary = Boolean(primary?.src);
  const hasSecondary = Boolean(secondary?.src);
  setEnabled(hasSecondary);

  return (
    <div
      ref={rootRef}
      className={`dual-image${className ? ` ${className}` : ''}`}
      onMouseEnter={hasSecondary ? enter : undefined}
      onMouseLeave={hasSecondary ? leave : undefined}
      onFocusCapture={hasSecondary ? enter : undefined}
      onBlurCapture={hasSecondary ? leave : undefined}
    >
      {hasPrimary ? (
        <img
          ref={primaryRef}
          className="dual-image__layer dual-image__layer--primary"
          src={primary.src}
          alt={primary.alt || alt || ''}
          loading={eager ? 'eager' : 'lazy'}
          decoding={eager ? 'sync' : 'async'}
          draggable={false}
        />
      ) : (
        <div ref={primaryRef} className="dual-image__layer dual-image__layer--primary dual-image__fallback">
          HIDDEN DEER
        </div>
      )}
      {hasSecondary && (
        <img
          ref={secondaryRef}
          className="dual-image__layer dual-image__layer--secondary"
          src={secondary.src}
          alt=""
          aria-hidden="true"
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
        />
      )}
      {children}
    </div>
  );
}