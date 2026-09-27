# 서버 설계

MVP 서버 설계와 인프라. 제품 범위는 `docs/product.md`. 구현하면서 바뀌면 이 문서를 같이 고친다.

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
 ├ realtime   WebSocket handler, 세션 레지스트리(메모리), 이벤트 전달
 └ notification  푸시 토큰, 새 메시지 알림(Expo 푸시 서비스)
```

모듈끼리는 service를 통해서만 호출한다. 다른 모듈의 repository를 직접 쓰지 않는다.

## 컬렉션

```text
users        { _id, firebaseUid (unique), displayName, roomId?, createdAt }
rooms        { _id, memberIds [1..2], memberCount, createdAt,
               buddy { name, exp, bornAt, lastFedAt?, lastCleanedAt?, expDay?, messageExpToday? } }
messages     { _id, roomId, senderId?, type (TEXT | SYSTEM | BUDDY_EVENT), text?, buddyEvent?, systemEvent?, actorId?,
               clientMessageId, createdAt }
invitations  { _id, roomId, code (unique), createdBy, createdAt, expiresAt, usedAt?, usedBy? }
reads        { _id: "<roomId>:<userId>", roomId, userId, messageId, updatedAt }
push_tokens  { _id: <Expo push token>, userId, updatedAt }
```

- **Buddy는 room에 embed한다.** room과 1:1로 생성·삭제되고 항상 같이 읽는다. 밥주기·청소를 room 문서
  하나의 atomic update로 처리할 수 있다.
- **멤버 최대 2명**은 조건부 update 하나로 보장한다:
  `updateOne({ _id, memberCount: { $lt: 2 }, memberIds: { $ne: uid } }, { $push: { memberIds: uid }, $inc: { memberCount: 1 } })`
  수정된 문서가 없으면 가득 찬 것. 동시에 두 명이 수락해도 한 명만 성공한다.
- **메시지 멱등성**: `{ roomId, senderId, clientMessageId }` unique 인덱스. 중복 키 에러면 기존 메시지를 찾아 그대로 ack.
- **히스토리**: `{ roomId: 1, _id: -1 }` 인덱스, `_id < cursor` 커서 페이지네이션.
- **Buddy 상태는 조회 시점에 계산**: 배고픔·똥은 `lastFedAt`·`lastCleanedAt`과 현재 시각으로 계산한다. 스케줄러 없음.
- 한 사용자는 room 하나에만 속한다(MVP). `users.roomId`로 찾는다.
- MVP에서는 트랜잭션, change stream, 복잡한 aggregation에 기대지 않는다(DocumentDB가 지원하더라도). 단순함,
  MongoDB 호환 범위를 좁게 유지하기, 이식성 때문이다. 동시성은 조건부 atomic update와 unique 인덱스로 해결한다.
- **메시지 순서는 `_id` 하나로 정한다.** 히스토리 페이지네이션, 재연결 catch-up, 앱의 타임라인 정렬, 읽음 위치가
  모두 `_id` 순서를 쓴다. ObjectId는 대략적인 시간순일 뿐이지만(초 단위 + 프로세스별 random + counter) 한 서버
  프로세스 안에서는 counter 덕분에 계속 커진다. 레플리카가 1개라 어긋날 수 있는 건 재배포 순간 두 프로세스가 같은
  초에 만든 메시지뿐이고, 그래도 모든 기능이 같은 순서를 보므로 서로 모순되지 않는다. 정확한 순서가 필요해지면
  room별 sequence를 도입한다.

## REST API

모든 요청은 `Authorization: Bearer <Firebase ID token>`.

| Method | Path | 설명 |
| --- | --- | --- |
| GET | `/api/me` | 내 정보. 첫 호출 때 user 생성(이름은 토큰의 name, 게스트는 없음) |
| PATCH | `/api/me` | 내 이름 바꾸기 `{ displayName }`(1~20자). 게스트는 처음에 여기서 이름을 정한다. Google을 연결해도 uid가 같아 이름은 유지 |
| POST | `/api/rooms` | 내 room 생성(solo, Buddy 알) |
| GET | `/api/rooms/me` | 내 room, 멤버, Buddy 상태 |
| POST | `/api/rooms/me/invitations` | 초대 코드 발급 |
| POST | `/api/invitations/{code}/accept` | 초대 수락 → room 참가 |
| POST | `/api/rooms/me/leave` | room 나가기 → 204(아래 Room 규칙) |
| GET | `/api/rooms/me/messages?before=&after=&limit=` | 타임라인(최신순, limit ≤ 50). `before`: 이전 페이지, `after`: 재연결 후 놓친 메시지. 응답 `{ messages, hasMore }` |
| POST | `/api/me/push-tokens` | 이 기기의 Expo 푸시 토큰 등록 `{ token }` → 204. 다른 사용자가 갖고 있던 토큰이면 이쪽으로 옮긴다 |
| DELETE | `/api/me/push-tokens/{token}` | 로그아웃할 때 토큰 삭제(자기 것만) → 204 |

## WebSocket 프로토콜

`wss://<host>/ws`. 브라우저 WebSocket은 헤더를 못 붙이므로 **첫 메시지로 인증**한다(token을 URL에 넣지 않는다).
서버가 먼저 `hello`를 보내고, 클라이언트는 그걸 받은 뒤에 `auth`를 보낸다. 업그레이드 직후 바로 보낸 프레임은
서버가 읽기 시작하기 전에 도착해 사라질 수 있다(Linux/epoll에서 재현). 5초 안에 첫 메시지가 없으면 끊는다.

