/**
 * 공유 메시지 타입 정의
 * Service Worker ↔ Content Script ↔ Popup 간 통신에 사용
 */

// ============= 서버 ↔ 클라이언트 메시지 타입 =============

/** 클라이언트가 서버로 보내는 메시지 타입 */
export type ClientToServerMessage =
  | CreateRoomMessage
  | JoinRoomMessage
  | HostEventMessage;

/** 서버가 클라이언트로 보내는 메시지 타입 */
export type ServerToClientMessage =
  | RoomCreatedMessage
  | RoomStateMessage
  | StatePatchMessage;

export interface CreateRoomMessage {
  type: "CREATE_ROOM";
  videoId: string;
}

export interface JoinRoomMessage {
  type: "JOIN_ROOM";
  roomCode: string;
  videoId: string;
}

export interface HostEventMessage {
  type: "HOST_EVENT";
  roomCode: string;
  event: "PLAY" | "PAUSE" | "SEEK";
  currentTime: number;
}

export interface RoomCreatedMessage {
  type: "ROOM_CREATED";
  roomCode: string;
}

export interface RoomStateMessage {
  type: "ROOM_STATE";
  roomCode: string;
  videoId: string;
  isPlaying: boolean;
  anchorTime: number; // 기준 재생 시간(초)
  anchorTs: number; // 기준 타임스탬프(밀리초)
  revision: number;
}

export interface StatePatchMessage {
  type: "STATE_PATCH";
  roomCode: string;
  isPlaying: boolean;
  anchorTime: number;
  anchorTs: number;
  revision: number;
}

// ============= 익스텐션 내부 메시지 타입 =============

/** Popup → Service Worker */
export type PopupToBackgroundMessage =
  | CreateRoomRequest
  | JoinRoomRequest
  | GetStatusRequest;

export interface CreateRoomRequest {
  type: "CREATE_ROOM";
  videoId: string;
}

export interface JoinRoomRequest {
  type: "JOIN_ROOM";
  roomCode: string;
  videoId: string;
}

export interface GetStatusRequest {
  type: "GET_STATUS";
}

/** Service Worker → Popup (응답) */
export type BackgroundToPopupResponse = StatusResponse;

export interface StatusResponse {
  type: "STATUS";
  roomCode: string | null;
  role: "host" | "joiner" | null;
  isConnected: boolean;
  revision: number;
}

/** Service Worker → Content Script */
export type BackgroundToContentMessage = ApplyStateMessage;

export interface ApplyStateMessage {
  type: "APPLY_STATE";
  isPlaying: boolean;
  anchorTime: number;
  anchorTs: number;
  revision: number;
}

/** Content Script → Service Worker */
export type ContentToBackgroundMessage = PlayerEventMessage | GetVideoIdRequest;

export interface PlayerEventMessage {
  type: "PLAYER_EVENT";
  roomCode: string;
  event: "PLAY" | "PAUSE" | "SEEK";
  currentTime: number;
}

export interface GetVideoIdRequest {
  type: "GET_VIDEO_ID";
}

// ============= 상태 타입 =============

export interface RoomState {
  roomCode: string;
  videoId: string;
  isPlaying: boolean;
  anchorTime: number;
  anchorTs: number;
  revision: number;
}

export interface ExtensionState {
  roomCode: string | null;
  role: "host" | "joiner" | null;
  lastState: RoomState | null;
  isConnected: boolean;
}
