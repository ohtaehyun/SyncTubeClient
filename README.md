# SyncTube Chrome Extension

SyncTube는 YouTube 영상을 함께 시청할 때 재생 상태를 실시간으로 맞춰주는 Chrome 확장 프로그램입니다. 방 코드만 공유하면 참여자가 같은 영상과 재생 시점을 이어서 볼 수 있습니다.

[Chrome 웹 스토어에서 SyncTube 설치하기](https://chromewebstore.google.com/detail/synctube/ffgkboflkmabaomcdkcapblgjknfkkjf?hl=ko&gl=DE)

## 핵심 기능

- 현재 시청 중인 YouTube 영상으로 방 생성
- 6자리 코드로 방에 참여하고 동일한 영상으로 이동
- 호스트의 재생, 일시정지, 탐색, 영상 변경을 실시간 동기화
- 방에 연결된 YouTube 탭만 대상으로 이벤트 처리
- 탭 종료 시 방 상태를 정리해 불필요한 동기화 방지

## 기술 구성

- Chrome Extension Manifest V3
- TypeScript, esbuild
- Socket.IO Client 기반 실시간 통신
- Chrome Service Worker, Content Script, `chrome.storage`

## 구조

```text
src/
├── background.ts        # Socket.IO 연결, 방 상태 및 Chrome API 관리
├── content.ts           # YouTube 플레이어 이벤트 감지 및 재생 상태 반영
├── popup.ts             # 방 생성·참여를 위한 팝업 UI 제어
└── shared/types.ts      # 스크립트 간 메시지와 상태 타입

manifest.json            # 확장 프로그램 권한 및 실행 지점 설정
popup.html               # 팝업 UI 마크업
scripts/bundle.js        # 개발·운영 번들 생성
```

실시간 동기화 서버는 [`../SyncTube`](../SyncTube) 저장소에 구현되어 있습니다.

## 실행

```powershell
npm install
npm run build:local
```

Chrome의 `chrome://extensions`에서 개발자 모드를 켠 뒤, **압축해제된 확장 프로그램을 로드합니다**를 선택하여 `SyncTubeClient` 폴더를 불러옵니다.

| 명령 | 설명 |
| --- | --- |
| `npm run build:local` | 로컬 서버(`http://localhost:3000`)를 사용하는 개발 빌드 |
| `npm run dev` | 변경 사항을 감지하는 개발 빌드 |
| `npm run build` | 운영 API를 사용하는 배포 빌드 |
