# buddy-chat

1~2명이 작은 가상 생명체(Buddy)를 함께 키우며 쓰는 초경량 1:1 실시간 채팅 앱.
**Chat first. Buddy makes it fun.** iOS가 기준 플랫폼이고 Web은 보조, Android는 나중.

- 제품(원칙, MVP 범위와 진행 상태, 넣지 않는 것): `docs/product.md` — 기능·범위를 바꾸기 전에 읽는다.
- 서버 설계(컬렉션, API, WebSocket 프로토콜, 규칙, 인프라, 마일스톤): `docs/server-design.md` — 서버 작업 전에 읽는다.
- 이 두 문서가 기준(source of truth)이다. 결정이 바뀌면 코드와 같은 커밋에서 문서도 고친다.

## Repo layout

- `app/` — Expo(React Native) + TypeScript + Expo Router. iOS / Web / Android 공용 코드.
- `server/` — Java 25, Spring Boot 4.1 + WebFlux + Reactive MongoDB. 패키지는 기능 모듈(`auth`, `user`, `room`, `chat`, `buddy`, `realtime`).
- `infra/` — Azure Terraform(Container App, DocumentDB). ur-manager의 ACR·Container Apps 환경·tfstate Storage를 읽어서 씀
- `docs/` — 기획과 설계 문서
- `.github/workflows/ci.yml` — app(lint / typecheck / format), server(spotless / test)
- `.github/workflows/deploy.yml` — main에서 CI 통과 후 서버(Container Apps)와 웹(Static Web Apps) 배포
- 로컬 전용(gitignore): `.claude/`(desktop app preview 설정), `.idea/`, `.env*`

## App commands (`app/`에서 실행)

- `pnpm start` — Metro dev server · `pnpm web` — 웹
- 아이폰은 **개발용 빌드**(`expo-dev-client`, bundle id `com.ottuck.buddychat`)로 연다. Expo Go에는 푸시가 없어 S8부터 쓰지 않는다.
  JS 수정은 Metro로 바로 반영되고, 네이티브 설정(패키지·config plugin·`app.json`)이 바뀔 때만 다시 빌드한다:
  `npx eas-cli build --profile development --platform ios`(Apple 계정 로그인이 필요해 사용자가 실행, `eas.json`).
- 번역 JSON 등 수정이 화면에 반영되지 않으면 Metro 캐시 문제다: `pnpm start --clear`
- `pnpm lint` / `pnpm typecheck` / `pnpm format:check` · 한 번에: `pnpm check`
- `pnpm build:web` — 배포용 웹 빌드(`dist/`, Static Web Apps 설정 포함)
- 패키지 추가는 `pnpm exec expo install <pkg>` — SDK와 맞는 버전을 고른다. `pnpm add`로 직접 넣지 않는다.
- `pnpm exec expo-doctor` — 의존성·설정 진단
- Node 24+, pnpm (버전은 `app/package.json`의 `packageManager`)
- 처음 한 번: `app/.env.example`을 `app/.env.local`로 복사하고 Firebase 웹 앱 설정값을 채운다(공개 설정값, git 제외).
- 서버 주소는 `EXPO_PUBLIC_API_URL`(`.env.local`, 예: Azure 주소). 비우면 Metro를 띄운 PC의 :8080 로컬 서버
  (`./gradlew bootRun`)로 정해진다(`app/src/lib/api-url.ts`). 아이폰에서 로컬 서버를 쓰려면 Windows 방화벽에서 8080을 허용한다.

## App structure

- 서버 통신: `lib/api.ts`(REST, Firebase ID token 첨부) · `features/chat/socket.ts`(WebSocket, 첫 메시지 인증, 재연결)
- `features/room/room-provider.tsx`: 로그인 후 `/api/me` → room 유무로 `welcome` / 채팅 화면을 나눈다(`_layout.tsx` 가드).
- `features/chat/use-chat.ts`: 타임라인 상태. 재연결하면 놓친 메시지를 `after`로 채우고, ack 못 받은 메시지를 같은
  `clientMessageId`로 다시 보낸다. 서버 에러 코드의 문구는 `errors.*` 번역 키로 보여준다.
