/**
 * Popup Script
 *
 * 역할:
 * 1. UI 요소 관리
 * 2. Create Room / Join Room 요청 처리
 * 3. Service Worker 상태 폴링 및 UI 업데이트
 * 4. 디버그 정보 표시
 */

import {
  PopupToBackgroundMessage,
  BackgroundToPopupResponse,
} from "./shared/types";

// ============= 설정 =============
const LOG_PREFIX = "[POP]";
const STATUS_POLL_INTERVAL_MS = 500;

// ============= 상태 관리 =============

interface PopupState {
  roomCode: string | null;
  role: "host" | "joiner" | null;
  isConnected: boolean;
  revision: number;
  statusPollTimer: number | null;
  lastVideoId: string | null;
}

let state: PopupState = {
  roomCode: null,
  role: null,
  isConnected: false,
  revision: 0,
  statusPollTimer: null,
  lastVideoId: null,
};

// ============= 로깅 유틸 =============

function log(...args: any[]): void {
  console.log(LOG_PREFIX, ...args);
  appendDebugInfo(...args);
}

function logError(...args: any[]): void {
  console.error(LOG_PREFIX, ...args);
  appendDebugInfo("ERROR:", ...args);
}

// ============= 디버그 정보 =============

const debugLogs: string[] = [];
const MAX_DEBUG_LOGS = 20;

function appendDebugInfo(...args: any[]): void {
  const message = args
    .map((arg) => {
      if (typeof arg === "string") return arg;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(" ");

  const timestamp = new Date().toLocaleTimeString();
  debugLogs.push(`[${timestamp}] ${message}`);

  if (debugLogs.length > MAX_DEBUG_LOGS) {
    debugLogs.shift();
  }

  updateDebugDisplay();
}

function updateDebugDisplay(): void {
  const debugInfo = document.getElementById("debugInfo");
  if (debugInfo) {
    debugInfo.textContent = debugLogs.join("\n");
    debugInfo.scrollTop = debugInfo.scrollHeight;
  }
}

// ============= DOM 요소 참조 =============

function getElements() {
  return {
    statusDot: document.getElementById("statusDot") as HTMLElement,
    statusText: document.getElementById("statusText") as HTMLElement,
    messageContainer: document.getElementById(
      "messageContainer",
    ) as HTMLElement,
    roomStatusSection: document.getElementById(
      "roomStatusSection",
    ) as HTMLElement,
    createRoomSection: document.getElementById(
      "createRoomSection",
    ) as HTMLElement,
    joinRoomSection: document.getElementById("joinRoomSection") as HTMLElement,
    createRoomBtn: document.getElementById(
      "createRoomBtn",
    ) as HTMLButtonElement,
    joinRoomBtn: document.getElementById("joinRoomBtn") as HTMLButtonElement,
    roomCodeInput: document.getElementById("roomCodeInput") as HTMLInputElement,
    exitRoomBtn: document.getElementById("exitRoomBtn") as HTMLButtonElement,
    roomCodeDisplay: document.getElementById("roomCodeDisplay") as HTMLElement,
  };
}

// ============= UI 업데이트 =============

function updateStatus(): void {
  const els = getElements();

  // 상태 표시
  if (state.isConnected) {
    els.statusDot.className = "status-dot connected";
    els.statusText.textContent = "연결됨";
  } else {
    els.statusDot.className = "status-dot disconnected";
    els.statusText.textContent = "연결 끊김";
  }

  // 방 상태 섹션
  if (state.roomCode) {
    els.roomStatusSection.style.display = "block";
    els.createRoomSection.style.display = "none";
    els.joinRoomSection.style.display = "none";
    els.roomCodeDisplay.textContent = state.roomCode;
  } else {
    els.roomStatusSection.style.display = "none";
    els.createRoomSection.style.display = "block";
    els.joinRoomSection.style.display = "block";
  }

  log("UI 업데이트:", {
    connected: state.isConnected,
    roomCode: state.roomCode,
    role: state.role,
  });
}

function showMessage(
  message: string,
  type: "info" | "success" | "error",
): void {
  const els = getElements();
  const boxClass =
    type === "success"
      ? "success-box"
      : type === "error"
        ? "error-box"
        : "info-box";

  const messageEl = document.createElement("div");
  messageEl.className = boxClass;
  messageEl.textContent = message;

  els.messageContainer.innerHTML = "";
  els.messageContainer.appendChild(messageEl);

  // 3초 후 메시지 제거
  setTimeout(() => {
    if (messageEl.parentElement) {
      messageEl.remove();
    }
  }, 3000);

  log(`[${type.toUpperCase()}] ${message}`);
}

// ============= 영상 ID 추출 =============

/**
 * 현재 활성 탭의 YouTube 영상 ID 추출
 */
async function getCurrentVideoId(): Promise<string | null> {
  try {
    const tabs = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tabs[0] || !tabs[0].url) {
      return null;
    }

    const url = new URL(tabs[0].url);

    if (url.hostname === "www.youtube.com" || url.hostname === "youtube.com") {
      const videoId = url.searchParams.get("v");
      if (videoId) {
        state.lastVideoId = videoId;
        return videoId;
      }
    }

    return null;
  } catch (error) {
    logError("영상 ID 추출 실패:", error);
    return null;
  }
}

// ============= Service Worker 통신 =============

/**
 * Service Worker 상태 요청
 */
async function requestStatus(): Promise<BackgroundToPopupResponse | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "GET_STATUS" } as PopupToBackgroundMessage,
      (response: BackgroundToPopupResponse | undefined) => {
        if (chrome.runtime.lastError) {
          logError("상태 요청 실패:", chrome.runtime.lastError);
          resolve(null);
        } else {
          resolve(response ?? null);
        }
      },
    );
  });
}

