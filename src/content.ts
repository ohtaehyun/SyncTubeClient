/**
 * Content Script
 *
 * 역할:
 * 1. YouTube 페이지에서 <video> 엘리먼트 접근 및 제어
 * 2. Service Worker로부터 APPLY_STATE 메시지 수신
 * 3. 동기화 규칙에 따라 플레이어 상태 업데이트
 * 4. (선택) 호스트일 때 플레이어 이벤트를 Service Worker로 전송
 */

import {
  ApplyStateMessage,
  ContentToBackgroundMessage,
  BackgroundToContentMessage,
  ExtensionState,
  MESSAGE_TYPE,
} from "./shared/types";

// ============= 설정 =============
const LOG_PREFIX = "[CS]";
const VIDEO_SEARCH_RETRY_LIMIT = 10;
const VIDEO_SEARCH_RETRY_DELAY_MS = 500;
const INITIAL_PAUSE_ENFORCEMENT_MS = [0, 250, 1000, 2000];
const AD_STATE_CHECK_INTERVAL_MS = 500;

// ============= 상태 관리 =============

interface ContentState {
  isApplying: boolean; // 동기화 적용 중 플래그
  lastAppliedRevision: number;
  lastVideoElement: HTMLVideoElement | null;
  suppressPlayerEventsUntil: number;
  pendingState: ApplyStateMessage | null;
  latestState: ApplyStateMessage | null;
  wasShowingAd: boolean;
}

let state: ContentState = {
  isApplying: false,
  lastAppliedRevision: -1,
  lastVideoElement: null,
  suppressPlayerEventsUntil: 0,
  pendingState: null,
  latestState: null,
  wasShowingAd: false,
};

// ============= 로깅 유틸 =============

function log(...args: any[]): void {
  console.log(LOG_PREFIX, ...args);
}

function logError(...args: any[]): void {
  console.error(LOG_PREFIX, ...args);
}

// ============= YouTube 플레이어 접근 =============

/**
 * YouTube 페이지에서 video 엘리먼트 찾기
 * YouTube는 SPA이므로 여러 번 시도
 */
async function getVideo(
  retryCount: number = 0,
): Promise<HTMLVideoElement | null> {
  // 광고 전환이나 SPA 이동 중 video 엘리먼트가 교체될 수 있으므로,
  // 캐시보다 현재 메인 플레이어의 엘리먼트를 우선한다.
  const video = document.querySelector<HTMLVideoElement>(
    "#movie_player video.html5-main-video, video.html5-main-video, video",
  );

  if (video) {
    state.lastVideoElement = video;
    log("Video element 발견");
    return video;
  }

  // 재시도
  if (retryCount < VIDEO_SEARCH_RETRY_LIMIT) {
    log(
      `Video element 미발견, ${VIDEO_SEARCH_RETRY_DELAY_MS}ms 후 재시도... (${retryCount + 1}/${VIDEO_SEARCH_RETRY_LIMIT})`,
    );
    await new Promise((resolve) =>
      setTimeout(resolve, VIDEO_SEARCH_RETRY_DELAY_MS),
    );
    return getVideo(retryCount + 1);
  }

  logError("Video element를 찾을 수 없음");
  return null;
}

function isAdvertisementShowing(): boolean {
  return document.querySelector(
    "#movie_player.ad-showing, .html5-video-player.ad-showing",
  ) !== null;
}

function monitorAdvertisementEnd(): void {
  window.setInterval(() => {
    const isShowingAd = isAdvertisementShowing();

    if (isShowingAd) {
      state.wasShowingAd = true;
      return;
    }

    if (!state.wasShowingAd) {
      return;
    }

    state.wasShowingAd = false;
    if (state.latestState) {
      log("광고 종료 감지: 최신 방 상태를 본편에 다시 적용");
      void applyState(state.latestState, true);
    }
  }, AD_STATE_CHECK_INTERVAL_MS);
}

/**
 * YouTube에서 현재 영상의 비디오 ID 추출
 */