```text
client → server
  { type: "auth", token }
  { type: "send", clientMessageId, text }
  { type: "typing", typing: true|false }          입력 중이면 3초마다 다시 보낸다
  { type: "read", messageId }                     화면에 보이는 가장 최근 상대 메시지(또는 Buddy 이벤트)
  { type: "ping" }

server → client
  { type: "hello" }                               연결됨, 이제 auth를 보내도 됨
  { type: "ready", userId, roomId, online, reads } 인증 완료. online: 지금 접속한 다른 멤버,
                                                  reads: 멤버별 마지막으로 읽은 메시지 id
  { type: "ack", clientMessageId, message }       내 메시지 저장 완료(재전송이어도 같은 응답)
  { type: "message", message }                    상대 메시지, Buddy 이벤트
  { type: "member", userId, displayName }         친구가 초대를 수락함(solo → duo)
  { type: "left", userId }                         친구가 나감(duo → solo). 타임라인에는 SYSTEM MEMBER_LEFT 메시지
  { type: "buddy", buddy }                         Buddy 상태 변경(돌봄, 경험치)
  { type: "typing", userId, typing }              다른 멤버에게만. 6초 동안 다시 안 오면 앱이 지운다
  { type: "presence", userId, online }            그 사용자의 첫 연결이 열리거나 마지막 연결이 닫힐 때
  { type: "read", userId, messageId }             읽음 위치가 앞으로 움직였을 때만
  { type: "error", code }
  { type: "pong" }
```

- 에러 코드: `UNAUTHORIZED`(토큰 불량·첫 메시지가 auth가 아님), `AUTH_TIMEOUT`, `ROOM_NOT_FOUND`(room 없음) → 연결 종료.
  `INVALID_MESSAGE`(빈 문자열·2000자 초과, `clientMessageId` 포함), `INVALID_EVENT`(읽을 수 없는 메시지),
  `INVALID_REQUEST`(다른 room이나 없는 메시지를 읽음 처리) → 연결 유지. `TOKEN_EXPIRED` → 연결 종료(앱이 재연결).
- 토큰은 연결할 때 한 번 확인한다. 토큰의 `exp`가 되면 서버가 `TOKEN_EXPIRED`를 보내고 연결을 닫는다. 앱은 재연결하면서
  Firebase에서 새 토큰을 받아 다시 인증한다. 즉시 폐기(로그아웃·정지) 확인은 하지 않고 토큰 수명(1시간)만큼 늦는 걸 허용한다.
