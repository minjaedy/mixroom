# MIXROOM

음악 외주용 버전 비교·구간 수정 요청·고객 대화 웹앱. GitHub Pages + Firebase + Cloudflare Workers/D1 구성으로 배포합니다.

앱: https://minjaedy.github.io/mixroom/

## 로컬 실행

PowerShell에서 이 폴더를 열고 순서대로 실행합니다.

```powershell
npm ci
npm run setup:local
npx wrangler d1 migrations apply mixroom-studio --local
foreach ($mixroomShard in 1..4) { npx wrangler d1 migrations apply "mixroom-audio-$mixroomShard" --local }
npm run dev
```

초기 설정 명령은 로컬용 키를 생성하며 기존 `.dev.vars`가 있으면 그대로 유지합니다. 원격 계정이나 서버를 만들지 않습니다.

- 체험 화면: http://127.0.0.1:8794/?demo=1
- 고객 프로젝트 화면: http://127.0.0.1:8794/?demo=1&screen=project
- 관리자 고객 목록: http://127.0.0.1:8794/?demo=1&screen=customers
- 별도 채팅 화면: http://127.0.0.1:8794/?demo=1&screen=chat
- 사진 사용 가이드: http://127.0.0.1:8794/guide.html
- 실제 로컬 작업실: http://127.0.0.1:8794/

데모는 메모리 안의 예시 데이터와 합성 음원으로 동작하며 새로고침하면 초기화됩니다. 고객·엔지니어 화면을 전환할 수 있습니다. 실제 모드는 로컬 D1 에뮬레이터에 저장합니다. 첫 계정 등록은 `.local/setup-code.txt`의 초기 코드를 사용해 UI에서 비밀번호를 직접 설정합니다. `.dev.vars`, `.local`, `.wrangler`는 Git에 포함하지 않습니다.

미리보기는 고객/관리자 입장 화면에서 시작합니다. 관리자 모드에서는 예시 고객 3명의 프로젝트와 채팅을 전환하고, 고객 추가·초대 코드·삭제 흐름을 체험할 수 있습니다. 데모 접속 코드는 실제 인증에 사용할 수 없습니다. 수정 요청 입력창은 재생기 바로 아래, 요청 기록은 별도 패널에 표시합니다. 라이트·다크·기기 설정 테마는 이 브라우저에 저장되며 로그인 화면과 사용 가이드에도 적용됩니다. 메시지 초안은 프로젝트별 메모리에만 유지하며 새로고침·로그아웃 시 없어집니다.

## 구현

- 고객이 자기 프로젝트에 원본 음원과 작업 요청 업로드 → 관리자 수정본 업로드 → A/B 비교. 컴퓨터 드래그·파일 선택, 아이폰 파일 선택 지원. 고객 업로드는 관리자에게 알리고, 첨부한 작업 내용은 원본에 연결된 수정 요청으로 함께 저장.
- WAV/MP3/M4A/AAC/OGG/FLAC 업로드, 512KiB 청크, 파일당 200MB/2시간 제한
- 원본만 있으면 단일 파형, 실제 관리자 수정본이 생기면 A/B 비교. 파형 주변 클릭으로 음원 전환, 드래그로 재생선 이동, 최대 256배 확대·이동, 시작/끝 북마크 반복, 0.001초 시간 표시, 처음으로/전체 보기/구간 해제, B 시간 보정.
- 채팅 읽음은 메시지에 저장. 이전 앱의 채팅 확인 경로와 답장에도 읽음 저장을 적용하고, 오래된 응답으로 읽음이 되돌아가지 않도록 보호. Firebase 신호와 활성 채팅 5초 보조 갱신.
- 고객별 프로젝트 초대 코드, 해시 저장, 30일 Bearer 세션, 서버 권한 검증
- 버전에 연결된 요청과 답변, 반영 버전 선택, 고객 확인
- 프로젝트 대화, 서버 알림함, Web Push 구독과 재시도 큐
- 채팅 말풍선의 안 읽음/읽음 표시: 최신 메시지까지 열면 이전에 불러온 상대 메시지도 함께 확인 처리(과거 내역을 스크롤 중이면 화면에 보이는 메시지만 처리), 알림 모두 읽음과 별도. Enter 전송, Shift+Enter 줄바꿈, 한글 조합 확정 및 중복 전송 방지.
- 메뉴·상단 종 아이콘의 안 읽은 알림 숫자(최대 `99+`), 고객/관리자별 읽음 상태
- 알림함은 안 읽은 알림만 표시하며, 개별 확인 또는 모두 읽음 후 목록에서 사라집니다.
- 알림 선택 시 채팅방·수정 구간·답변·해당 음원 버전으로 이동. 채팅방을 열면 그 방에서 확인한 알림만 읽음 처리
- 프로젝트 완료(읽기 전용), 초대 재발급, 고객 접속 종료와 데이터 삭제
- 관리자 최초 등록·고객 초대·고객 첫 입장부터 시작하는 역할별 사진 가이드.
- 새 앱 배포 자동 감지: 60초마다, 앱에 돌아왔을 때 확인. 작성·업로드·다운로드·재생·열린 대화상자가 끝난 뒤 적용하고 로그인과 현재 프로젝트/메뉴를 유지.
- 아이폰/안드로이드 설치 및 알림 안내. 공식 실제 화면·앱 캡처·재현 이미지 구분

