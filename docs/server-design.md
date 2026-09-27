# 서버 설계

`docs/project-plan.md` §12–§21, §54–§57, §65를 바탕으로 한 MVP 서버 설계. 구현하면서 바뀌면 이 문서를 같이 고친다.

## poke-chat에서 가져올 것 / 버릴 것

poke-chat(Express + Socket.IO + Mongoose + Redis) 구조:

- 모든 소켓이 `global` room 하나에 들어가고 `io.emit`으로 전원에게 broadcast한다.
- 인증 대신 express-session에 랜덤 userId를 넣는다. 사용자 정보는 Redis hash(48시간 TTL).
- 메시지는 Mongo에 저장하고, 최근 100개를 Redis list에 캐시해 접속 시 내려준다.
- 메시지 스키마: `userId, username, profileImage, message, timestamp`. room 개념, clientMessageId, 인덱스 없음.
- `.env`(SESSION_SECRET 포함)가 repo에 커밋돼 있다.

buddy-chat에서는:

| poke-chat | buddy-chat |
| --- | --- |
| global broadcast | room(최대 2명) 단위 전달, 멤버십 검사 |
| 세션 랜덤 ID | Firebase ID token 검증 |
| 메시지에 username·이미지 복사 | 메시지는 senderId만, 표시는 클라이언트가 멤버 정보로 |
| Redis 최근 메시지 캐시 | 캐시 없음. `roomId + _id` 인덱스로 커서 페이지네이션 |
| 재전송 시 중복 저장 | `clientMessageId` unique 인덱스로 멱등 처리 |
| `.env` 커밋 | `.env*`는 gitignore, 비밀은 환경변수로만 |

재사용할 코드는 없다. Socket.IO 대신 WebFlux 기본 WebSocket + 직접 정의한 JSON 프로토콜을 쓴다.

## 스택

- Java 25, Spring Boot 4.1, Gradle(Kotlin DSL)
- Spring WebFlux, Reactor, Spring Data Reactive MongoDB
- Spring Security OAuth2 Resource Server(reactive JWT) — Firebase ID token 검증
- 로컬: Docker Compose의 MongoDB (`spring-boot-docker-compose`가 `bootRun` 때 자동 실행)
- 테스트: JUnit 5, Testcontainers(MongoDB), WebTestClient

### Firebase token 검증을 Admin SDK가 아닌 JWT 검증으로 하는 이유

Firebase ID token은 표준 JWT다. 공개키(JWK set)와 `iss`/`aud`만 확인하면 되고, Spring Security의
reactive JWT decoder가 이걸 non-blocking으로 처리한다. Firebase Admin SDK의 `verifyIdToken`은 blocking이라
reactive chain에 넣으려면 별도 스케줄러가 필요하다. Admin SDK는 FCM을 붙일 때만 도입한다.

- JWK set: `https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com`
- `iss` = `https://securetoken.google.com/<projectId>`, `aud` = `<projectId>`
- `sub` = Firebase uid

## 패키지 (modular monolith)

```text
com.buddychat
 ├ common     공통 설정, 에러 응답
 ├ auth       SecurityConfig, 현재 사용자(uid) 꺼내기
 ├ user       User, /api/me
 ├ room       Room, Invitation, 멤버 관리
 ├ chat       Message, 히스토리 조회
 ├ buddy      Buddy 규칙과 상태 변경
 └ realtime   WebSocket handler, 세션 레지스트리(메모리), 이벤트 전달
```

모듈끼리는 service를 통해서만 호출한다. 다른 모듈의 repository를 직접 쓰지 않는다.

## 컬렉션

```text
users        { _id, firebaseUid (unique), displayName, roomId?, createdAt }
rooms        { _id, memberIds [1..2], memberCount, buddy { name, exp, lastFedAt, lastCleanedAt,
               lastPoopAt, ... }, createdAt, version }
messages     { _id, roomId, senderId?, type (TEXT | SYSTEM | BUDDY_EVENT), content,
               clientMessageId, createdAt }
invitations  { _id, roomId, code (unique), createdBy, expiresAt, usedAt?, usedBy? }
```

- **Buddy는 room에 embed한다.** room과 1:1로 생성·삭제되고 항상 같이 읽는다. 밥주기·청소를 room 문서
  하나의 atomic update로 처리할 수 있다.
- **멤버 최대 2명**은 조건부 update 하나로 보장한다:
  `updateOne({ _id, memberCount: { $lt: 2 }, memberIds: { $ne: uid } }, { $push: { memberIds: uid }, $inc: { memberCount: 1 } })`
  수정된 문서가 없으면 가득 찬 것. 동시에 두 명이 수락해도 한 명만 성공한다.
