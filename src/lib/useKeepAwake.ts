'use client';

import { useEffect, useState } from 'react';

/**
 * Custom hook to prevent screen from sleeping in TV Mode.
 * Implements modern W3C Screen Wake Lock API with automatic re-acquisition on visibility change,
 * paired with a lightweight silent 1x1 video fallback for complete compatibility across TV browsers.
 */
export function useKeepAwake(isActive: boolean = false): { isLocked: boolean } {
  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => {
    if (!isActive || typeof window === 'undefined') {
      setIsLocked(false);
      return;
    }

    let wakeLockSentinel: any = null;
    let fallbackVideo: HTMLVideoElement | null = null;
    let isCancelled = false;

    // 1. Primary: Screen Wake Lock API
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator && (navigator as any).wakeLock?.request) {
          wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
          if (!isCancelled) {
            setIsLocked(true);
          }
          wakeLockSentinel.addEventListener('release', () => {
            if (!isCancelled && isActive) {
              setIsLocked(false);
              // Re-acquire if screen turned off and back on
              setTimeout(() => {
                if (!isCancelled && isActive && document.visibilityState === 'visible') {
                  requestWakeLock();
                }
              }, 1000);
            }
          });
        }
      } catch (err) {
        // WakeLock request can fail if window is not focused or power mode restricts it
        console.warn('Wake Lock request info:', err);
      }
    };

    // 2. Fallback: Invisible 1x1 silent looping video
    // Browsers natively prohibit screen blanking while HTML5 video plays
    const setupFallbackVideo = () => {
      try {
        if (!fallbackVideo && typeof document !== 'undefined') {
          const video = document.createElement('video');
          video.setAttribute('playsinline', 'true');
          video.setAttribute('webkit-playsinline', 'true');
          video.setAttribute('muted', 'true');
          video.muted = true;
          video.loop = true;
          video.autoplay = true;
          video.style.position = 'fixed';
          video.style.width = '1px';
          video.style.height = '1px';
          video.style.bottom = '0';
          video.style.right = '0';
          video.style.opacity = '0.001';
          video.style.pointerEvents = 'none';
          video.style.zIndex = '-9999';
          // 1-frame blank MP4 video encoded in base64
          video.src = 'data:video/mp4;base64,AAAAHGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAAsbWRhdAAAAAA=';
          video.play().catch(() => {});
          document.body.appendChild(video);
          fallbackVideo = video;
        }
      } catch (e) {
        // ignore fallback errors
      }
    };

    requestWakeLock();
    setupFallbackVideo();

    // Re-acquire lock when user switches back to this tab
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !isCancelled && isActive) {
        requestWakeLock();
        if (fallbackVideo && fallbackVideo.paused) {
          fallbackVideo.play().catch(() => {});
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);

    return () => {
      isCancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);

      if (wakeLockSentinel) {
        wakeLockSentinel.release().catch(() => {});
        wakeLockSentinel = null;
      }
      if (fallbackVideo && fallbackVideo.parentNode) {
        fallbackVideo.pause();
        fallbackVideo.parentNode.removeChild(fallbackVideo);
        fallbackVideo = null;
      }
      setIsLocked(false);
    };
  }, [isActive]);

  return { isLocked };
}