- 연결은 인증 시점의 room에 묶인다. 초대를 수락해 room이 바뀌면 앱이 다시 연결한다.
- 한 연결의 이벤트는 순서대로 처리한다(보낸 순서 = 저장 순서).
- 재연결하면 클라이언트는 마지막으로 받은 메시지 이후를 REST로 채우고, ack 못 받은 메시지를 같은 `clientMessageId`로 다시 보낸다.
- 세션·presence·typing은 서버 메모리에만 둔다(아래 인프라). 재배포하면 사라지는 것을 전제로 한다.
  presence는 연결에서 계산한다(한 사람이 기기 여러 대로 접속해도 하나로 본다). 한 room의 입장·퇴장은 순서대로
  처리해서 online/offline 이벤트 순서가 뒤바뀌지 않는다.
- 읽음은 `reads` 컬렉션에 멤버별로 저장하고 앞으로만 움직인다: `messageId < 새 id` 조건부 upsert. 맞는 문서가
  없으면 upsert가 같은 `_id`로 insert하려다 중복 키에 걸린다. 중복 키는 "이미 있다"는 뜻일 뿐 "더 뒤다"는 뜻이 아니다:
  첫 읽음이 동시에 오면 더 오래된 쪽이 먼저 insert할 수 있다. 그래서 중복 키면 같은 조건으로 한 번 더(upsert 없이)
  update한다. 비교는 타임라인과 같은 `_id` 순서다(위 컬렉션
  참고, 16진 문자열 비교 = ObjectId 비교).
  앱은 상대가 읽은 위치 이하인 내 메시지 중 가장 최근 것에 "읽음"을 표시한다.
- Container Apps의 유휴 연결 타임아웃 때문에 서버가 25초마다 ping 프레임을 보낸다.

## 푸시 알림 (S8)

- **경로**: 앱이 `expo-notifications`로 받은 Expo 푸시 토큰을 등록하고, 서버가 Expo 푸시 API로 보내면 Expo가 APNs(나중에
  Android는 FCM)로 전달한다. 기기에 네이티브 Firebase SDK가 필요 없다(Firebase는 JS SDK만). APNs 키는 EAS가 관리한다.
- **무엇을 보내나**: 상대의 새 텍스트 메시지만. 제목은 보낸 사람 이름, 본문은 메시지(180자까지). Buddy 이벤트는 보내지 않는다.
- **누구에게**: 메시지를 저장하고 **3초 뒤에도 그 메시지까지 읽지 않은** 다른 멤버의 모든 기기. 채팅을 보고 있는 앱은
  1초 안에 읽음을 보내므로 알림이 가지 않는다. 연결 여부(presence)로 판단하지 않는 이유: iOS가 앱을 멈춘 뒤 서버가
  끊김을 알아채기까지(ping 실패) 수십 초 동안 "접속 중"으로 보이는 틈이 있다. 읽음 기준이면 그 틈, 백그라운드,
  숨긴 웹 탭까지 한 규칙으로 처리된다. 메시지 전송(ack)은 알림을 기다리지 않는다.
- **무효 토큰**: 보낼 때 받는 ticket과 약 15분 뒤 조회하는 receipt에서 `DeviceNotRegistered`면 토큰을 지운다.
  receipt 확인은 스케줄러 없이 메모리에서 지연 실행하므로 재배포되면 그 사이 것은 빠진다(다음 전송에서 다시 걸린다).
- 설정: `buddychat.push.grace-period`(3s), `receipt-delay`(15m), `expo-access-token`(Expo의 강화 보안을 켤 때).

## 인프라 (S7)

```text
iPhone / Web ──HTTPS·WSS──▶ Azure Container Apps (Spring WebFlux, Docker) ──▶ Azure DocumentDB (MongoDB 호환)
                             외부: Firebase Authentication, Firebase Cloud Messaging(S8)
```