- web은 Node에서 미리 렌더링되므로 모듈 최상위에서 `window`에 접근하지 않는다.
- Buddy 상태(레벨, 배고픔, 똥, 돌볼 수 있는지)는 서버가 계산한 `BuddyView`를 그대로 보여준다. 앱에서 규칙을 다시 계산하지 않는다.
  예외는 로그인 전 "구경하기"(`app/demo.tsx`, `features/demo`)뿐이다. 대본으로 채팅 화면 부품을 그대로 재생하고 서버를 쓰지 않는다.
- Buddy 무대(`features/buddy/components/buddy-stage.tsx`): 채팅 화면 위쪽 약 1/3, 입력 중이거나 위로 스크롤하면 한 줄로 접힌다.
  입력 중 접기는 화면 키보드가 있는 기기만(`stage-folds-on-focus`, PC 웹은 접지 않음). 펼칠 때마다 새로 마운트되므로
  마운트 전에 받은 반응은 재생하지 않는다.
  잠(밤 시간), 기쁨(쓰다듬기), 춤·노래, 말풍선(`use-buddy-talk.ts`, 어린이부터)처럼 서버에 없는 모습은 앱이 정한다. 먹기·💩·청소·진화·상대 메시지 반응은 실시간으로 받은
  메시지(`features/buddy/reactions.ts`)로 시작한다. 앱을 다시 열거나 재연결해서 채운 메시지에는 반응하지 않고, 진화만
  내 읽음 위치보다 새로우면 한 번 보여준다.
- 도트는 문자열 격자 → SVG 사각형(`features/buddy/pixel`). 비트맵을 쓰지 않아 iOS·웹 모두 선명하다. 격자 행 길이가 모두 같아야 하고,
  격자 배열에는 `// prettier-ignore`를 붙여 모양을 유지한다.

## Auth

- Firebase Auth는 JS SDK(`firebase`)만 쓴다 — iOS와 Web 공용. `@react-native-firebase`는 쓰지 않는다.
- `app/src/lib/firebase.ts`(native, AsyncStorage 유지) / `firebase.web.ts`(web). firebase 타입이 web 전용이라
  native의 `getReactNativePersistence` import에만 `@ts-expect-error`를 둔다.
- 로그인 여부로 화면을 나누는 건 `_layout.tsx`의 `Stack.Protected`.
- **게스트 우선.** 첫 화면의 주 버튼은 "바로 시작하기" = Firebase 익명 로그인이고, 운영에서도 정식 기능이다.
  게스트도 모든 기능을 쓴다. 이름이 없으니 먼저 `/name` 화면에서 이름을 받는다(`PATCH /api/me`).
- 계정은 나중에 설정에서 연결한다. 익명 계정에 Google을 `linkWithPopup`으로 붙이므로 Firebase uid가 그대로라 서버 데이터를
  옮기지 않는다. 이미 다른 사용자인 Google 계정이면 합치지 않고, 확인 후 그 계정으로 전환한다(게스트 데이터는 이 기기에서 못 봄).
- 연결은 지금 웹 Google만 된다. 아이폰 Google/Apple 연결은 개발용 빌드에서 붙인다.
- **게스트는 30일.** Firebase 콘솔의 익명 계정 자동 정리(30일 지난 익명 계정 삭제)를 켜서 그대로 제품 정책으로 쓴다. 남은 일수는
  Firebase 계정 생성 시각으로 앱이 계산한다(`features/auth/guest-expiry.ts`). 서버에 남은 만료 게스트의 데이터는 서버가
  주 1회 지운다(`account/GuestCleanup`). 첫 화면과 설정에 안내하고
  마지막 7일은 채팅 위에 안내 줄을 띄운다. 문구는 "회원가입"이 아니라 "계정 연결".