function extractVideoId(): string | null {
  // YouTube URL에서 v= 파라미터 추출
  const urlParams = new URLSearchParams(window.location.search);
  const videoId = urlParams.get("v");

  if (videoId) {
    return videoId;
  }

  logError("비디오 ID를 추출할 수 없음");
  return null;
}

// ============= 동기화 로직 =============

/**
 * 서버 상태를 로컬 플레이어에 적용
 * 동기화 규칙:
 * - 대상 시간 계산: isPlaying ? anchorTime + (now - anchorTs)/1000 : anchorTime
 *   anchorTs는 서버 시간이 아니라 이 클라이언트가 상태를 받은 로컬 시간입니다.
 * - 차이 비교:
 *   - |delta| < 0.15s: 그대로
 *   - 0.15s ≤ |delta| < 0.8s: currentTime 설정
 *   - |delta| ≥ 0.8s: 즉시 보정
 */
async function applyState(
  message: ApplyStateMessage,
  force: boolean = false,
): Promise<void> {
  if (
    !state.latestState ||
    message.revision >= state.latestState.revision
  ) {
    state.latestState = message;
  }

  if (!force && message.revision <= state.lastAppliedRevision) {
    log("이미 적용한 상태 무시", {
      revision: message.revision,
      lastAppliedRevision: state.lastAppliedRevision,
    });
    return;
  }

  if (state.isApplying) {
    if (
      !state.pendingState ||
      message.revision >= state.pendingState.revision
    ) {
      state.pendingState = message;
    }
    log("동기화 적용 중이므로 최신 상태를 대기열에 저장", {
      revision: message.revision,
    });
    return;
  }

  state.isApplying = true;
  state.suppressPlayerEventsUntil = Date.now() + 800;
  log("APPLY_STATE started", {
    isPlaying: message.isPlaying,
    anchorTime: message.anchorTime,
    revision: message.revision,
  });

  try {
    // 광고 시간은 본편의 currentTime과 다른 타임라인이다. 광고 중 seek하면
    // 본편 동기화가 되지 않으므로, 광고 종료 감시자가 같은 상태를 재적용한다.
    if (isAdvertisementShowing()) {
      state.wasShowingAd = true;
      log("광고 재생 중: 본편 동기화를 광고 종료 후로 보류", {
        revision: message.revision,
      });
      return;
    }

    const video = await getVideo();
    if (!video) {
      logError("Video element 접근 실패");
      return;
    }

    const {
      isPlaying,
      anchorTime,
      anchorTs,
      revision,
      forceSync = false,
    } = message;

    log("APPLY_STATE:", {
      isPlaying,
      anchorTime,
      anchorTs,
      revision,
      forceSync,
      currentTime: video.currentTime,
    });

    // 1. 대상 시간 계산
    const nowTs = Date.now();
    const targetTime = isPlaying
      ? anchorTime + (nowTs - anchorTs) / 1000
      : anchorTime;

    // 2. 시간 동기화
    const delta = Math.abs(video.currentTime - targetTime);
    log(
      `시간 델타: ${delta.toFixed(3)}s (현재: ${video.currentTime.toFixed(2)}s, 목표: ${targetTime.toFixed(2)}s)`,
    );

    if (forceSync) {
      log("재생 재개: 새 앵커 시간으로 강제 재동기화");
      video.currentTime = targetTime;
    } else if (delta < 0.15) {
      log("델타 < 0.15s, 그대로 유지");
    } else if (delta < 0.8) {
      log("델타 < 0.8s, 부드러운 조정");
      video.currentTime = targetTime;
    } else {
      log("델타 >= 0.8s, 즉시 보정");
      video.currentTime = targetTime;
    }

    // 3. 재생 상태 동기화
    try {
      if (isPlaying && video.paused) {
        log("재생 시작");
        // play()는 promise를 반환하고 실패할 수 있음 (예: 자동 재생 정책)
        await video.play();
      } else if (!isPlaying && !video.paused) {
        log("일시정지");
        video.pause();
      }
    } catch (error) {
      logError("재생 상태 변경 실패:", error);
      // 에러가 발생해도 계속 진행 (동기화 실패로 처리하지 않음)
    }

    // 영상 전환·재생 재개에서는 첫 seek 이후 실제 재생까지 버퍼링이 생길 수 있다.
    // playing 시점에 다시 계산해야 버퍼링 시간만큼 뒤처진 채 시작하지 않는다.
    if (forceSync && isPlaying) {
      await waitForPlaybackStart(video);
      const playbackReadyTarget = anchorTime + (Date.now() - anchorTs) / 1000;
      log("재생 준비 완료: 최신 앵커 시간으로 재보정", {
        targetTime: playbackReadyTarget,
      });
      video.currentTime = playbackReadyTarget;
    }

    state.lastAppliedRevision = revision;
    log("APPLY_STATE completed", {
      isPlaying: !video.paused,
      currentTime: video.currentTime,
      revision,
    });
    log("동기화 완료, revision:", revision);
  } catch (error) {
    logError("동기화 중 에러:", error);
  } finally {
    state.isApplying = false;
    const pendingState = state.pendingState;
    state.pendingState = null;

    // applyState()가 비동기인 동안 들어온 pause/play 상태를 버리지 않고,
    // 현재 상태 적용이 끝난 뒤 이어서 적용한다.
    if (pendingState) {
      void applyState(pendingState);
    }
  }
}

