# SyncTube - Chrome Extension for Synchronized YouTube Watching

YouTube 영상을 여러 사람과 실시간으로 동기화하면서 함께 볼 수 있는 Chrome 확장 프로그램입니다. WebSocket 기반의 NestJS 서버와 통신하며, Manifest V3를 따릅니다.

## 📋 기능

- **방 생성**: 현재 시청 중인 YouTube 영상을 공유할 새 방 생성
- **방 참여**: 방 코드를 통해 다른 사용자가 생성한 방에 참여
- **실시간 동기화**: 재생/일시정지/시크 상태를 모든 참여자와 실시간으로 동기화
- **정확한 시간 계산**: 서버의 timestamp를 기반으로 네트워크 지연을 보정한 정확한 재생 위치 계산
- **적응형 동기화**: 시간 차이에 따라 부드러운 조정부터 즉시 보정까지 다단계 동기화
- **자동 재연결**: WebSocket 연결이 끊어지면 자동으로 재연결 시도

## 🏗️ 프로젝트 구조

```
SyncTubeClient/
├── manifest.json              # Chrome Extension 설정
├── popup.html                 # Popup UI
├── tsconfig.json              # TypeScript 설정
├── package.json               # 의존성 관리
├── scripts/
│   ├── build.js              # TypeScript 컴파일 스크립트
│   └── build.sh              # 빌드 shell 스크립트
├── src/
│   ├── background.ts         # Service Worker - WebSocket 관리
│   ├── content.ts            # Content Script - YouTube 플레이어 제어
│   ├── popup.ts              # Popup UI 로직
│   └── shared/
│       └── types.ts          # 공유 메시지 타입 정의
└── dist/                      # 컴파일된 JavaScript (빌드 후 생성)
    ├── background.js
    ├── content.js
    ├── popup.js
    └── shared/
        └── types.js
```

## 🔧 아키텍처

### 컴포넌트 구조

```
┌─────────────────────────────────────────────────────────┐
│                    YouTube 페이지                        │
│  ┌─────────────────────────────────────────────────────┐│
│  │          Content Script (content.ts)                ││
│  │  - <video> 엘리먼트 접근                             ││
│  │  - 재생/일시정지/시크 제어                           ││
│  │  - 상태 동기화 규칙 적용                             ││
│  └────────┬──────────────────────────────────┬─────────┘│
└───────────┼──────────────────────────────────┼──────────┘
            │ chrome.runtime.sendMessage       │
            │                                  │
┌───────────┼──────────────────────────────────┼──────────┐
│           │   Service Worker                 │          │
│  ┌────────▼──────────────────────────────────▼────────┐ │
│  │       Background (background.ts)                   │ │
│  │  - WebSocket 연결 관리                             │ │
│  │  - 방 생성/참여 처리                               │ │
│  │  - 메시지 라우팅                                   │ │
│  │  - chrome.storage로 상태 저장                      │ │
│  └──────────────┬───────────────────────────┬────────┘ │
└─────────────────┼───────────────────────────┼───────────┘
                  │ chrome.tabs.sendMessage   │
                  │                           │
          ┌───────▼───────────────────────────▼──┐
          │     Popup (popup.ts)                 │
          │  - Create/Join Room UI               │
          │  - 상태 표시                         │
          │  - 디버그 정보                       │
          └──────────────────────────────────────┘
                  │
                  │ chrome.runtime.sendMessage
                  │
          ┌───────▼────────────────────┐
          │  NestJS WebSocket Server   │
          │  (wss://localhost:3000)    │
          └────────────────────────────┘
```

### 통신 흐름

**1. 방 생성 (호스트)**

```
Popup → Background: { type: "CREATE_ROOM", videoId: "..." }
Background → Server: { type: "CREATE_ROOM", videoId: "..." }
Server → Background: { type: "ROOM_CREATED", roomCode: "ABC12345" }
```

**2. 방 참여 (조이너)**

