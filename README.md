# SyncTube Chrome Extension

SyncTube는 여러 사람이 같은 YouTube 영상을 함께 볼 수 있도록 재생 상태를 동기화하는 Chrome Manifest V3 확장 프로그램입니다.

[Chrome 웹 스토어에서 SyncTube 설치하기](https://chromewebstore.google.com/detail/synctube/ffgkboflkmabaomcdkcapblgjknfkkjf?hl=ko&gl=DE)

## 주요 기능

- 현재 YouTube 영상으로 방 생성
- 6자리 방 코드로 참여하고 동일 영상으로 이동
- 호스트의 재생, 일시정지, 탐색 및 영상 변경을 실시간 동기화
- 동기화 대상인 방 탭을 추적하여 다른 YouTube 탭의 이벤트 무시
- 방 탭을 닫으면 참가자는 자동 퇴장하고, 호스트는 방을 종료
- 서비스 워커가 연결 상태와 방 정보를 `chrome.storage`에 저장

## 프로젝트 구조

```text
src/
├── background.ts        # Socket.IO 연결, 방 상태 및 Chrome API 관리
├── content.ts           # YouTube 플레이어 이벤트 감지·재생 상태 적용
├── popup.ts             # 확장 프로그램 팝업 UI와 방 생성·참여 처리
└── shared/types.ts      # 스크립트 간 메시지와 상태 타입

manifest.json            # Manifest V3 권한, 서비스 워커, 콘텐츠 스크립트 설정
popup.html               # 팝업 화면 마크업
scripts/bundle.js        # esbuild 기반 개발·운영 번들 생성
assets/icons/            # 확장 프로그램 아이콘
store-assets/            # Chrome 웹 스토어 등록용 스크린샷
```

실시간 동기화 서버는 인접 저장소 [`../SyncTube`](../SyncTube)에 있습니다.

## 설치 및 실행

```powershell
npm install
npm run build:local
```

Chrome에서 다음 순서로 로컬 빌드를 불러옵니다.

1. `chrome://extensions`를 엽니다.
2. 개발자 모드를 켭니다.
3. **압축해제된 확장 프로그램을 로드합니다**를 선택합니다.
4. `SyncTubeClient` 폴더를 선택합니다.

소스를 수정한 후에는 다시 빌드하고 확장 프로그램과 YouTube 탭을 새로고침해야 합니다.

## 서버 설정과 빌드

빌드 모드별 서버 주소는 다음과 같습니다.

| 명령 | 서버 주소 | 용도 |
| --- | --- | --- |
| `npm run build:local` | `http://localhost:3000` | 로컬 서버 개발 |
| `npm run build` / `npm run build:release` | `https://api.synch-tube.com` | 운영 및 웹 스토어 배포 |

운영 빌드는 환경 변수나 임의의 서버 주소를 무시하고, 번들에 승인된 HTTPS 운영 API 주소만 포함됐는지 검사합니다. 따라서 `localhost`가 포함된 Chrome 웹 스토어 업로드용 번들은 생성되지 않습니다.

개발 중 변경 사항을 계속 반영하려면 다음 명령을 사용합니다.

```powershell
npm run dev
```

## 로컬 테스트

1. 서버 저장소에서 `npm run start:dev`를 실행합니다.
2. 같은 PC의 서로 다른 Chrome 프로필에서 YouTube 탭을 엽니다.
3. 호스트가 방을 생성합니다.
4. 참가자가 방 코드로 참여합니다.
5. 재생, 일시정지, 탐색, 영상 변경이 동기화되는지 확인합니다.

`localhost`는 각 컴퓨터 자신을 의미합니다. 서로 다른 PC에서 테스트하려면 두 클라이언트가 접근할 수 있는 동일한 서버 주소를 사용해야 합니다.

## 현재 제약

- 호스트 재접속 권한 복구는 아직 없습니다.
- 서버를 재시작하면 모든 방이 삭제됩니다.
- YouTube 광고, 버퍼링, 재생 속도 동기화는 아직 처리하지 않습니다.