- **메시지 멱등성**: `{ roomId, senderId, clientMessageId }` unique 인덱스. 중복 키 에러면 기존 메시지를 찾아 그대로 ack.
- **히스토리**: `{ roomId: 1, _id: -1 }` 인덱스, `_id < cursor` 커서 페이지네이션.
- **Buddy 상태는 조회 시점에 계산**(§36): 배고픔·똥은 `lastFedAt`·`lastCleanedAt`과 현재 시각으로 계산한다. 스케줄러 없음.
- 한 사용자는 room 하나에만 속한다(MVP). `users.roomId`로 찾는다.
- Azure DocumentDB 호환을 위해 트랜잭션, change stream, aggregation 고급 연산자는 쓰지 않는다.

## REST API

모든 요청은 `Authorization: Bearer <Firebase ID token>`.

| Method | Path | 설명 |
| --- | --- | --- |
| GET | `/api/me` | 내 정보. 첫 호출 때 user 생성 |
| POST | `/api/rooms` | 내 room 생성(solo, Buddy 알) |
| GET | `/api/rooms/me` | 내 room, 멤버, Buddy 상태 |
| POST | `/api/rooms/me/invitations` | 초대 코드 발급 |
| POST | `/api/invitations/{code}/accept` | 초대 수락 → room 참가 |
| GET | `/api/rooms/me/messages?before=&after=&limit=` | 타임라인(최신순, limit ≤ 50). `before`: 이전 페이지, `after`: 재연결 후 놓친 메시지. 응답 `{ messages, hasMore }` |

## WebSocket 프로토콜

`wss://<host>/ws`. 브라우저 WebSocket은 헤더를 못 붙이므로 **첫 메시지로 인증**한다(token을 URL에 넣지 않는다).
서버가 먼저 `hello`를 보내고, 클라이언트는 그걸 받은 뒤에 `auth`를 보낸다. 업그레이드 직후 바로 보낸 프레임은
서버가 읽기 시작하기 전에 도착해 사라질 수 있다(Linux/epoll에서 재현). 5초 안에 첫 메시지가 없으면 끊는다.

```text
client → server
  { type: "auth", token }
  { type: "send", clientMessageId, text }
  { type: "typing", typing: true|false }
  { type: "read", messageId }
  { type: "ping" }

server → client
  { type: "hello" }                               연결됨, 이제 auth를 보내도 됨
  { type: "ready" }                               인증 완료
  { type: "ack", clientMessageId, message }       내 메시지 저장 완료(재전송이어도 같은 응답)
  { type: "message", message }                    상대 메시지, Buddy 이벤트
  { type: "member", userId, displayName }         친구가 초대를 수락함(solo → duo)
  { type: "buddy", buddy }                         Buddy 상태 변경(돌봄, 경험치)
  { type: "typing", userId, typing }
  { type: "presence", userId, online }
  { type: "read", userId, messageId }
  { type: "buddy", buddy }                        Buddy 상태 변경
  { type: "error", code }
  { type: "pong" }
```

- 에러 코드: `UNAUTHORIZED`(토큰 불량·첫 메시지가 auth가 아님), `AUTH_TIMEOUT`, `ROOM_NOT_FOUND`(room 없음) → 연결 종료.
  `INVALID_MESSAGE`(빈 문자열·2000자 초과, `clientMessageId` 포함), `INVALID_EVENT`(읽을 수 없는 메시지) → 연결 유지.
- 연결은 인증 시점의 room에 묶인다. 초대를 수락해 room이 바뀌면 앱이 다시 연결한다.
- 한 연결의 이벤트는 순서대로 처리한다(보낸 순서 = 저장 순서).
- 재연결하면 클라이언트는 마지막으로 받은 메시지 이후를 REST로 채우고, ack 못 받은 메시지를 같은 `clientMessageId`로 다시 보낸다.
- 세션·presence·typing은 서버 메모리에만 둔다(§65.7). 재배포하면 사라지는 것을 전제로 한다.
- Container Apps의 유휴 연결 타임아웃 때문에 서버가 25초마다 ping 프레임을 보낸다.

## 마일스톤

1. **S1 서버 뼈대**: 프로젝트, 로컬 Mongo, Firebase token 검증, `/api/me`, CI
2. **S2 Room**: room 생성, 초대 코드, 수락(2명 제한 동시성 테스트)
3. **S3 Chat**: 메시지 저장·히스토리, WebSocket 인증·전송·ack·멱등성
4. **S4 앱 연결**: 목업을 서버 데이터로 교체, 재연결
5. **S5 Buddy**: 서버 규칙, 밥주기·청소(동시성), 타임라인 이벤트, 메시지 EXP 하루 상한
6. **S6 Presence·Typing·Read**
7. **S7 배포**: Container Apps, DocumentDB, Terraform
8. **S8 Push**: FCM / APNs

