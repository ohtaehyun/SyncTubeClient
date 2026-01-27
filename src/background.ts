/**
 * Service Worker (Background Script)
 *
 * 역할:
 * 1. Socket.IO 서버 연결 관리
 * 2. 룸 생성/참여 처리
 * 3. 서버 메시지 수신 및 content script로 전달
 * 4. 호스트의 플레이어 이벤트 서버로 전송
 * 5. chrome.storage를 통한 상태 관리
 */

import { io, Socket } from "socket.io-client";
import {
  ClientToServerMessage,
  ServerToClientMessage,
  PopupToBackgroundMessage,
  BackgroundToPopupResponse,
  ContentToBackgroundMessage,
  ExtensionState,
  RoomState,
  ApplyStateMessage,
  HostEventMessage,
} from "./shared/types";

// ============= 설정 =============
const SERVER_URL = "http://localhost:3000"; // Socket.IO 서버 URL
const RECONNECT_DELAY_MS = 1000;
const LOG_PREFIX = "[BG]";

// ============= 상태 관리 =============

interface BackgroundState {
  socket: Socket | null;
  currentRoomCode: string | null;
  role: "host" | "joiner" | null;
  lastRoomState: RoomState | null;
  isConnected: boolean;
  reconnectTimer: number | null;
  lastVideoId: string | null;
}

let state: BackgroundState = {
  socket: null,
  currentRoomCode: null,
  role: null,
  lastRoomState: null,
  isConnected: false,
  reconnectTimer: null,
  lastVideoId: null,
};

// ============= 로깅 유틸 =============

function log(...args: any[]): void {
  console.log(LOG_PREFIX, ...args);
}

function logError(...args: any[]): void {
  console.error(LOG_PREFIX, ...args);
}

// ============= Socket.IO 관리 =============

/**
 * Socket.IO 연결 초기화
 */
function connectSocket(): void {
  if (state.socket && state.socket.connected) {
    return; // 이미 연결 중
  }

  log("Socket.IO 연결 시도:", SERVER_URL);

  try {
    state.socket = io(SERVER_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: RECONNECT_DELAY_MS,
    });

    state.socket.on("connect", () => {
      log("Socket.IO 연결 성공");
      state.isConnected = true;
      updateStorageState();
      clearReconnectTimer();

      // 기존 방이 있으면 재입장
      if (
        state.currentRoomCode &&
        state.lastVideoId &&
        state.role === "joiner"
      ) {
        sendToServer({
          type: "JOIN_ROOM",
          roomCode: state.currentRoomCode,
          videoId: state.lastVideoId,
        });
        log("기존 방에 재입장:", state.currentRoomCode);
      }
    });

    // 서버 메시지 리스너
    state.socket.on("ROOM_CREATED", (data: any) => {
      handleServerMessage({ type: "ROOM_CREATED", ...data });
    });

    state.socket.on("ROOM_STATE", (data: any) => {
      handleServerMessage({ type: "ROOM_STATE", ...data });
    });

    state.socket.on("STATE_PATCH", (data: any) => {
      handleServerMessage({ type: "STATE_PATCH", ...data });
    });

    state.socket.on("disconnect", (reason: string) => {
      log("Socket.IO 연결 종료:", reason);
      state.isConnected = false;
      updateStorageState();
      if (reason === "io server disconnect") {
        // 서버가 연결을 끊은 경우 수동 재연결
        scheduleReconnect();
      }
    });

    state.socket.on("connect_error", (error: Error) => {
      logError("Socket.IO 연결 에러:", error);
      state.isConnected = false;
      updateStorageState();
    });

    state.socket.on("error", (error: any) => {
      logError("Socket.IO 에러:", error);
    });
  } catch (error) {
    logError("Socket.IO 생성 실패:", error);
    scheduleReconnect();
  }
}

/**
 * 재연결 스케줄링
 */
function scheduleReconnect(): void {
  if (state.reconnectTimer) {
    return; // 이미 스케줄됨
  }

  log("재연결 예약:", RECONNECT_DELAY_MS, "ms 후");
  state.reconnectTimer = window.setTimeout(() => {
    state.reconnectTimer = null;
    connectSocket();
  }, RECONNECT_DELAY_MS);
}

/**
 * 재연결 타이머 취소
 */
function clearReconnectTimer(): void {
  if (state.reconnectTimer !== null) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }
}

