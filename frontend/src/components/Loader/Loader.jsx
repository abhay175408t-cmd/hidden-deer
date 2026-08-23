import { useCallback, useEffect, useRef, useState } from 'react';
import { gsap } from '../../lib/gsap';
import useScrollLock from '../../hooks/useScrollLock';
import './Loader.css';

// Place the brand-logo animation at public/videos/hidden-deer-logo.mp4 (served at
// /videos/hidden-deer-logo.mp4). A URL string (not an import) is intentional: the
// build never fails while the video is not yet provided.
const VIDEO_SRC = '/videos/hidden-deer-logo.mp4';

// If the video errors, show the wordmark briefly and transition anyway.
const ERROR_FALLBACK_MS = 1200;
// If the video stalls without erroring, never block the site longer than this.
const STALL_FALLBACK_MS = 6000;

// Session guard: the loader plays once per page load, never on every render
// or on back-navigation. A full page refresh resets it.
let loaderShownThisSession = false;

export default function Loader({ onComplete }) {
  const loaderRef = useRef(null);
  const videoRef = useRef(null);
  const onCompleteRef = useRef(onComplete);
  const completed = useRef(false);
  const [videoFailed, setVideoFailed] = useState(false);

  useScrollLock(true);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const finish = useCallback(() => {
    if (completed.current) return;
    completed.current = true;
    loaderShownThisSession = true;

    const loader = loaderRef.current;
    if (!loader) {
      onCompleteRef.current();
      return;
    }

    // Premium editorial exit: video fades, then the loader slides up out of
    // the viewport while the homepage is already mounted underneath.
    const timeline = gsap.timeline({
      defaults: { ease: 'power4.inOut' },
      onComplete: onCompleteRef.current,
    });

    timeline
      .to(videoRef.current, { opacity: 0, duration: 0.5, ease: 'power2.inOut' }, 0)
      .to(loader, { yPercent: -100, duration: 1.15 }, 0.1)
      .set(loader, { display: 'none' });
  }, []);

  useEffect(() => {
    if (loaderShownThisSession) {
      onCompleteRef.current();
      return undefined;
    }
    const stallTimer = setTimeout(finish, STALL_FALLBACK_MS);
    return () => clearTimeout(stallTimer);
  }, [finish]);

  const handleVideoError = useCallback(() => {
    if (completed.current) return;
    setVideoFailed(true);
    setTimeout(finish, ERROR_FALLBACK_MS);
  }, [finish]);

  const handleVideoReady = useCallback(() => {
    videoRef.current?.play().catch(handleVideoError);
  }, [handleVideoError]);

  if (loaderShownThisSession && completed.current) return null;

  return (
    <div className="loader" ref={loaderRef} aria-hidden="true">
      <video
        ref={videoRef}
        className="loader__video"
        src={VIDEO_SRC}
        muted
        playsInline
        autoPlay
        preload="auto"
        disablePictureInPicture
        onEnded={finish}
        onError={handleVideoError}
        onLoadedData={handleVideoReady}
      />
      {videoFailed && <span className="loader__fallback">HIDDEN DEER</span>}
    </div>
  );
}