## Buddy 규칙 (S5)

수치는 `server/.../buddy/BuddyRules.java` 한 곳에 있고 임시값이다(기획 §62).

- **저장하는 것**: `exp`, `bornAt`, `lastFedAt`, `lastCleanedAt`, 오늘 메시지 EXP 카운터. 배고픔·똥은 저장하지 않고
  조회 시점에 계산한다. 앱은 서버가 계산한 `BuddyView`(level, stage, fullness, poops, canFeed, canClean)를 그대로 보여준다.
- **배고픔**: 밥을 먹은 뒤 12시간에 걸쳐 100 → 0. 80 미만이면 밥을 줄 수 있고, 30 이하면 "배고파요".
- **똥**: 청소 뒤 6시간마다 하나, 최대 3개. 있으면 청소할 수 있다.
- **경험치**: 밥 +2, 청소 +2, 메시지 +1(room당 하루 50까지, 일본 시간 기준). 레벨당 20.
  단계: 알(Lv1) → 아기(Lv2) → 어린이(Lv5) → 어른(Lv10). 죽지 않는다.
- **타임라인 이벤트**: `FED`, `CLEANED`(누가 했는지 포함), `EVOLVED`는 일어날 때, `HUNGRY`, `POOPED`는 누군가
  앱을 열거나(`GET /api/rooms/me`) 연결할 때 기록한다. 원인 시각으로 만든 키(`buddy:hungry:<lastFedAt>` 등)가
  메시지 unique 인덱스에 걸려서 여러 번 확인해도 한 번만 남는다. 스케줄러가 없다.
- **동시성**: 밥주기는 `lastFedAt < 지금 - 2.4h`, 청소는 `lastCleanedAt <= 지금 - 6h` 조건부 update. 둘이 동시에 눌러도
  한 번만 적용되고, 진 쪽은 `changed: false`와 현재 상태를 받는다. 메시지 EXP 상한도 조건부 update 두 단계로 지킨다.
- API: `POST /api/rooms/me/buddy/feed`, `POST /api/rooms/me/buddy/clean` → `{ buddy, changed }`.
  변화는 room 전체에 `message`(타임라인 이벤트)와 `buddy`(새 상태) WebSocket 이벤트로 전달된다.

## Room·초대 규칙 (S2에서 확정)

- 초대 코드: 8자리(헷갈리는 0/O, 1/I/L 제외), 24시간 유효, 한 번만 사용. 대소문자 구분 없음.
- 이미 solo room이 있는 사람이 초대를 수락하면 `LEAVE_CONFIRMATION_REQUIRED`를 받는다. 앱이 "지금 Buddy는 사라져요"를
  확인받고 `leaveCurrentRoom: true`로 다시 요청하면 참가하고, 기존 solo room과 Buddy는 삭제된다.
- 다른 멤버가 있는 room에 있는 사람은 다른 room에 참가할 수 없다(`ALREADY_IN_ROOM`). 나가기는 MVP 밖.
- 동시성: 초대 사용은 `usedAt: null` 조건부 update, 참가는 `memberCount < 2` 조건부 update로 보장한다.
  같은 room의 서로 다른 코드가 동시에 수락되어 자리가 없으면, 진 쪽의 초대는 사용 처리를 되돌린다.
- 트랜잭션이 없으므로 참가 → 사용자 roomId 변경 → 기존 room 삭제 순서로 처리한다. 중간에 실패하면
  주인 없는 solo room이 남을 수 있지만 사용자에게는 보이지 않는다.

에러 코드(응답 본문 `{ "code": "..." }`, 문구는 앱이 정한다):

| code | HTTP | 상황 |
| --- | --- | --- |
| `INVALID_REQUEST` | 400 | 요청 값 검증 실패(Buddy 이름 비었거나 12자 초과 등) |
| `ROOM_NOT_FOUND` | 404 | 아직 room이 없음 |
| `ROOM_ALREADY_EXISTS` | 409 | 이미 room이 있는데 만들려고 함 |
| `ROOM_FULL` | 409 | 2명이 찬 room에 초대·참가 |
| `INVITATION_NOT_FOUND` | 404 | 없는 코드 |
| `INVITATION_EXPIRED` / `INVITATION_USED` | 410 | 만료 / 이미 사용 |
| `ALREADY_MEMBER` | 409 | 자기 room의 초대를 수락 |
| `ALREADY_IN_ROOM` | 409 | 2명 room의 멤버가 다른 room에 참가 |
| `LEAVE_CONFIRMATION_REQUIRED` | 409 | solo room을 두고 참가하려면 확인 필요 |