/**
 * 서버로 메시지 전송
 */
function sendToServer(message: ClientToServerMessage): void {
  if (!state.socket || !state.socket.connected) {
    logError("Socket.IO 연결 상태 불일치, 메시지 전송 불가:", message);
    return;
  }

  try {
    // Socket.IO 이벤트로 전송
    state.socket.emit(message.type, message);
    log("서버로 메시지 전송:", message);
  } catch (error) {
    logError("메시지 전송 실패:", error);
  }
}

// ============= 서버 메시지 핸들링 =============

/**
 * 서버 메시지 처리
 */
async function handleServerMessage(
  message: ServerToClientMessage,
): Promise<void> {
  switch (message.type) {
    case "ROOM_CREATED":
      handleRoomCreated(message);
      break;

    case "ROOM_STATE":
      await handleRoomState(message);
      break;

    case "STATE_PATCH":
      await handleStatePatch(message);
      break;

    default:
      logError("알 수 없는 메시지 타입:", message);
  }
}

/**
 * 방 생성 응답 처리
 */
function handleRoomCreated(message: { roomCode: string }): void {
  log("방 생성 완료, roomCode:", message.roomCode);
  state.currentRoomCode = message.roomCode;
  state.role = "host";
  updateStorageState();
  notifyPopup();
}

/**
 * 방 상태 메시지 처리
 */
async function handleRoomState(message: any): Promise<void> {
  log("ROOM_STATE 수신:", message);

  const roomState: RoomState = {
    roomCode: message.roomCode,
    videoId: message.videoId,
    isPlaying: message.isPlaying,
    anchorTime: message.anchorTime,
    anchorTs: message.anchorTs,
    revision: message.revision,
  };

  state.lastRoomState = roomState;
  state.currentRoomCode = message.roomCode;
  updateStorageState();

  // Content Script에 상태 적용 요청
  await applyStateToContent({
    type: "APPLY_STATE",
    isPlaying: message.isPlaying,
    anchorTime: message.anchorTime,
    anchorTs: message.anchorTs,
    revision: message.revision,
  });

  notifyPopup();
}

/**
 * 상태 변경 패치 처리
 */
async function handleStatePatch(message: any): Promise<void> {
  log("STATE_PATCH 수신:", message);

  if (state.lastRoomState) {
    state.lastRoomState.isPlaying = message.isPlaying;
    state.lastRoomState.anchorTime = message.anchorTime;
    state.lastRoomState.anchorTs = message.anchorTs;
    state.lastRoomState.revision = message.revision;
    updateStorageState();
  }

  // Content Script에 상태 적용 요청
  await applyStateToContent({
    type: "APPLY_STATE",
    isPlaying: message.isPlaying,
    anchorTime: message.anchorTime,
    anchorTs: message.anchorTs,
    revision: message.revision,
  });

  notifyPopup();
}

// ============= Content Script 통신 =============

/**
 * Content Script가 있는 활성 YouTube 탭 찾기
 */
async function getYouTubeTab(): Promise<chrome.tabs.Tab | null> {
  try {
    const tabs = await chrome.tabs.query({
      url: "https://www.youtube.com/*",
      active: false, // 모든 YouTube 탭 검색
    });

    if (tabs.length > 0) {
      return tabs[0]; // 첫 번째 YouTube 탭
    }

    return null;
  } catch (error) {
    logError("YouTube 탭 조회 실패:", error);
    return null;
  }
}

/**
 * Content Script로 상태 적용 메시지 전송
 */
async function applyStateToContent(message: ApplyStateMessage): Promise<void> {
  const tab = await getYouTubeTab();

  if (!tab || !tab.id) {
    logError("활성 YouTube 탭을 찾을 수 없음");
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, message);
    log("Content Script로 메시지 전송 완료");
  } catch (error) {
    logError("Content Script 메시지 전송 실패:", error);
  }
}

// ============= Popup 통신 =============

/**
 * Popup의 CREATE_ROOM 요청 처리
 */
function handleCreateRoom(videoId: string): void {
  log("CREATE_ROOM 요청:", videoId);

  state.currentRoomCode = null;
  state.role = "host";
  state.lastVideoId = videoId;
  updateStorageState();

  sendToServer({
    type: "CREATE_ROOM",
    videoId,
  });
}

/**
 * Popup의 JOIN_ROOM 요청 처리
 */