// ============= 플레이어 이벤트 감지 (호스트만) =============

/**
 * 호스트의 플레이어 이벤트를 Service Worker로 전송
 */
function sendPlayerEvent(
  event: "PLAY" | "PAUSE" | "SEEK",
  currentTime: number,
): void {
  const message: ContentToBackgroundMessage = {
    type: MESSAGE_TYPE.PLAYER_EVENT,
    code: "", // Service Worker에서 채움
    event,
    currentTime,
  };

  chrome.runtime.sendMessage(message, (response: unknown) => {
    if (chrome.runtime.lastError) {
      logError("플레이어 이벤트 전송 실패:", chrome.runtime.lastError);
    } else {
      log("플레이어 이벤트 전송 완료:", event, currentTime);
    }
    return response;
  });
}

/**
 * 호스트의 플레이어 이벤트 리스너 설정
 * (선택 사항 - 호스트만 활성화)
 */
function setupPlayerEventListeners(): void {
  const video = state.lastVideoElement;
  if (!video) {
    return;
  }

  let lastTimeUpdate = video.currentTime;
  let lastEmittedTime = Date.now();

  video.addEventListener("play", () => {
    if (Date.now() < state.suppressPlayerEventsUntil) return;
    log("PLAYER_EVENT detected: PLAY", { currentTime: video.currentTime });
    log("PLAY 이벤트 감지");
    sendPlayerEvent("PLAY", video.currentTime);
  });

  video.addEventListener("pause", () => {
    if (Date.now() < state.suppressPlayerEventsUntil) return;
    log("PLAYER_EVENT detected: PAUSE", { currentTime: video.currentTime });
    log("PAUSE 이벤트 감지");
    sendPlayerEvent("PAUSE", video.currentTime);
  });

  video.addEventListener("timeupdate", () => {
    if (Date.now() < state.suppressPlayerEventsUntil) return;
    // SEEK 감지: currentTime이 급격히 변함 (1초 이상)
    const deltaTime = Math.abs(video.currentTime - lastTimeUpdate);
    const now = Date.now();

    // 너무 빠른 이벤트는 무시 (300ms 이내)
    if (now - lastEmittedTime < 300) {
      return;
    }

    if (deltaTime > 1.0) {
      log("PLAYER_EVENT detected: SEEK", { currentTime: video.currentTime });
      log("SEEK 이벤트 감지:", deltaTime.toFixed(2), "s");
      sendPlayerEvent("SEEK", video.currentTime);
      lastEmittedTime = now;
    }

    lastTimeUpdate = video.currentTime;
  });

  log("플레이어 이벤트 리스너 설정 완료");
}

