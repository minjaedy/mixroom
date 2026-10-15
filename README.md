# MIXROOM

음악 외주용 버전 비교·구간 수정 요청·고객 대화 웹앱. 현재 로컬 미리보기 단계이며 외부에 배포하지 않았습니다.

## 로컬 실행

PowerShell에서 이 폴더를 열고 순서대로 실행합니다.

```powershell
npm ci
npm run setup:local
npx wrangler d1 migrations apply mixroom-studio --local
npm run dev
```

초기 설정 명령은 로컬용 키를 생성하며 기존 `.dev.vars`가 있으면 그대로 유지합니다. 원격 계정이나 서버를 만들지 않습니다.

- 체험 화면: http://127.0.0.1:8794/?demo=1
- 고객 프로젝트 화면: http://127.0.0.1:8794/?demo=1&screen=project
- 관리자 고객 목록: http://127.0.0.1:8794/?demo=1&screen=customers
- 별도 채팅 화면: http://127.0.0.1:8794/?demo=1&screen=chat
- 사진 사용 가이드: http://127.0.0.1:8794/guide.html
- 실제 로컬 작업실: http://127.0.0.1:8794/

데모는 메모리 안의 예시 데이터와 합성 음원으로 동작하며 새로고침하면 초기화됩니다. 고객·엔지니어 화면을 전환할 수 있습니다. 실제 모드는 로컬 D1/R2 에뮬레이터에 저장합니다. 첫 계정 등록은 `.local/setup-code.txt`의 초기 코드를 사용해 UI에서 비밀번호를 직접 설정합니다. `.dev.vars`, `.local`, `.wrangler`는 Git에 포함하지 않습니다.

미리보기는 고객/관리자 입장 화면에서 시작합니다. 관리자 모드에서는 예시 고객 3명의 프로젝트와 채팅을 전환하고, 고객 추가·초대 코드·삭제 흐름을 체험할 수 있습니다. 데모 접속 코드는 실제 인증에 사용할 수 없습니다. 수정 요청 입력창은 재생기 바로 아래, 요청 기록은 별도 패널에 표시합니다. 라이트·다크·기기 설정 테마는 이 브라우저에 저장되며 로그인 화면과 사용 가이드에도 적용됩니다. 메시지 초안은 프로젝트별 메모리에만 유지하며 새로고침·로그아웃 시 없어집니다.

## 구현

- WAV/MP3/M4A/AAC/OGG/FLAC 업로드, 8MB 청크, 파일당 200MB/2시간 제한
- Web Audio 동기 A/B 전환, 실제 파형, 구간 반복, B 시간 보정
- 고객별 프로젝트 초대 코드, 해시 저장, HttpOnly 세션, 서버 권한 검증
- 버전에 연결된 요청과 답변, 반영 버전 선택, 고객 확인
- 프로젝트 대화, 서버 알림함, Web Push 구독과 재시도 큐
- 메뉴·상단 종 아이콘의 안 읽은 알림 숫자(최대 `99+`), 고객/관리자별 읽음 상태
- 알림 선택 시 채팅방·수정 구간·답변·해당 음원 버전으로 이동. 채팅방을 열면 그 방에서 확인한 알림만 읽음 처리
- 프로젝트 완료(읽기 전용), 초대 재발급, 고객 접속 종료와 데이터 삭제
- 아이폰/안드로이드 설치 및 알림 안내. 공식 실제 화면·앱 캡처·재현 이미지 구분

메인 파일: `worker/index.js`, `worker/security.js`, `worker/push.js`, `public/app.js`, `public/audio.js`, `public/guide.js`.

## 검증

`npm run check`, `npm test`. 통합 검증은 아래 별도 로컬 서버에서 실행합니다.

별도 테스트 저장소:

1. `npx wrangler d1 migrations apply mixroom-studio --local --persist-to .wrangler/test-state`
2. `npx wrangler dev --port 8795 --persist-to .wrangler/test-state`
3. `node tests/integration.mjs`