- **백엔드**: Docker 이미지 → Azure Container Registry → Azure Container Apps. VM에 앱과 DB를 같이 올리지 않는다.
- **레플리카**: `maxReplicas = 1`. 처음엔 비용 때문에 `minReplicas = 0`, 콜드 스타트(JVM 기동 동안 첫 연결이 몇 초
  걸림)가 채팅 UX를 해치면 `1`로 올린다. 재배포하면 메모리의 연결·presence·typing이 사라지므로 앱은 재연결을
  전제로 한다. 유휴 연결 타임아웃 때문에 서버가 25초마다 ping을 보낸다.
- **DB**: Azure DocumentDB. MongoDB 자체가 아니라 MongoDB 호환이므로 CRUD, 인덱스 조회, 커서 페이지네이션,
  조건부 atomic update, unique 인덱스만 쓴다(위 컬렉션 참고).
  README 등에는 "Azure DocumentDB (MongoDB-compatible)"로 적는다. 확인할 것은 마일스톤 S7 참고.
- **웹 앱**: Azure Static Web Apps(Free, `stapp-buddy-chat-prod`)에 `expo export -p web` 결과(정적 파일)를 올린다.
  무료 플랜: 커스텀 도메인 2개, 자동 갱신 SSL, 전 세계 배포, 앱 250MB. Expo는 route마다 `<route>.html`을 만들고
  Static Web Apps는 `<route>/index.html`을 찾으므로 `app/scripts/static-web-app-config.mjs`가 export 뒤에 rewrite 규칙을
  만든다(`pnpm build:web`). `EXPO_PUBLIC_*`(서버 주소, Firebase 웹 설정)는 빌드에 들어가는 공개 값이라 repo variables로 둔다.
  배포 토큰은 저장하지 않고 배포 identity가 매번 읽는다. 서버 CORS에는 웹 주소와 `web_origins`(커스텀 도메인, 로컬 dev)가 들어간다.
- **도메인(구매 후)**: 웹 `<domain>` → Static Web Apps 커스텀 도메인, 서버 `api.<domain>` → Container App 커스텀 도메인
  (managed certificate, 무료). Firebase 콘솔의 승인된 도메인에 웹 도메인을 추가해야 Google 로그인이 된다.
- **Redis는 쓰지 않는다.** 레플리카가 1개라 세션·presence·typing은 프로세스 메모리로 충분하다. 수평 확장이
  필요해지면 `RoomHub.publish` 뒤에 Redis Pub/Sub을 둔다.
- **Blob Storage는 쓰지 않는다.** 사진 첨부가 MVP 밖이다. 나중에 넣으면 바이너리는 Blob, 메타데이터만 DB.
- **ur-manager와 공유하는 것은 Container Registry(`acurmanagerur26jp01`, 이미지 `buddy-chat/server`), Container Apps
  환경(`cae-ur-manager-prod`), tfstate Storage Account(`sturmanagerur26jp01`, buddy-chat 전용 container
  `buddy-chat-tfstate`)다.** 구독에 리전당 Container Apps 환경이 하나만 허용되고 Japan East는 ur-manager가 쓰고 있다.
  셋 다 ur-manager Terraform 소유이고 buddy-chat Terraform은 `data`로 읽기만 한다. 같은 환경의 앱은 VNet과 로그
  대상(ur-manager의 Log Analytics)을 공유한다. Resource Group(`rg-buddy-chat-prod`), Container App, DocumentDB,
  Managed Identity, secret, 배포 권한은 전부 buddy-chat 것이다. buddy-chat을 destroy해도 ur-manager에 영향이 없다.
- **Terraform**(`infra/`): RG, DocumentDB(free tier) + 방화벽, Container App, 이미지 pull용 identity(공유 ACR에
  AcrPull), 배포용 identity. 재현 가능한 배포에 필요한 만큼만.
- **배포**(`.github/workflows/deploy.yml`): main에서 CI가 통과하면 buddy-chat 전용 배포 identity로 OIDC 로그인
  (저장된 비밀 없음) → 이미지 빌드·push → `az containerapp update` → health 확인. 권한은 공유 ACR에 AcrPush,
  buddy-chat Container App에 Contributor뿐이다. 이미지 태그는 `server/` 트리 해시라서 앱만 바뀐 push는
  재배포하지 않는다(새 리비전은 모든 WebSocket을 끊는다). 이미지는 Terraform이 아니라 이 workflow가 바꾼다.