/**
 * Service Worker에 CREATE_ROOM 요청
 */
async function createRoom(): Promise<void> {
  const videoId = await getCurrentVideoId();

  if (!videoId) {
    showMessage("YouTube 페이지에서 영상을 선택해주세요.", "error");
    return;
  }

  const els = getElements();
  els.createRoomBtn.disabled = true;
  els.createRoomBtn.textContent = "생성 중...";

  try {
    log("CREATE_ROOM 요청:", videoId);
    await chrome.runtime.sendMessage({
      type: "CREATE_ROOM",
      videoId,
    } as PopupToBackgroundMessage);

    showMessage("새 방을 생성했습니다!", "success");

    // 상태 업데이트
    await new Promise((resolve) => setTimeout(resolve, 500));
    const status = await requestStatus();
    if (status) {
      state = {
        ...state,
        roomCode: status.roomCode,
        role: status.role,
        isConnected: status.isConnected,
        revision: status.revision,
      };
      updateStatus();
    }
  } catch (error) {
    logError("방 생성 실패:", error);
    showMessage("방 생성에 실패했습니다.", "error");
  } finally {
    els.createRoomBtn.disabled = false;
    els.createRoomBtn.textContent = "새 방 생성";
  }
}

/**
 * Service Worker에 JOIN_ROOM 요청
 */