function handleJoinRoom(roomCode: string, videoId: string): void {
  log("JOIN_ROOM 요청:", roomCode, videoId);

  state.currentRoomCode = roomCode;
  state.role = "joiner";
  state.lastVideoId = videoId;
  updateStorageState();

  sendToServer({
    type: "JOIN_ROOM",
    roomCode,
    videoId,
  });
}

/**
 * Popup으로 상태 응답
 */
function getStatus(): BackgroundToPopupResponse {
  return {
    type: "STATUS",
    roomCode: state.currentRoomCode,
    role: state.role,
    isConnected: state.isConnected,
    revision: state.lastRoomState?.revision ?? 0,
  };
}

/**
 * Popup에 상태 변경 알림
 */
async function notifyPopup(): Promise<void> {
  try {
    const popupWindows = await chrome.windows.getAll({
      windowTypes: ["popup"],
    });

    if (popupWindows.length > 0) {
      const response = getStatus();
      console.log("Popup에 상태 전송:", response);
      // Popup 리스너가 상태를 요청할 때마다 응답하므로 여기서는 로그만
    }
  } catch (error) {
    logError("Popup 알림 실패:", error);
  }
}

// ============= Content Script → Background 메시지 처리 =============

/**
 * Content Script의 PLAYER_EVENT 처리
 */
function handlePlayerEvent(message: any): void {
  if (!state.currentRoomCode || state.role !== "host") {
    return; // 호스트만 처리
  }

  log("PLAYER_EVENT 수신:", message);

  const hostEvent: HostEventMessage = {
    type: "HOST_EVENT",
    roomCode: state.currentRoomCode,
    event: message.event,
    currentTime: message.currentTime,
  };

  sendToServer(hostEvent);
}

// ============= 메시지 리스너 =============

/**
 * Runtime 메시지 리스너 (Popup과 Content Script)
 */
chrome.runtime.onMessage.addListener(
  (
    message: PopupToBackgroundMessage | ContentToBackgroundMessage | any,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: any) => void,
  ) => {
    log("메시지 수신:", message, "from", sender.url);

    try {
      // Popup에서의 메시지
      if (message.type === "CREATE_ROOM") {
        handleCreateRoom(message.videoId);
        sendResponse({ success: true });
        return;
      }

      if (message.type === "JOIN_ROOM") {
        handleJoinRoom(message.roomCode, message.videoId);
        sendResponse({ success: true });
        return;
      }

      if (message.type === "GET_STATUS") {
        const response = getStatus();
        sendResponse(response);
        return;
      }

      // Content Script에서의 메시지
      if (message.type === "PLAYER_EVENT") {
        handlePlayerEvent(message);
        sendResponse({ success: true });
        return;
      }

      // 알 수 없는 메시지 타입
      log("알 수 없는 메시지 타입:", message.type);
      sendResponse({ success: false, error: "Unknown message type" });
    } catch (error) {
      logError("메시지 처리 중 에러:", error);
      sendResponse({ success: false, error: String(error) });
    }
  },
);

// ============= 상태 저장/로드 =============

/**
 * 상태를 chrome.storage.local에 저장
 */
function updateStorageState(): void {
  const extensionState: ExtensionState = {
    roomCode: state.currentRoomCode,
    role: state.role,
    lastState: state.lastRoomState,
    isConnected: state.isConnected,
  };

  chrome.storage.local.set({ extensionState }, () => {
    log("상태 저장 완료");
  });
}

/**
 * chrome.storage.local에서 상태 로드
 */
async function loadStorageState(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      ["extensionState"],
      (result: { extensionState?: ExtensionState }) => {
        if (result.extensionState) {
          const saved = result.extensionState;
          state.currentRoomCode = saved.roomCode;
          state.role = saved.role;
          state.lastRoomState = saved.lastState;
          log("저장된 상태 로드 완료:", saved);
        } else {
          log("저장된 상태 없음");
        }
        resolve();
      },
    );
  });
}

// ============= 초기화 =============

/**
 * Service Worker 활성화
 */
async function initialize(): Promise<void> {
  log("Service Worker 초기화 중...");

  // 저장된 상태 로드
  await loadStorageState();

  // Socket.IO 연결 시작
  connectSocket();

  log("Service Worker 초기화 완료");
}

// Service Worker 로드 시 초기화
initialize().catch((error) => {
  logError("초기화 실패:", error);
});