- **DocumentDB 방화벽은 MVP용으로 일부러 넓게 열었다**: 포털의 "Azure 서비스 허용"과 같은 0.0.0.0 규칙이라 다른
  고객의 Azure 리소스에서도 네트워크상으로는 닿는다. Container Apps(consumption)는 나가는 IP가 고정이 아니어서
  좁힐 방법이 마땅치 않다. 접속에는 비밀번호(32자, Terraform이 만들어 Container App secret으로만 전달)와 TLS가
  필요하다. 사용자가 늘거나 민감한 데이터가 생기면 VNet 통합 + Private Endpoint로 바꾼다.
- tfstate(`buddy-chat-tfstate`)는 비공개 container다. 계정 단위로 공개 접근과 shared key가 꺼져 있어 Entra RBAC로만
  읽는다. state에 DB 비밀번호가 들어 있다. 단, 같은 Storage Account를 쓰는 ur-manager 배포 principal도 계정 범위의
  Blob 권한이 있어 읽을 수 있다(공유의 대가, 필요하면 그쪽 권한을 container 범위로 좁힌다).
- **리전**: 일본 사용자 우선이라 Japan East(서비스별 지원·무료 조건은 만들 때 확인).
- 쓰지 않는 것: Redis, Blob Storage, VM, self-hosted MongoDB, MongoDB Atlas, Cosmos DB for MongoDB, Firestore,
  Kafka, Kubernetes/AKS.

### 공유 인프라 이름 (정책만 정함, 적용은 나중에)

개인 Azure 구독을 여러 사이드 프로젝트가 같이 쓰고 앞으로 더 늘어난다. 지금 공유 중인 ACR·Container Apps 환경·tfstate
Storage는 이름이 ur-manager에 묶여 있어(`cae-ur-manager-prod` 안에 buddy-chat이 들어가 있는 식) 실제 역할과 어긋난다.

- 공유 리소스: `<type>-personal-<env>-<region>` — 예: `cae-personal-prod-jpe`, `log-personal-prod-jpe`, ACR은 `acrpersonal…`
  (ACR·Storage는 하이픈 불가, 전역 고유)
- 프로젝트 전용 리소스: `<type>-<project>-<env>` — 예: `ca-buddy-chat-prod`, `id-buddy-chat-prod`, `ca-ur-manager-prod`
- 지금은 이름을 바꾸지 않는다. Azure 리소스는 이름을 바꾸려면 대개 새로 만들고 옮겨야 한다(환경은 새 환경 생성 → 앱 이동).
  S7 뒤 별도 인프라 정리 작업으로, 공유 리소스를 한 번에 맞출 필요 없이 하나씩 옮긴다. 공유 리소스는 별도 Terraform
  (공용 state)이 소유하고, 각 프로젝트는 `data`로 읽는 구조는 그대로 둔다.

## 마일스톤

