# Video assets

Place the HIDDEN DEER brand-logo animation video at:

    public/videos/hidden-deer-logo.mp4

It is served by Vite at `/videos/hidden-deer-logo.mp4` and referenced by
`src/components/Loader/Loader.jsx` (const `VIDEO_SRC`).

Requirements:
- MP4 (H.264) recommended, ~1080p or smaller — keep it light for performance
- No audio track needed (the loader plays it muted for autoplay)
- 16:9 or square; the loader uses `object-fit: contain`, so any aspect ratio
  will be preserved without distortion

The loader falls back gracefully (HIDDEN DEER wordmark + timed transition) until the
video is provided, so the website never blocks.