```
Popup → Background: { type: "JOIN_ROOM", roomCode: "ABC12345", videoId: "..." }
Background → Server: { type: "JOIN_ROOM", roomCode: "ABC12345", videoId: "..." }
Server → Background: { type: "ROOM_STATE", ... }
Background → Content: { type: "APPLY_STATE", ... }
```

**3. 상태 동기화 (호스트 조작)**

```
User controls YouTube player
Content Script → Background: { type: "PLAYER_EVENT", event: "PLAY|PAUSE|SEEK", ... }
Background → Server: { type: "HOST_EVENT", ... }
Server → All Clients: { type: "STATE_PATCH", ... }
Background → Content: { type: "APPLY_STATE", ... }
```

## 🚀 설치 및 테스트

### 사전 요구사항

- Node.js 16 이상
- Chrome 브라우저 (또는 Chromium 기반)
- TypeScript 컴파일러

### 설치 단계

#### 1. 저장소 클론 및 의존성 설치

```bash
# 이 리포지토리를 클론하거나 다운로드
cd SyncTubeClient

# 의존성 설치
npm install
```

#### 2. TypeScript 컴파일

```bash
# 한 번만 컴파일
npm run build

# Watch 모드로 계속 컴파일 (개발 중 권장)
npm run dev
```

컴파일 후 `dist/` 디렉토리에 JavaScript 파일이 생성됩니다.

#### 3. Chrome에 확장 프로그램 로드

1. Chrome 주소창에 `chrome://extensions` 입력
2. **개발자 모드** 활성화 (우측 상단 토글)
3. **압축해제된 확장 프로그램 로드** 버튼 클릭
4. 이 프로젝트의 **루트 디렉토리** 선택
   - `manifest.json`이 있는 폴더를 선택해야 합니다.

#### 4. 서버 실행 (로컬 테스트)

로컬에서 테스트하려면 NestJS WebSocket 서버가 필요합니다.

```bash
# 별도의 터미널에서 NestJS 서버 실행
# 프로젝트: https://github.com/ohtaehyun/SyncTubeServer
cd SyncTubeServer
npm install
npm run start
```

**기본 WebSocket URL**: `wss://localhost:3000/ws`

URL을 변경하려면 `src/background.ts`의 `WS_URL` 상수를 수정하고 다시 컴파일하세요.

#### 5. 확장 프로그램 테스트

1. YouTube 영상 페이지 방문: `https://www.youtube.com/watch?v=...`
2. Chrome 우측 상단의 확장 프로그램 아이콘 클릭
3. SyncTube Popup 열기
4. **새 방 생성** 또는 **기존 방 코드로 참여** 선택

## 🔍 디버깅

### 브라우저 콘솔에서 로그 보기

각 컴포넌트는 접두사와 함께 로그를 출력합니다:

- `[BG]` - Service Worker (Background)
- `[CS]` - Content Script
- `[POP]` - Popup

#### Service Worker 로그 확인

1. `chrome://extensions` 열기
2. SyncTube 확장 프로그램 찾기
3. **서비스 워커** 클릭
4. 개발자 도구 콘솔 확인

#### Content Script 로그 확인

1. YouTube 페이지에서 F12 또는 우클릭 → 검사
2. 개발자 도구 콘솔 탭에서 `[CS]` 필터링

#### Popup 로그 확인

1. SyncTube Popup 열기
2. 하단의 "디버그 정보" 항목 펼치기
3. 최근 20개의 로그 메시지 확인

### 커먼 이슈 해결

**문제**: WebSocket 연결 실패

```
해결:
1. 서버가 wss://localhost:3000/ws에서 실행 중인지 확인
2. 자체 서명 인증서 사용 시 브라우저 설정에서 허용
3. WS_URL을 올바른 서버 주소로 수정
```

**문제**: Content Script 로그가 보이지 않음

```
해결:
1. YouTube 페이지가 완전히 로드되었는지 확인
2. 다른 YouTube 탭이 많으면 첫 번째 탭에서 시도
3. 확장 프로그램 재로드 (chrome://extensions에서)
```