async function joinRoom(): Promise<void> {
  const els = getElements();
  const roomCode = els.roomCodeInput.value.trim().toUpperCase();

  if (!roomCode) {
    showMessage("방 코드를 입력해주세요.", "error");
    return;
  }

  if (roomCode.length !== 8) {
    showMessage("방 코드는 8자여야 합니다.", "error");
    return;
  }

  const videoId = await getCurrentVideoId();

  if (!videoId) {
    showMessage("YouTube 페이지에서 영상을 선택해주세요.", "error");
    return;
  }

  els.joinRoomBtn.disabled = true;
  els.joinRoomBtn.textContent = "참여 중...";

  try {
    log("JOIN_ROOM 요청:", roomCode, videoId);
    await chrome.runtime.sendMessage({
      type: "JOIN_ROOM",
      roomCode,
      videoId,
    } as PopupToBackgroundMessage);

    showMessage(`${roomCode} 방에 참여했습니다!`, "success");

    // 상태 업데이트
    await new Promise((resolve) => setTimeout(resolve, 500));
    const status = await requestStatus();
    if (status) {
      state = {
        ...state,
        roomCode: status.roomCode,
        role: status.role,
        isConnected: status.isConnected,
        revision: status.revision,
      };
      updateStatus();
    }

    els.roomCodeInput.value = "";
  } catch (error) {
    logError("방 참여 실패:", error);
    showMessage("방 참여에 실패했습니다.", "error");
  } finally {
    els.joinRoomBtn.disabled = false;
    els.joinRoomBtn.textContent = "참여";
  }
}

/**
 * 방 나가기
 */
async function exitRoom(): Promise<void> {
  // 현재 구현에서는 단순히 storage 초기화
  // 실제로는 Service Worker와의 통신이 필요할 수 있음
  chrome.storage.local.set({ extensionState: null }, () => {
    state = {
      ...state,
      roomCode: null,
      role: null,
    };
    updateStatus();
    showMessage("방을 나갔습니다.", "info");
  });
}

// ============= 상태 폴링 =============

/**
 * Service Worker 상태를 주기적으로 폴링
 */
async function pollStatus(): Promise<void> {
  try {
    const status = await requestStatus();

    if (status) {
      const changed =
        state.isConnected !== status.isConnected ||
        state.roomCode !== status.roomCode ||
        state.role !== status.role;

      state = {
        ...state,
        isConnected: status.isConnected,
        roomCode: status.roomCode,
        role: status.role,
        revision: status.revision,
      };

      if (changed) {
        updateStatus();
      }
    }
  } catch (error) {
    logError("폴링 중 에러:", error);
  }
}

/**
 * 폴링 시작
 */
function startPolling(): void {
  if (state.statusPollTimer) {
    return;
  }

  log("상태 폴링 시작");
  pollStatus(); // 즉시 실행

  state.statusPollTimer = window.setInterval(() => {
    pollStatus();
  }, STATUS_POLL_INTERVAL_MS);
}

/**
 * 폴링 중지
 */
function stopPolling(): void {
  if (state.statusPollTimer) {
    clearInterval(state.statusPollTimer);
    state.statusPollTimer = null;
    log("상태 폴링 중지");
  }
}

// ============= 이벤트 리스너 =============

function setupEventListeners(): void {
  const els = getElements();

  // 방 생성
  els.createRoomBtn.addEventListener("click", () => {
    createRoom();
  });

  // 방 참여
  els.joinRoomBtn.addEventListener("click", () => {
    joinRoom();
  });

  // 방 나가기
  els.exitRoomBtn.addEventListener("click", () => {
    exitRoom();
  });

  // 방 코드 입력창: Enter로 참여
  els.roomCodeInput.addEventListener("keypress", (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      joinRoom();
    }
  });

  // 방 코드 입력창: 입력 시 참여 버튼 활성화
  els.roomCodeInput.addEventListener("input", () => {
    const roomCode = els.roomCodeInput.value.trim().toUpperCase();
    els.joinRoomBtn.disabled = roomCode.length !== 8;
  });

  log("이벤트 리스너 설정 완료");
}

// ============= 초기화 =============

/**
 * Popup 초기화
 */
async function initialize(): Promise<void> {
  log("Popup 초기화 중...");

  setupEventListeners();
  startPolling();

  // 초기 상태 로드
  await pollStatus();
  updateStatus();

  log("Popup 초기화 완료");
}

// Popup 로드 시 초기화
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    initialize();
  });
} else {
  initialize();
}

// Popup 닫힐 때 폴링 중지
window.addEventListener("unload", () => {
  stopPolling();
});