- 계정 삭제는 설정 맨 아래. 서버(`DELETE /api/me`)를 먼저 지우고 Firebase 계정은 앱이 `deleteUser`로 지운다. Google 연결
  계정은 그 전에 다시 로그인한다(`features/auth/actions.ts`, 순서와 이유는 `docs/server-design.md` 계정 삭제).

## Server commands (`server/`에서 실행)

- `./gradlew bootRun` — 로컬 실행. `compose.yaml`의 MongoDB가 Docker로 같이 뜬다(Docker Desktop 필요). :8080
- `./gradlew test` — Testcontainers로 MongoDB를 띄워 테스트 · `./gradlew spotlessApply` — 포맷(palantir-java-format)
- 커밋 전 `./gradlew spotlessCheck test`(server 변경 시)
- 이미지: `docker build -t buddy-chat-server server/`(`server/Dockerfile`). 운영 설정은 환경변수
  (`SPRING_MONGODB_URI`, `SPRING_MONGODB_DATABASE`, `FIREBASE_PROJECT_ID`, `CORS_ALLOWED_ORIGINS`).

## Infra (`infra/`에서 실행)

- `terraform init` / `terraform plan -out=prod.tfplan` / `terraform apply prod.tfplan`. state는 공유 Storage의
  `buddy-chat-tfstate` container(Entra ID 인증, `az login` 필요).
- apply 전에 plan을 사용자에게 보여주고 확인받는다. 이미 있는 리소스를 바꾸거나 지우는 plan은 특히.
- 서버 이미지는 Terraform이 아니라 deploy workflow가 바꾼다(`ignore_changes`).

## Server principles

- reactive chain 안에서 blocking I/O를 하지 않는다. 앱 시작 시 인덱스 생성처럼 트래픽 전 1회성 작업만 예외.
- Firebase ID token은 Admin SDK가 아니라 Spring Security reactive JWT로 검증한다(`auth/FirebaseJwtConfig`).
  사용자 식별은 항상 토큰의 `sub`(uid). 클라이언트가 보낸 id를 믿지 않는다.
- 문서에 필드를 추가하면 기존 문서에는 그 필드가 없다. 새 필드는 nullable(래퍼 타입)로 두고 없는 경우를 처리한다.
- 인덱스는 auto index creation 대신 모듈별 `*Indexes` 클래스에서 명시적으로 만든다.
- 운영 DB는 Azure DocumentDB(MongoDB 호환). 트랜잭션·change stream·복잡한 aggregation에 기대지 않는다(지원 여부와 별개로
  단순함과 호환 범위 때문). 동시성은 조건부 atomic update와 unique 인덱스로 해결한다. 메시지 순서는 `_id` 하나로 정한다.
- 모듈끼리는 service로만 호출한다. 다른 모듈의 repository를 직접 쓰지 않는다.
- 동시성·멱등성·권한은 테스트로 보여준다(초대 경쟁, 메시지 중복, 동시 밥주기·청소, 남의 room 접근, 읽음 위치).

## Expo는 SDK마다 크게 바뀐다

학습 데이터를 믿지 않는다. Expo / EAS / React Native API를 건드리기 전에:

1. `app/package.json`에서 `expo` major 버전을 확인한다 (현재 SDK 57).
2. 해당 버전 문서를 본다: `https://docs.expo.dev/versions/v<major>.0.0/`
3. 그 밖의 것은 `https://docs.expo.dev/llms.txt`에서 해당 문서를 찾아본다.

규칙:

- 라우트는 `app/src/app/`에만 둔다(파일 = 화면, `_layout.tsx` = navigator). 컴포넌트·hook·유틸은
  `app/src/app/` 밖에 둔다. `Link`, `router`, `useLocalSearchParams`는 `expo-router`에서 import.
