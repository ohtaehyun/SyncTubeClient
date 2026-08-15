# SyncTube Chrome Extension

YouTube 영상을 여러 사용자가 같은 재생 상태로 보는 Chrome Manifest V3 확장 프로그램입니다.

## 현재 기능

- 현재 YouTube 영상으로 방 생성
- 6자리 방 코드로 참여 및 동일 영상으로 이동
- 호스트의 재생, 일시정지, 탐색 동기화
- 호스트의 영상 전환 동기화
- 방 탭을 기준으로 동기화하여 다른 YouTube 탭은 무시
- 방 탭을 닫으면 참가자는 자동 퇴장, 호스트는 방 종료

## 설치와 실행

```powershell
npm install
npm run build:local
```

Chrome에서 다음을 실행합니다.

1. `chrome://extensions` 열기
2. 개발자 모드 켜기
3. **압축해제된 확장 프로그램을 로드합니다** 선택
4. `SyncTubeClient` 폴더 선택

소스를 수정한 뒤에는 다시 빌드하고 확장 프로그램과 YouTube 탭을 새로고침해야 합니다.

```powershell
npm run build:local
```

## 서버 설정

빌드 모드는 서버 주소를 코드 수준에서 고정합니다.

- `npm run build:local`: `http://localhost:3000`을 사용합니다.
- `npm run build` 또는 `npm run build:release`: `https://api.synch-tube.com`을 사용합니다.

운영 빌드는 로컬 주소나 임의의 환경 변수 값을 무시하고, 번들 생성 후에도 운영 API 주소가 포함됐는지 검사합니다. 따라서 `localhost`가 들어간 Chrome Web Store 업로드용 번들은 생성되지 않습니다.

## 로컬 테스트

1. 서버 저장소에서 `npm run start:dev` 실행
2. 같은 PC의 서로 다른 Chrome 프로필에서 YouTube 탭 열기
3. 호스트가 방 생성
4. 참가자가 방 코드로 참여
5. 호스트의 재생·정지·탐색·영상 전환 확인

`localhost`는 각 컴퓨터 자신을 뜻합니다. 서로 다른 PC에서 테스트할 때는 같은 공개 서버 주소를 사용해야 합니다.

## 현재 제약

- 호스트 재접속 권한 복구는 아직 없습니다.
- 서버 재시작 시 모든 방이 삭제됩니다.
- YouTube 광고, 버퍼링, 재생 속도 동기화는 아직 처리하지 않습니다.
