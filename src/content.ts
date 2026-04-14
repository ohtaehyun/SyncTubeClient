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
  MESSAGE_TYPE,
} from "./shared/types";

// ============= 설정 =============
const LOG_PREFIX = "[CS]";
const VIDEO_SEARCH_RETRY_LIMIT = 10;
const VIDEO_SEARCH_RETRY_DELAY_MS = 500;

// ============= 상태 관리 =============

interface ContentState {
  isApplying: boolean; // 동기화 적용 중 플래그
  lastAppliedRevision: number;
  lastVideoElement: HTMLVideoElement | null;
}

let state: ContentState = {
  isApplying: false,
  lastAppliedRevision: 0,
  lastVideoElement: null,
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
  // 캐시된 video element가 있고 여전히 DOM에 있으면 사용
  if (state.lastVideoElement && state.lastVideoElement.parentElement) {
    return state.lastVideoElement;
  }

  // 새로운 video element 검색
  const video = document.querySelector<HTMLVideoElement>("video");

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
 * - 차이 비교:
 *   - |delta| < 0.15s: 그대로
 *   - 0.15s ≤ |delta| < 0.8s: currentTime 설정
 *   - |delta| ≥ 0.8s: 즉시 보정
 */
async function applyState(message: ApplyStateMessage): Promise<void> {
  if (state.isApplying) {
    log("이미 동기화 적용 중");
    return;
  }

  state.isApplying = true;

  try {
    const video = await getVideo();
    if (!video) {
      logError("Video element 접근 실패");
      return;
    }

    const { isPlaying, anchorTime, anchorTs, revision } = message;

    log("APPLY_STATE:", {
      isPlaying,
      anchorTime,
      anchorTs,
      revision,
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

    if (delta < 0.15) {
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

    state.lastAppliedRevision = revision;
    log("동기화 완료, revision:", revision);
  } catch (error) {
    logError("동기화 중 에러:", error);
  } finally {
    state.isApplying = false;
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
    log("PLAY 이벤트 감지");
    sendPlayerEvent("PLAY", video.currentTime);
  });

  video.addEventListener("pause", () => {
    log("PAUSE 이벤트 감지");
    sendPlayerEvent("PAUSE", video.currentTime);
  });

  video.addEventListener("timeupdate", () => {
    // SEEK 감지: currentTime이 급격히 변함 (1초 이상)
    const deltaTime = Math.abs(video.currentTime - lastTimeUpdate);
    const now = Date.now();

    // 너무 빠른 이벤트는 무시 (300ms 이내)
    if (now - lastEmittedTime < 300) {
      return;
    }

    if (deltaTime > 1.0) {
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
async function initialize(): Promise<void> {
  log("Content Script 초기화 중...");

  // Video element 찾기 (YouTube는 SPA이므로 시간이 걸릴 수 있음)
  const video = await getVideo();
  if (video) {
    // 플레이어 이벤트 리스너 설정 (선택 사항)
    // setupPlayerEventListeners();
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
});