메인 파일: `worker/index.js`, `worker/security.js`, `worker/push.js`, `public/app.js`, `public/audio.js`, `public/guide.js`.

## 검증

`npm run check`, `npm test`. 통합 검증은 아래 별도 로컬 서버에서 실행합니다.

별도 테스트 저장소:

1. `npx wrangler d1 migrations apply mixroom-studio --local --persist-to .wrangler/test-state`
2. `foreach ($mixroomShard in 1..4) { npx wrangler d1 migrations apply "mixroom-audio-$mixroomShard" --local --persist-to .wrangler/test-state }`
3. `npx wrangler dev --port 8795 --persist-to .wrangler/test-state`
4. `node tests/integration.mjs`

통합 검증은 별도 로컬 계정과 프로젝트로 인증·프로젝트 격리·오디오 업로드/Range·수정 상태·대화·알림 기록·코드 폐기·정보와 음원 삭제를 확인합니다. 실제 푸시는 발송하지 않습니다.

## 서버 구성과 배포

- GitHub Pages: public을 scripts/build-pages.mjs로 빌드한 dist-site만 배포. 커밋 버전과 JS/CSS 주소를 함께 갱신. 앱·설치 가이드·PWA.
- Cloudflare Workers/D1: 권한, 고객/프로젝트, 수정 요청, 채팅, 알림, 원본 음원 조각.
- Firebase Realtime Database + 커스텀 인증: 고객별 변경 신호를 실시간 전달. 실제 데이터는 권한 검증을 거쳐 API에서 조회하며 D1이 원본입니다. 변경 신호에는 대화·파일·고객 이름이 포함되지 않습니다.
- Web Push: 기기에 새 버전·수정 요청·메시지 알림. 앱 안 읽음 상태와 별개이며 각 기기에서 허용해야 합니다.

구안행토와 같은 서비스 구성을 쓰되 MIXROOM 전용 프로젝트와 키로 분리합니다. Firebase Storage, R2, KV는 사용하지 않습니다. 회사 계정은 사용하지 않습니다.

음원은 변환·재인코딩·압축·정규화 없이 저장합니다. 청크별 SHA-256으로 업로드와 저장된 파일, 다운로드 응답을 확인합니다. 재생용 디코딩/볼륨/속도 변경은 원본에 적용되지 않습니다. 원본 WAV의 비트 깊이·샘플레이트, MP3 등 원래 파일의 형식을 보존합니다. 브라우저/기기의 재생 출력은 기기 설정에 따릅니다.

