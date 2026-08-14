/**
 * 공유 메시지 타입 정의
 * Service Worker ↔ Content Script ↔ Popup 간 통신에 사용
 */

// ============= Enums =============

export enum ROLE {
  HOST = "HOST",
  JOINER = "JOINER",
}

export enum MESSAGE_TYPE {
  CREATE_ROOM = "CREATE_ROOM",
  LEAVE_ROOM = "LEAVE_ROOM",
  JOIN_ROOM = "JOIN_ROOM",
  HOST_EVENT = "HOST_EVENT",
  CHANGE_VIDEO = "CHANGE_VIDEO",
  ROOM_STATE = "ROOM_STATE",
  STATE_PATCH = "STATE_PATCH",
  VIDEO_CHANGED = "VIDEO_CHANGED",
  ROOM_CLOSED = "ROOM_CLOSED",
  GET_STATUS = "GET_STATUS",
  STATUS = "STATUS",
  APPLY_STATE = "APPLY_STATE",
  PLAYER_EVENT = "PLAYER_EVENT",
  GET_VIDEO_ID = "GET_VIDEO_ID",
}

// ============= 서버 ↔ 클라이언트 메시지 타입 =============

/** 클라이언트가 서버로 보내는 메시지 타입 */
export type ClientToServerMessage =
  | CreateRoomMessage
  | LeaveRoomMessage
  | JoinRoomMessage
  | HostEventMessage
  | ChangeVideoMessage;

/** 서버가 클라이언트로 보내는 메시지 타입 */
export type ServerToClientMessage =
  | RoomStateMessage
  | StatePatchMessage
  | RoomClosedMessage;

export interface CreateRoomMessage {
  type: MESSAGE_TYPE.CREATE_ROOM;
  videoId: string;
  isPlaying: boolean;
  currentTime: number;
}

export interface LeaveRoomMessage {
  type: MESSAGE_TYPE.LEAVE_ROOM;
  code: string;
}

export interface JoinRoomMessage {
  type: MESSAGE_TYPE.JOIN_ROOM;
  code: string;
}

export interface HostEventMessage {
  type: MESSAGE_TYPE.HOST_EVENT;
  code: string;
  event: "PLAY" | "PAUSE" | "SEEK";
  currentTime: number;
}

export interface RoomStateMessage {
  type: MESSAGE_TYPE.ROOM_STATE;
  code: string;
  videoId: string;
  isPlaying: boolean;
  anchorTime: number; // 기준 재생 시간(초)
  anchorTs: number; // 기준 타임스탬프(밀리초)
  revision: number;
}

export interface StatePatchMessage {
  type: MESSAGE_TYPE.STATE_PATCH;
  code: string;
  isPlaying: boolean;
  anchorTime: number;
  anchorTs: number;
  revision: number;
}

export interface ChangeVideoMessage {
  type: MESSAGE_TYPE.CHANGE_VIDEO;
  code: string;
  videoId: string;
  currentTime: number;
  isPlaying: boolean;
}

export interface RoomClosedMessage {
  type: MESSAGE_TYPE.ROOM_CLOSED;
  code: string;
  reason: string;
}

// ============= 익스텐션 내부 메시지 타입 =============

/** Popup → Service Worker */
export type PopupToBackgroundMessage =
  | CreateRoomRequest
  | LeaveRoomRequest
  | JoinRoomRequest
  | GetStatusRequest;

export interface CreateRoomRequest {
  type: MESSAGE_TYPE.CREATE_ROOM;
  videoId: string;
  isPlaying: boolean;
  currentTime: number;
  tabId?: number;
}

export interface LeaveRoomRequest {
  type: MESSAGE_TYPE.LEAVE_ROOM;
  code: string;
}

export interface JoinRoomRequest {
  type: MESSAGE_TYPE.JOIN_ROOM;
  code: string;
  tabId?: number;
}

export interface GetStatusRequest {
  type: MESSAGE_TYPE.GET_STATUS;
}

/** Service Worker → Popup (응답) */
export interface StatusResponse {
  type: MESSAGE_TYPE.STATUS;
  code: string | null;
  role: ROLE | null;
  isConnected: boolean;
  revision: number;
}

export interface CreateRoomResponse {
  success: boolean;
  code?: string;
  error?: string;
}

export interface JoinRoomResponse {
  success: boolean;
  code?: string;
  videoId?: string;
  url?: string;
  currentTime?: number;
  isPlaying?: boolean;
  error?: string;
}

/** Service Worker → Content Script */
export type BackgroundToContentMessage = ApplyStateMessage;

export interface ApplyStateMessage {
  type: MESSAGE_TYPE.APPLY_STATE;
  isPlaying: boolean;
  anchorTime: number;
  anchorTs: number;
  revision: number;
}

/** Content Script → Service Worker */
export type ContentToBackgroundMessage = PlayerEventMessage | GetVideoIdRequest;

export interface PlayerEventMessage {
  type: MESSAGE_TYPE.PLAYER_EVENT;
  code: string;
  event: "PLAY" | "PAUSE" | "SEEK";
  currentTime: number;
}

export interface GetVideoIdRequest {
  type: MESSAGE_TYPE.GET_VIDEO_ID;
}

// ============= 상태 타입 =============

export interface RoomState {
  code: string;
  videoId: string;
  isPlaying: boolean;
  anchorTime: number;
  anchorTs: number;
  revision: number;
}

export interface ExtensionState {
  code: string | null;
  role: ROLE | null;
  lastState: RoomState | null;
  isConnected: boolean;
}