통합 검증은 별도 로컬 계정과 프로젝트로 인증·프로젝트 격리·오디오 업로드/Range·수정 상태·대화·알림 기록·코드 폐기·정보와 음원 삭제를 확인합니다. 실제 푸시는 발송하지 않습니다.

## 나중에 서버로 배포할 때

2026-10-14 사용자 결정: ‘토끼 고구마’와 같은 GitHub Pages + Cloudflare Workers/D1 구성을 기준으로 삼고, 지금은 앱 구현과 로컬 미리보기에 집중합니다. R2 활성화와 외부 배포를 진행하지 않습니다. 아래 R2 배포 절차는 기존 서버 초안의 참고용이며 현재 확정된 배포 방식이 아닙니다. 현재 음원 업로드 API 초안은 R2 바인딩을 사용하므로, 기존 구성에 연결할 때 파일 보관 방식은 별도로 정해야 합니다. 채팅·수정 요청·알림 기록은 D1을 사용하며 R2가 필요하지 않습니다.

기존 ‘토끼 고구마’ 서버의 Cloudflare Workers/D1/Web Push 구조를 참고했지만 그 앱의 코드·운영 데이터·키는 수정하거나 공유하지 않습니다.

회사 계정은 사용하지 않습니다. `wrangler.jsonc`의 `account_id`는 사용자가 확인한 개인 계정 `kmj843337@gmail.com` (`06bada574d14a5e1d912f35b4645f695`)으로 고정했습니다. 원격 명령을 실행하기 전 `npx wrangler whoami`로 이 계정인지 확인하고, 다른 계정이나 계정을 덮어쓰는 환경변수가 감지되면 중단합니다. 회사 브라우저 로그인이나 회사 인증 정보는 사용하지 않습니다.

1. 계정에서 R2를 활성화하고 별도 D1 `mixroom-studio`와 R2 `mixroom-studio-audio`를 생성합니다.
2. `wrangler.jsonc`의 D1 ID를 새 DB ID로 바꾸고 실제 배포 호스트를 확인합니다.
3. 프로덕션 전용 `SETUP_CODE_HASH`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`를 새로 생성해 Worker secrets에 저장합니다. 로컬 키를 복사하지 않습니다.
4. 원격 마이그레이션을 적용하고 Worker+정적 파일을 배포합니다.
5. 관리자가 비밀번호를 설정하고 각 기기에서 푸시 구독·수신을 실물 확인합니다. 설정의 `테스트 알림`이 실제 도착하기 전에는 발송 검증 완료로 간주하지 않습니다.

2026-10-14 사용자는 같은 개인 계정에서 R2를 활성화했다고 확인했으나, 배포 도구는 해당 계정에 대해 계속 `10042: Please enable R2 through Cloudflare Dashboard`를 반환했습니다. 계정 설정이 확인될 때까지 배포하지 않았으며 원격 DB·버킷도 생성하지 않았습니다. 실제 고객 데이터와 큰 음원을 사용한 기기별 성능 검증도 배포 전 필요합니다. Web Audio는 비교할 두 파일을 메모리에 디코딩하므로 큰 음원은 저사양 휴대폰의 메모리 부담이 있습니다.

## 가이드 이미지 출처

- Apple 지원: https://support.apple.com/ko-kr/guide/iphone/iph42ab2f3a7/ios
- WebKit: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- Google web.dev: https://web.dev/learn/pwa/installation (CC BY 4.0, 원본 그대로)
- 한국어 메뉴·권한창 SVG: 직접 제작한 안내용 재현
- `app-review.jpg`, `app-notifications.jpg`, `app-notifications-mobile.jpg`: MIXROOM 데모 실제 브라우저 캡처 (모바일 이미지는 브라우저 너비를 조절해 촬영)

이미지에 출처·예시 여부를 표시했고, 공식 화면에 등장하는 다른 앱이 MIXROOM의 실기기 화면인 것처럼 설명하지 않습니다.