**원본 음원 합계 1GiB(화면: 1GB / 1,024MB)**로 제한합니다. 기존 DB는 권한·파일 메타데이터와 기존 음원을 유지하며, 새 음원은 512KiB 청크를 동일한 4개 조각으로 나누어 MIXROOM 전용 D1 DB 4개에 저장합니다. DB별 인코딩된 음원은 전체 한도에서 약 342MiB 이하이며 각 무료 DB 500MB 한도에 여유를 둡니다. 원본은 변환하지 않고 SHA-256 검증 후 재조합합니다. 각 파일의 예약은 메인 DB에서 원자적으로 처리합니다. 업로드 중인 파일도 예약 용량에 포함됩니다. 파일당 최대 200MiB/2시간. 버전 옆 삭제 버튼으로 개별 파일을 지우면 수정 기록은 남고 삭제된 음원의 재생은 차단됩니다. 고객 삭제는 보관 예외 없이 모든 음원과 고객 정보·대화·요청·구독·세션을 지웁니다. 접근은 즉시 차단하고, 음원 및 Firebase 계정 정리는 재시도 가능한 서버 작업으로 처리합니다. 중단된 업로드는 24시간 후 정리합니다. 공급자 백업은 공급자의 보존 기간이 적용됩니다.

Firebase 규칙은 기본 거부이며 본인의 변경 신호만 읽습니다. 쓰기는 서버만 가능합니다. Firebase 장애 시 30초 간격 API 확인으로 동작합니다. private key, 세션/초대 코드, 관리자 비밀번호는 저장소에 포함하지 않습니다. Firebase 웹 API 키/프로젝트 ID는 공개 클라이언트 설정이며 접근 권한은 보안 규칙과 서버 인증으로 제한합니다.

배포:

1. 개인 계정 확인: GitHub minjaedy, Cloudflare/Firebase kmj843337@gmail.com.
2. `npx wrangler d1 migrations apply mixroom-studio --remote --config wrangler.production.jsonc`. 이어서 `foreach ($mixroomShard in 1..4) { npx wrangler d1 migrations apply "mixroom-audio-$mixroomShard" --remote --config wrangler.production.jsonc }`.
3. Worker secrets: SETUP_CODE_HASH, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, FIREBASE_ACCOUNT.
4. `npm run deploy`. main의 public 변경은 GitHub Actions가 Pages에 배포합니다.
5. 처음 한 번 앱의 관리자 계정 만들기에서 스튜디오 이름·비밀번호 설정. 이 PC에서는 `pwsh -File scripts/copy-setup-code.ps1`로 암호화 보관한 초기 코드를 클립보드에 복사할 수 있습니다.

Firebase 프로젝트: mixroom-minjaedy. 규칙 배포는 `npx firebase-tools deploy --only database --project mixroom-minjaedy`. Firebase 서비스 계정은 이 프로젝트의 Database/Auth 관리자만 허용하며 다른 프로젝트 권한은 없습니다.

검증: `npm run check`, `npm test`, `node tests/integration.mjs`, `node tests/audio-integration.mjs`, `node tests/collaboration-integration.mjs`. 큰 음원 두 개는 브라우저 메모리 사용량이 커집니다. 실제 iPhone/Android에서 기기별 재생 성능과 푸시 수신은 설정의 테스트 알림으로 확인해야 합니다.

## 가이드 이미지 출처

- Apple 지원: https://support.apple.com/ko-kr/guide/iphone/iph42ab2f3a7/ios
- WebKit: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- Google web.dev: https://web.dev/learn/pwa/installation (CC BY 4.0, 원본 그대로)
- 한국어 메뉴·권한창 SVG: 직접 제작한 안내용 재현
- `start-entry.jpg`, `start-admin.jpg`: 입력란이 비어 있는 실제 입장·등록 화면 캡처. `start-customers.jpg`, `start-invite.jpg`: 실제 데모 화면이며 표시된 고객·코드는 예시.
- `app-upload.jpg`: 고객 원본 및 작업 요청 입력 화면, 테스트 WAV를 선택한 데모 캡처.
- `app-review.jpg`, `app-notifications.jpg`, `app-notifications-mobile.jpg`: MIXROOM 데모 실제 브라우저 캡처 (모바일 이미지는 브라우저 너비를 조절해 촬영)

이미지에 출처·예시 여부를 표시했고, 공식 화면에 등장하는 다른 앱이 MIXROOM의 실기기 화면인 것처럼 설명하지 않습니다.