- `ios/`, `android/`는 CNG로 생성되는 폴더다. 직접 만들거나 고치지 않고 `app.json`과 config plugin으로 설정한다.
- Windows에서는 iOS 로컬 빌드가 안 된다. 네이티브 모듈을 넣거나 네이티브 설정을 바꾸면 EAS 클라우드 빌드를 다시
  해야 한다(무료 플랜은 월 빌드 수 제한) — 넣기 전에 사용자에게 먼저 확인한다.
- 플랫폼마다 지원이 다른 기능은 `*.web.ts`로 빈 구현을 둔다(예: `features/notifications/push.web.ts`, 웹은 푸시 없음).

## Principles

- Chat이 항상 핵심이다. Buddy 때문에 채팅 UX를 희생하지 않는다. Buddy는 가벼운 virtual pet이지 게임이 아니다.
- MVP에 없는 기능(게임 요소, AI Chat, 사진 첨부 등)을 임의로 추가하지 않는다. Pokémon/Tamagotchi IP를 쓰지 않는다.
- iOS UX가 기준이다(Safe Area, 키보드, 스크롤). Web은 같은 모바일 레이아웃을 가운데 정렬하고 최대 폭만 제한한다.
  넓은 창(768px~)에서는 폰 크기 틀에 담는다: CSS 미디어 쿼리(`app/+html.tsx`)가 `WebFrame`의 id를 꾸민다. 창 폭을 JS로 재서
  구조를 바꾸면 경계를 넘을 때 앱 전체가 다시 마운트되므로 그렇게 하지 않는다. 모달 시트도 `WebFrame`으로 감싼다.
- 링크 미리보기(Open Graph, 영어)는 `app/+html.tsx`, 이미지는 `app/public/og.png`(1200×630, 구경하기 화면으로 만듦).
- iOS-first design ≠ iOS-only code. 플랫폼 분기는 정말 다를 때만 `*.ios.ts` / `*.web.ts`로 나눈다.
- 라이브러리는 구체적인 문제가 생겼을 때만 추가한다.
- UI 문구는 처음부터 다국어(ja / ko / en). 화면에 문자열을 직접 쓰지 않고 `app/src/i18n/locales/*.json`에 넣고
  `useTranslation()`의 `t()`로 쓴다. 세 파일의 키는 같아야 한다(typecheck가 검사). 언어는 기기 설정을 따르고,
  지원하지 않는 언어면 영어.

## Git workflow

- 브랜치: `main`(검증된 코드, 릴리스 기준) ← `dev`(개발). 기본 작업 브랜치는 `dev`.
- 평소 작업은 `dev`에 바로 커밋·push한다. 기능 브랜치는 크거나 실험적인 작업일 때만 따로 만든다
  (feat/…, fix/…, chore/… 이름, `dev`로 PR).
- `main`에는 직접 커밋하지 않는다. 기능 묶음이 끝나거나 릴리스 전에 `dev` → `main` PR을 열고,
  CI 통과 후 **merge commit**으로 합친다(squash하면 `dev`와 `main` 히스토리가 어긋난다).
- Conventional commit prefix: feat, fix, refactor, test, docs, chore. 커밋은 논리 단위로 나눈다.
- 커밋 전 `pnpm check`(app 변경 시).
- 비밀 값(.env, 키, 인증서)을 커밋하지 않는다.
- Git 텍스트(커밋 메시지, PR 제목·본문)는 자연스러운 한국어. 브랜치 이름과 기술 용어는 영어.
- PR을 만들 때는 assignee를 `ottuck`으로 지정하고 라벨을 붙인다: 종류 하나(`enhancement` / `bug` / `chore` /
  `refactor` / `test` / `documentation`)와 바뀐 영역(`area: app` / `area: server` / `area: infra` / `area: auth` /
  `area: i18n` / `area: docs`). 예: `gh pr create --assignee ottuck --label enhancement --label "area: app"`
- PR 본문은 사람이 쓴 것처럼 짧고 담백하게. 무엇을 왜 바꿨는지, 어떻게 확인했는지 위주로 쓰고 과한 제목·굵은 글씨·
  번역투("~를 진행합니다", "~하였습니다")는 피한다.