**문제**: Popup에서 "YouTube 페이지에서 영상을 선택해주세요" 메시지

```
해결:
1. YouTube.com 도메인에 있는지 확인
2. 올바른 영상 페이지인지 확인 (URL에 ?v=... 있어야 함)
3. 확장 프로그램 권한이 설정되어 있는지 확인
```

### 개발자 모드 팁

- **manifest 수정 후**: 확장 프로그램 재로드 필요 (`chrome://extensions` → 새로고침)
- **TypeScript 수정 후**: 컴파일 → 확장 프로그램 재로드
- **Storage 초기화**: DevTools → Application → Storage → Local Storage 에서 확인/삭제

## 📡 서버 프로토콜

### 클라이언트 → 서버 메시지

#### CREATE_ROOM

```typescript
{
  "type": "CREATE_ROOM",
  "videoId": "dQw4w9WgXcQ"
}
```

#### JOIN_ROOM

```typescript
{
  "type": "JOIN_ROOM",
  "roomCode": "ABCD1234",
  "videoId": "dQw4w9WgXcQ"
}
```

#### HOST_EVENT

```typescript
{
  "type": "HOST_EVENT",
  "roomCode": "ABCD1234",
  "event": "PLAY" | "PAUSE" | "SEEK",
  "currentTime": 123.45
}
```

### 서버 → 클라이언트 메시지

#### ROOM_CREATED

```typescript
{
  "type": "ROOM_CREATED",
  "roomCode": "ABCD1234"
}
```

#### ROOM_STATE

```typescript
{
  "type": "ROOM_STATE",
  "roomCode": "ABCD1234",
  "videoId": "dQw4w9WgXcQ",
  "isPlaying": true,
  "anchorTime": 120.0,
  "anchorTs": 1700000000000,
  "revision": 12
}
```

#### STATE_PATCH

```typescript
{
  "type": "STATE_PATCH",
  "roomCode": "ABCD1234",
  "isPlaying": false,
  "anchorTime": 130.0,
  "anchorTs": 1700000001000,
  "revision": 13
}
```

## 🔄 동기화 알고리즘

### 정답 시간 계산

서버가 보낸 `anchorTime`과 `anchorTs`를 기반으로 현재 올바른 재생 위치를 계산합니다:

```javascript
const nowTs = Date.now();
const targetTime = isPlaying
  ? anchorTime + (nowTs - anchorTs) / 1000 // 플레이 중: 시간 경과 반영
  : anchorTime; // 일시정지: 고정
```

### 시간 보정 규칙

로컬 `video.currentTime`과 `targetTime`의 차이에 따라:

| 차이 범위      | 동작          | 설명                                 |
| -------------- | ------------- | ------------------------------------ |
| < 0.15초       | 그대로        | 오차 범위 내, 자연스러운 플레이 유지 |
| 0.15초 - 0.8초 | 부드러운 조정 | `currentTime` 설정하여 조정          |
| ≥ 0.8초        | 즉시 보정     | 큰 차이, 빠르게 바꿈                 |

### 재생 상태 동기화

```javascript
if (isPlaying && video.paused) {
  await video.play(); // 재생 시작 (실패 가능성 처리)
} else if (!isPlaying && !video.paused) {
  video.pause(); // 일시정지
}
```

## 🔐 권한 (Permissions)

이 확장 프로그램이 사용하는 최소한의 권한:

- `storage` - 방 코드, 역할 등 상태 저장
- `tabs` - YouTube 탭 조회
- `host_permissions: https://www.youtube.com/*` - YouTube 페이지 접근 (WebSocket은 별도 host permission 불필요)

## 🚧 구현 세부사항

### Background Service Worker (`src/background.ts`)

- **WebSocket 관리**: 서버 연결 초기화, 에러 처리, 자동 재연결
- **메시지 라우팅**: Popup 요청 → 서버, 서버 응답 → Content Script
- **상태 관리**: `chrome.storage.local`에 방 정보, 역할, 마지막 상태 저장
- **재연결 로직**: 연결 종료 시 1초 후 재시도