앱 자동 업데이트는 GitHub Pages 빌드에서 생성된 version.json과 HTML 버전이 모두 같을 때만 적용합니다. 통신 실패 시 현재 화면을 유지합니다. 이 기능을 처음 도입하기 전에 열어 둔 탭은 한 번 직접 새로고침해야 하며, 이후 배포부터 자동 적용됩니다.

관리자 용량 관리: 프로젝트별 필터, 용량/업로드 날짜 정렬, 파일 히스토리 선택 삭제와 전체 저장공간 선택 삭제(최대 100개). 음원 삭제는 요청·대화를 유지하며 삭제된 반영 버전의 요청을 접수로 되돌립니다. 선택 삭제 확인창과 역할별 사진 가이드를 함께 제공합니다.

사용법이 바뀌는 UI 기능을 수정할 때는 같은 변경에 고객·관리자 역할별 사용 가이드와 해당 실제 화면 사진도 함께 갱신합니다.

## 30일 보관 정책과 모바일 채팅

음원은 각 버전의 업로드 완료(created_at), 일반 채팅 및 수정 요청 답변은 각 메시지의 전송(created_at)부터 정확히 30일 보관합니다. 읽음·다운로드·프로젝트 완료로 갱신하지 않습니다. 기존 데이터도 원래 시각으로 적용합니다. 만료된 음원·메시지는 API 조회에서 즉시 제외하며 음원 다운로드도 거부합니다. 2분 주기의 cron이 음원을 삭제 상태로 전환하고 분산된 조각을 제한된 묶음으로 정리하므로 물리 삭제·용량 반환은 순차 처리됩니다. 자동 정리는 실패해도 재시도하며 파일 삭제 tombstone으로 늦게 도착한 업로드가 파일을 되살리지 못하게 합니다. 만료 메시지와 관련 메시지 알림도 삭제합니다. 수정 요청 본문은 유지하고 만료 수정본의 해결 연결은 해제합니다. 공급자 백업은 해당 공급자의 보존 정책이 적용됩니다.

폰 화면의 하단 메뉴는 64px 메뉴 영역과 홈 표시줄 안전 영역을 분리합니다. 관리자 보조 메뉴(용량 관리·가이드·설정)는 더보기에 있고 고객도 가이드·설정을 더보기에서 엽니다. 폰 채팅은 접을 수 있는 프로젝트 선택과 자동 높이 입력창을 사용하며 키보드가 올라오면 하단 메뉴를 숨깁니다. PC는 기존 두 칸 채팅 배치를 유지합니다.

추가 DB에는 audio-migrations/, 메인 DB에는 migrations/를 적용한 뒤 Worker를 배포합니다. node tests/retention-integration.mjs는 원격 접근 없이 임시 DB로 기존 음원 호환·4곳 분산·원본 일치·동시 용량 예약·30일 경계·채팅 만료·삭제 재시도를 검사합니다.

설치한 PWA는 서버의 안 본 알림 수를 Badging API로 표시합니다. 푸시와 화면 갱신에서 최신 서버 스냅샷을 적용하며, 이미 읽은 알림보다 오래된 푸시는 무시합니다. 로그아웃 시 배지를 비웁니다. 닫힌 다른 기기는 다음 푸시 또는 앱 재실행 때 동기화됩니다.

PC 상단 앱 설치 버튼은 beforeinstallprompt를 통한 네이티브 설치창을 열며, 해당 이벤트가 없으면 OS별 사진 가이드로 이동합니다. 앱 설치 완료·standalone 모드에서는 숨깁니다.

자동 정리는 짝수 분, 푸시 재시도와 Firebase 변경 신호 전달은 홀수 분 cron으로 분리합니다. 각각 2분 주기입니다. 정상적인 새 알림·변경 신호는 요청 직후에도 전달하며, 정리 작업은 한 번에 음원 하나의 최대 128개 청크를 처리합니다. 임시 DB 검증에서 삭제 재시도와 호출당 50개 이하의 D1 쿼리를 확인합니다.
