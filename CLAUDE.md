# buddy-chat

1~2명이 작은 가상 생명체(Buddy)를 함께 키우며 쓰는 초경량 1:1 실시간 채팅 앱.
**Chat first. Buddy makes it fun.** iOS가 기준 플랫폼이고 Web은 보조, Android는 나중.

- 기획: `docs/project-plan.md` — 구조를 바꾸기 전에 읽는다. 앞 섹션과 충돌하면 §65(MVP 인프라)가 우선.
- 검토 결과와 결정 사항: `docs/review-notes.md`

## Repo layout

- `app/` — Expo(React Native) + TypeScript + Expo Router. iOS / Web / Android 공용 코드.
- `server/` — Spring Boot + WebFlux (아직 없음)
- `docs/` — 기획과 설계 문서
- `.github/workflows/ci.yml` — app의 lint / typecheck / format 검사
- 로컬 전용(gitignore): `.claude/`(desktop app preview 설정), `.idea/`, `.env*`

## App commands (`app/`에서 실행)

- `pnpm start` — Metro dev server (아이폰은 Expo Go로 QR 스캔) · `pnpm web` — 웹
- `pnpm lint` / `pnpm typecheck` / `pnpm format:check` · 한 번에: `pnpm check`
- 패키지 추가는 `pnpm exec expo install <pkg>` — SDK와 맞는 버전을 고른다. `pnpm add`로 직접 넣지 않는다.
- `pnpm exec expo-doctor` — 의존성·설정 진단
- Node 24+, pnpm (버전은 `app/package.json`의 `packageManager`)

## Expo는 SDK마다 크게 바뀐다

학습 데이터를 믿지 않는다. Expo / EAS / React Native API를 건드리기 전에:

1. `app/package.json`에서 `expo` major 버전을 확인한다 (현재 SDK 57).
2. 해당 버전 문서를 본다: `https://docs.expo.dev/versions/v<major>.0.0/`
3. 그 밖의 것은 `https://docs.expo.dev/llms.txt`에서 해당 문서를 찾아본다.

규칙:

- 라우트는 `app/src/app/`에만 둔다(파일 = 화면, `_layout.tsx` = navigator). 컴포넌트·hook·유틸은
  `app/src/app/` 밖에 둔다. `Link`, `router`, `useLocalSearchParams`는 `expo-router`에서 import.
- `ios/`, `android/`는 CNG로 생성되는 폴더다. 직접 만들거나 고치지 않고 `app.json`과 config plugin으로 설정한다.
- Windows에서는 iOS 로컬 빌드가 안 된다. Expo Go에 없는 네이티브 모듈을 넣으면 EAS 클라우드
  개발 빌드가 필요하다 — 넣기 전에 사용자에게 먼저 확인한다.

## Principles

- Chat이 항상 핵심이다. Buddy 때문에 채팅 UX를 희생하지 않는다. Buddy는 가벼운 virtual pet이지 게임이 아니다.
- MVP에 없는 기능(게임 요소, AI Chat, 사진 첨부 등)을 임의로 추가하지 않는다. Pokémon/Tamagotchi IP를 쓰지 않는다.
- iOS UX가 기준이다(Safe Area, 키보드, 스크롤). Web은 같은 모바일 레이아웃을 가운데 정렬하고 최대 폭만 제한한다.
- iOS-first design ≠ iOS-only code. 플랫폼 분기는 정말 다를 때만 `*.ios.ts` / `*.web.ts`로 나눈다.
- 라이브러리는 구체적인 문제가 생겼을 때만 추가한다.
- UI 문구는 처음부터 다국어(ja / ko / en). 화면에 문자열을 직접 쓰지 않고 `app/src/i18n/locales/*.json`에 넣고
  `useTranslation()`의 `t()`로 쓴다. 세 파일의 키는 같아야 한다(typecheck가 검사). 언어는 기기 설정을 따르고,
  지원하지 않는 언어면 영어.

## Git workflow

- main에 직접 push하지 않는다. 작업 단위마다 브랜치 하나(feat/…, fix/…, refactor/…, test/…, docs/…, chore/…).
- Conventional commit prefix: feat, fix, refactor, test, docs, chore. PR 제목도 이 형식(squash merge 커밋이 된다).
- 커밋은 논리 단위로 나눈다. PR은 기능 하나, 되도록 ~400줄 이하(lockfile, 생성 파일 제외).
- 커밋 전 `pnpm check`(app 변경 시).
- 비밀 값(.env, 키, 인증서)을 커밋하지 않는다.
- Git 텍스트(커밋 메시지, PR 제목·본문)는 자연스러운 한국어. 브랜치 이름과 기술 용어는 영어.
