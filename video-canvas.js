// Display video frames without exposing a native video surface to pointer/remote input.
// TV firmware can still override HTML playback; ?nativeVideo=1 restores direct playback.
(() => {
  const nativePlayback = new URLSearchParams(location.search).get('nativeVideo') === '1';
  window.attachSignageVideo = video => {
    if (nativePlayback) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'signage-video-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    const ctx = canvas.getContext('2d', {alpha:false});
    if (!ctx) return;
    video.classList.add('signage-video-decoder');
    video.insertAdjacentElement('afterend', canvas);
    let frame = null, videoFrame = false, disposed = false, lastPaint = -Infinity;
    function stop() {
      if (frame !== null) {
        if (videoFrame) video.cancelVideoFrameCallback(frame);
        else cancelAnimationFrame(frame);
      }
      frame = null;
    }
    function draw(now) {
      frame = null;
      if (disposed || !video.isConnected || video.paused || video.ended) return;
      if (video.readyState >= 2 && video.videoWidth && now - lastPaint >= 30) {
        const width = Math.max(1,Math.min(1280,Math.round(canvas.clientWidth)));
        const height = Math.max(1,Math.round(width * canvas.clientHeight / Math.max(canvas.clientWidth,1)));
        if (canvas.width !== width || canvas.height !== height) {canvas.width=width;canvas.height=height;}
        const scale = Math.max(width/video.videoWidth,height/video.videoHeight);
        ctx.drawImage(video,(width-video.videoWidth*scale)/2,(height-video.videoHeight*scale)/2,video.videoWidth*scale,video.videoHeight*scale);
        lastPaint=now;
      }
      videoFrame = typeof video.requestVideoFrameCallback === 'function' && typeof video.cancelVideoFrameCallback === 'function';
      frame = videoFrame ? video.requestVideoFrameCallback(draw) : requestAnimationFrame(draw);
    }
    function start() {stop();lastPaint=-Infinity;draw(performance.now());}
    video.addEventListener('playing',start);
    video.addEventListener('pause',stop);
    video.addEventListener('ended',stop);
    video.addEventListener('error',stop);
    video.disposeSignage = () => {
      disposed=true;stop();
      video.removeEventListener('playing',start);
      video.removeEventListener('pause',stop);
      video.removeEventListener('ended',stop);
      video.removeEventListener('error',stop);
    };
  };
})();
