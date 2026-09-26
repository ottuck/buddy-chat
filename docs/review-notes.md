# 기획 검토 노트

`docs/project-plan.md`를 검토한 결과와, 그에 따라 정한 방향을 모아둔다.

## 전체 평가

범위를 잘 정했다. "Chat >>> Buddy", Redis 빼기, 레플리카 1개, Buddy 상태를 스케줄러 없이 조회 시점에
계산하기 모두 MVP에 맞는 선택이다. 테스트 목록(초대 경쟁 조건, 메시지 중복 방지, 동시 밥주기)도
포트폴리오에서 설명하기 좋다.

## 짚어둘 점

1. **Apple 로그인은 사실상 필수다.** App Store 규정상 Google 같은 소셜 로그인을 넣으면 Sign in with
   Apple도 함께 제공해야 한다. "후반에 검토"로 두면 심사에서 걸린다.
2. **Windows에서는 iOS 빌드를 할 수 없다.** 초기 UI는 Expo Go로 아이폰에서 바로 확인한다. 푸시나
   Firebase 네이티브 모듈을 쓰는 시점부터는 EAS 클라우드 빌드로 만든 개발용 빌드와 Apple Developer
   Program($99/년)이 필요하다.
3. **Firebase SDK는 웹 지원을 고려해서 고른다.** `@react-native-firebase`는 웹을 지원하지 않는다.
   인증은 Firebase JS SDK로 하면 iOS와 웹을 코드 하나로 처리할 수 있다. 푸시는 iOS에서 결국 APNs를
   거치니, `expo-notifications`로 할지 FCM으로 할지는 푸시를 붙일 때 정한다.
4. **`minReplicas = 0`이면 첫 접속이 느리다.** JVM이 켜지는 동안 첫 WebSocket 연결에 몇 초가
   걸린다. Container Apps에는 유휴 연결을 끊는 타임아웃이 있어서 heartbeat(ping)도 필요하다.
   배포할 때마다 메모리에 있는 접속 상태와 타이핑 상태가 사라지니, 클라이언트의 재연결 로직이 이걸
   전제로 짜여 있어야 한다.
5. **계획서 안에서 서로 맞지 않는 부분이 있었다.** → `docs/`로 옮기면서 정리했다.
   - §17과 §53은 Redis를 쓰지만 §65는 Redis를 뺀다. §65가 최신이다.
   - §14에 "Flutter/RN"이 남아 있었다.
   - §52는 새 repo로 갈지 "미정"이라고 돼 있었다.
   - §64는 poke-chat 분석과 설계를 먼저 한다고 돼 있지만, 실제로는 RN 세팅부터 시작했다.
6. **로컬 개발 DB를 정해야 한다.** 로컬에서는 MongoDB 컨테이너를 쓰되, Azure DocumentDB와 호환되는
   연산만 쓴다.
7. **UI 언어가 정해지지 않았다.** 주 대상이 일본 사용자인데 계획서에 다국어 얘기가 없다. 일본어로
   할지 한국어로 할지, 여러 언어를 지원할지 세팅 단계에서 정한다.
   → **처음부터 다국어(ja / ko / en)로 간다.** 기기 언어를 따르고, 지원하지 않는 언어면 영어.

## 정한 방향

- **폴더:** `C:\Users\vison\IdeaProjects\buddy-chat`
- **구조:** 하나의 repo에 `app/`(Expo)과 `server/`(Spring)를 두는 모노레포
- **첫 PR:** Expo + TypeScript + Expo Router 기본 세팅과 lint/format/typecheck, 그리고 계획서를
  `docs/`와 `CLAUDE.md`로 옮기는 작업
- **Git 규칙:** pokepedia와 같다. 커밋과 PR은 한국어, 브랜치 이름은 영어
