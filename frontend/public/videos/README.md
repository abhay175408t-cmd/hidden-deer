# Video assets

Place the DEER brand-logo animation video at:

    public/videos/deer-logo.mp4

It is served by Vite at `/videos/deer-logo.mp4` and referenced by
`src/components/Loader/Loader.jsx` (const `VIDEO_SRC`).

Requirements:
- MP4 (H.264) recommended, ~1080p or smaller — keep it light for performance
- No audio track needed (the loader plays it muted for autoplay)
- 16:9 or square; the loader uses `object-fit: contain`, so any aspect ratio
  will be preserved without distortion

The loader falls back gracefully (DEER wordmark + timed transition) until the
video is provided, so the website never blocks.