### Content Script (`src/content.ts`)

- **Video 요소 접근**: YouTube SPA 대응으로 최대 10회 재시도 (500ms 간격)
- **동기화 적용**: APPLY_STATE 메시지 수신 → 동기화 알고리즘 실행
- **이벤트 감지** (선택): 호스트 조작 이벤트 감지 → Background로 전송
- **캐시 관리**: YouTube 네비게이션 감지 시 video 캐시 초기화

### Popup UI (`src/popup.ts`)

- **방 생성**: 현재 YouTube 영상 ID 추출 후 요청
- **방 참여**: 사용자 입력 방 코드 검증 및 요청
- **상태 폴링**: 500ms마다 Background 상태 조회
- **디버그 정보**: 최근 20개 로그 메시지 표시

## 📝 코드 구조 및 주석

모든 파일에는 다음과 같은 섹션이 있습니다:

1. **파일 설명** - 역할과 책임
2. **설정** - 상수 정의
3. **상태 관리** - 인터페이스와 상태 변수
4. **로깅 유틸** - 디버깅용 로그 함수
5. **주요 로직** - 기능별 함수 구현
6. **초기화** - 시작 코드

## 🔮 다음 개선 사항 (TODO)

### 네트워크/성능

- [ ] **더 나은 드리프트 보정**
  - 현재: 일정 간격으로 폴링하여 상태 동기화
  - 개선: 예측 모델 추가, 재생 속도 미세 조정으로 부드러운 동기화
- [ ] **적응형 동기화 임계값**
  - 현재: 고정된 0.15s, 0.8s 임계값
  - 개선: 네트워크 지연과 버퍼링 상태에 따라 동적 조정

### YouTube 호환성

- [ ] **광고 처리**
  - 현재: 광고 영상 중 재생 상태 동기화
  - 개선: 광고 감지 후 스킵, 메인 영상만 동기화
- [ ] **버퍼링 상태 감지**
  - 현재: 버퍼링 중에도 동기화 시도
  - 개선: `video.readyState` 확인, 버퍼링 상태 공유
- [ ] **영상 전환 처리**
  - 현재: 수동으로 캐시 초기화
  - 개선: 자동 감지, seamless 전환

### UI/UX

- [ ] **방 코드 복사 버튼**
- [ ] **방 참여자 목록 표시**
- [ ] **재생 위치 시각화** (동기화 상태 바)
- [ ] **설정 패널** (서버 URL, 동기화 민감도 조정)

### 안정성

- [ ] **에러 복구 메커니즘**
  - 서버 재시작 시 자동 재연결
  - 네트워크 불안정 시 우아한 성능 저하
- [ ] **로그 레벨 설정**
  - 프로덕션: 에러만 기록
  - 디버그: 모든 메시지 기록
- [ ] **타임아웃 처리**
  - WebSocket 핸드셰이크 타임아웃
  - 방 참여 요청 타임아웃

### 기능 확장

- [ ] **매니페스트 추가**
  - 자막 동기화
  - 플레이어 설정 (배속) 동기화
- [ ] **음성/채팅 기능**
  - WebRTC를 통한 음성 통화
  - 텍스트 채팅 UI
- [ ] **녹화 및 타임스탬프 공유**
  - 특정 장면 북마크
  - 타임스탐프가 있는 댓글

## 📚 참고 자료

- [Chrome Extension Manifest V3 문서](https://developer.chrome.com/docs/extensions/mv3/)
- [Service Worker API](https://developer.chrome.com/docs/extensions/mv3/service_workers/)
- [Content Script 가이드](https://developer.chrome.com/docs/extensions/mv3/content_scripts/)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference)

## 📄 라이선스

MIT

## 🤝 기여

버그 리포트, 기능 제안, Pull Request를 환영합니다!

---

**마지막 업데이트**: 2026년 1월 25일
**상태**: MVP (최소 동작 버전) ✅
