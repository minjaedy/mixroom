# MIXROOM 설치 아이콘과 앱 식별자

이 앱의 설치 주소는 https://minjaedy.github.io/mixroom/ 이며 manifest의 고정 ID는 `/mixroom/`다.

## 다른 앱과의 분리

`id: "./"`를 사용하지 않는다. Manifest의 id는 manifest 파일 위치가 아닌 start_url의 **origin**을 기준으로 해석되므로 같은 GitHub Pages 도메인의 앱들이 모두 루트 ID로 충돌한다. 기존 ID를 위 경로로 수정한 것은 이 충돌을 해소하기 위한 일회성 이전이다. 이후 이름·아이콘·배포 버전 변경으로 ID를 바꾸지 않는다.

- 구마를 안은 행복한 토끼: `/dydy/`
- TEMPO: `/cale/`
- MIXROOM: `/mixroom/`

`start_url`과 `scope`는 manifest 위치에 상대적인 `./`를 유지한다. 알림 클릭·Service Worker의 오프라인 화면은 자기 scope 안에서만 작동한다. 다른 앱의 등록이나 공유 도메인 전체 사이트 데이터를 삭제하지 않는다.

## 아이콘

- `public/mixroom-icon-v3-1024.png`: 투명한 모서리의 고해상도 일반 아이콘. 작은 PNG 변형도 제공한다.
- `public/mixroom-icon-v3-maskable-1024.png`: 운영체제가 모양·여백을 적용할 수 있는 불투명 full-bleed 아이콘. Safari 17.2 이상 macOS용 고해상도 maskable 아이콘도 제공한다.
- `public/mixroom-icon-v3-maskable-180.png`: iPhone의 apple-touch-icon.

아이콘 URL에 v3를 포함해 이전 이미지 캐시와 구별한다. 배경이 어두운 로고는 내부 브랜드 배경을 유지하고 둥근 타일 외부만 투명하게 만든다. 운영체제별 실제 Dock·작업 표시줄 크기와 마스크는 운영체제가 결정한다.

## 기존 설치 앱

이름과 실행 앱이 섞인 기존 설치는 ID가 바뀐 뒤 자동으로 새 앱이 되지 않을 수 있다. 올바른 위 주소를 브라우저에서 열어 별도 앱으로 설치하고 실행 대상을 확인한다. 이후 잘못된 이전 바로가지만 정리한다. 제거 화면에서 같은 도메인의 사이트 데이터까지 삭제하는 옵션은 선택하지 않는다. 새 설치 컨테이너에서는 로그인과 알림 연결이 다시 필요할 수 있다.

macOS Safari 웹 앱에서 실행 주소는 정상이고 아이콘만 이전 그림이라면 앱 이름 메뉴 → 설정 → 아이콘에서 PNG를 선택할 수도 있다. 브라우저의 아이콘 갱신은 즉시 반영을 보장하지 않는다.

검증은 manifest의 실제 URL 해석, PNG 크기/알파 유형, 빌드 결과의 아이콘 누락 여부, 다른 앱으로 향하는 알림 차단, 기존 배지 테스트로 수행한다. 물리적인 Mac/iPhone/Windows 설치 화면 테스트와는 구분한다.

## 근거

- [W3C manifest id 처리 규칙](https://www.w3.org/TR/appmanifest/#id-member)
- [Chrome PWA 고유 ID](https://developer.chrome.com/docs/capabilities/pwa-manifest-id)
- [WebKit macOS 아이콘 선택 규칙](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/)
- [Apple Safari 웹 앱 설정](https://support.apple.com/en-au/104996)