1. **S1 서버 뼈대**: 프로젝트, 로컬 Mongo, Firebase token 검증, `/api/me`, CI
2. **S2 Room**: room 생성, 초대 코드, 수락(2명 제한 동시성 테스트)
3. **S3 Chat**: 메시지 저장·히스토리, WebSocket 인증·전송·ack·멱등성
4. **S4 앱 연결**: 목업을 서버 데이터로 교체, 재연결
5. **S5 Buddy**: 서버 규칙, 밥주기·청소(동시성), 타임라인 이벤트, 메시지 EXP 하루 상한
6. **S6 Presence·Typing·Read**
7. **S7 배포**: Container Apps, DocumentDB, Terraform. 배포 후 확인할 것:
   - WebSocket을 15분 이상 유지: 25초 ping이 계속되고, 그 뒤 메시지를 보내고 받는다. 일반 HTTP 요청 timeout(240초)이나
     유휴 timeout이 업그레이드된 연결에 어떻게 적용되는지 문서로 가정하지 않고 실제로 본다.
   - 아이폰 백그라운드 → 포그라운드 → 재연결(2026-09-27 확인: 웹에서 보낸 메시지를 복귀 즉시 받음), 토큰 만료 뒤 재연결
   - DocumentDB: unique 인덱스가 null/없는 필드(Buddy 이벤트의 `senderId`)를 MongoDB처럼 하나의 값으로 다루는지,
     `$or` 조건부 update, 중복 키 upsert(읽음 위치)가 같은지
   - **결과(2026-09-27, PR #4)**: 서버 테스트 58개를 실제 DocumentDB에서 전부 통과. 배포된 서버에서 16분 idle 뒤에도
     WebSocket 유지(240초 요청 timeout은 업그레이드된 연결에 적용되지 않음), 재연결 0.14초, 토큰 만료 시각에
     `TOKEN_EXPIRED` → 새 토큰으로 재연결, 아이폰 백그라운드 복귀 정상. 메시지 전달 30~400ms.
   - **남은 것(blocker 아님)**: scale-to-zero 뒤 첫 접속 시간. 열린 WebSocket이 있으면 0대로 줄지 않으므로 앱과 웹을 모두
     닫고 10~20분 뒤 잰다. 불편할 만큼 길면 `minReplicas = 1`을 검토한다. `main` 자동 배포(CI 안의 deploy job)는 확인 완료.
8. **S8 Push**: FCM / APNs. 상대가 오프라인일 때 상대 메시지만 알린다(Buddy 알림 없음).
   iOS는 결국 APNs를 거치므로 `expo-notifications`로 할지 FCM으로 할지 이때 정한다. 개발용 빌드와
   Apple Developer Program이 필요하다. Firebase Admin SDK는 이때 도입한다.

## Buddy 규칙 (S5)

수치는 `server/.../buddy/BuddyRules.java` 한 곳에 있고 임시값이다(`docs/product.md`의 "아직 정하지 않은 것").

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
- 다른 멤버가 있는 room에 있는 사람은 다른 room에 참가할 수 없다(`ALREADY_IN_ROOM`). 먼저 나가야 한다.
- **나가기**(`POST /api/rooms/me/leave`): 2명 room이면 남은 사람이 room과 Buddy를 그대로 갖고, `left` 이벤트와
  SYSTEM `MEMBER_LEFT` 메시지(text = 나간 사람 이름, 더는 멤버가 아니므로)를 받는다. 혼자 room이면 room·Buddy·기록이
  지워진다. 나간 사람의 다른 기기 연결은 `ROOM_NOT_FOUND`로 닫힌다. 순서: room에서 빼기(조건부) → 사용자 roomId 비우기
  (조건부) → 빈 room이면 삭제 + 기록 삭제. 둘이 동시에 나가면 room을 비운 쪽이 지운다. 먼저 나간 쪽의 SYSTEM 메시지가
  그 뒤에 저장될 수 있어서, 저장 뒤 room이 없으면 기록을 한 번 더 지운다(테스트로 잡은 경쟁). 다시 나가면 중간에 멈춘
  나가기를 끝낸다. 초대 수락으로 solo room을 떠날 때도 기록을 함께 지운다.
- 동시성: 초대 사용은 `usedAt: null` 조건부 update, 참가는 `memberCount < 2` 조건부 update로 보장한다.
  같은 room의 서로 다른 코드가 동시에 수락되어 자리가 없으면, 진 쪽의 초대는 사용 처리를 되돌린다.
- 트랜잭션이 없으므로 초대 사용 → 참가 → 사용자 roomId 변경 → 기존 room 삭제 순서로 처리한다. 중간에 실패하면
  (예: 참가는 됐는데 roomId 변경 실패) 같은 사용자가 같은 코드를 다시 수락했을 때 멈춘 곳부터 이어서 끝낸다.
  초대의 `usedBy`가 자신이면 사용된 코드여도 통과하고, 이미 멤버면 참가 성공으로 본다. 앱은 에러 뒤 다시
  시도하기만 하면 된다. 끝내 다시 시도하지 않으면 그 자리는 유령 멤버로 남는다(MVP에서는 감수).

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