// ============= 메시지 리스너 =============

/**
 * Service Worker로부터 메시지 수신
 */
chrome.runtime.onMessage.addListener(
  (
    message: BackgroundToContentMessage | any,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: any) => void,
  ) => {
    log("메시지 수신:", message);

    try {
      if (message.type === MESSAGE_TYPE.APPLY_STATE) {
        applyState(message).then(() => {
          sendResponse({ success: true });
        });
        return true; // async 응답을 위해 true 반환
      }

      log("알 수 없는 메시지 타입:", message.type);
      sendResponse({ success: false, error: "Unknown message type" });
    } catch (error) {
      logError("메시지 처리 중 에러:", error);
      sendResponse({ success: false, error: String(error) });
    }
  },
);

// ============= 초기화 =============

/**
 * Content Script 초기화
 */
async function applyStoredRoomState(): Promise<void> {
  const result = (await chrome.storage.local.get("extensionState")) as {
    extensionState?: ExtensionState;
  };
  const savedState = result.extensionState?.lastState;

  if (!savedState || savedState.videoId !== extractVideoId()) {
    return;
  }

  log("Stored room state applied after navigation:", savedState);
  const video = await getVideo();
  if (!video) {
    return;
  }

  await waitForVideoMetadata(video);
  await applyState({
    type: MESSAGE_TYPE.APPLY_STATE,
    isPlaying: savedState.isPlaying,
    anchorTime: savedState.anchorTime,
    anchorTs: savedState.anchorTs,
    revision: savedState.revision,
    forceSync: savedState.forceSync,
  });

  if (!savedState.isPlaying) {
    enforceInitialPause(video);
  }
}

async function waitForVideoMetadata(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
    return;
  }

  await new Promise<void>((resolve) => {
    video.addEventListener("loadedmetadata", () => resolve(), { once: true });
  });
}

async function waitForPlaybackStart(video: HTMLVideoElement): Promise<void> {
  if (
    !video.paused &&
    video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA
  ) {
    return;
  }

  await new Promise<void>((resolve) => {
    const timeout = window.setTimeout(resolve, 5_000);
    video.addEventListener(
      "playing",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}

function enforceInitialPause(video: HTMLVideoElement): void {
  const pause = () => {
    if (!video.paused) {
      log("Pausing YouTube autoplay for a paused room");
      video.pause();
    }
  };

  video.addEventListener("playing", pause, { once: true });
  for (const delay of INITIAL_PAUSE_ENFORCEMENT_MS) {
    setTimeout(pause, delay);
  }
}

async function initialize(): Promise<void> {
  log("Content Script 초기화 중...");

  // Video element 찾기 (YouTube는 SPA이므로 시간이 걸릴 수 있음)
  const video = await getVideo();
  if (video) {
    await applyStoredRoomState();
    monitorAdvertisementEnd();
    // 플레이어 이벤트 리스너 설정 (선택 사항)
    setupPlayerEventListeners();
  } else {
    logError("초기화 실패: video element 미발견");
  }

  log("Content Script 초기화 완료");
}

// 페이지 로드 시 초기화
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    initialize();
  });
} else {
  initialize();
}

// YouTube SPA 네비게이션 감지 (선택 사항)
// URL이 변경되면 video element가 달라질 수 있으므로 캐시 초기화
window.addEventListener("yt-navigate-finish", () => {
  log("YouTube 페이지 변경 감지, 캐시 초기화");
  state.lastVideoElement = null;
  setTimeout(async () => {
    const video = await getVideo();
    const videoId = extractVideoId();
    if (video && videoId) {
      chrome.runtime.sendMessage({ type: MESSAGE_TYPE.CHANGE_VIDEO, videoId, currentTime: video.currentTime, isPlaying: !video.paused });
    }
  }, 500);
});
