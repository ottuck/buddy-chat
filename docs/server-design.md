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
 ├ account    계정 삭제(여러 모듈의 service를 차례로 부른다)
 ├ room       Room, Invitation, 멤버 관리
 ├ chat       Message, 히스토리 조회
 ├ buddy      Buddy 규칙과 상태 변경
 ├ realtime   WebSocket handler, 세션 레지스트리(메모리), 이벤트 전달
 └ notification  푸시 토큰, 새 메시지 알림(Expo 푸시 서비스)
```

모듈끼리는 service를 통해서만 호출한다. 다른 모듈의 repository를 직접 쓰지 않는다.

## 컬렉션

```text
users        { _id, firebaseUid (unique), displayName, roomId?, createdAt, guest?, lastSeenAt? }
rooms        { _id, memberIds [1..2], memberCount, createdAt, album? [{ name, bornAt, graduatedAt }],
               buddy { name, exp, bornAt, lastFedAt?, lastCleanedAt?, poopsCleaned?, expDay?, messageExpToday?,
                       talkDay?, talkers?, togetherDay? } }
messages     { _id, roomId, senderId?, type (TEXT | SYSTEM | BUDDY_EVENT), text?, buddyEvent?, systemEvent?, actorId?,
               clientMessageId, createdAt }
invitations  { _id, roomId, code (unique), createdBy, createdAt, expiresAt, usedAt?, usedBy? }
reads        { _id: "<roomId>:<userId>", roomId, userId, messageId, updatedAt }
push_tokens  { _id: <Expo push token | Web Push endpoint>, userId, updatedAt, p256dh?, auth? }
settings     { _id: "buddy", expPerLevel }
```

- `push_tokens`의 `p256dh`·`auth`는 Web Push 구독의 암호화 키다. Expo 토큰이면 없다.
- `settings`는 서버가 마지막으로 쓴 레벨당 EXP를 기록한다(아래 Buddy 규칙).

- **Buddy는 room에 embed한다.** room과 1:1로 생성·삭제되고 항상 같이 읽는다. 밥주기·청소를 room 문서
  하나의 atomic update로 처리할 수 있다.
- **멤버 최대 2명**은 조건부 update 하나로 보장한다:
  `updateOne({ _id, memberCount: { $lt: 2 }, memberIds: { $ne: uid } }, { $push: { memberIds: uid }, $inc: { memberCount: 1 } })`
  수정된 문서가 없으면 가득 찬 것. 동시에 두 명이 수락해도 한 명만 성공한다.
- **메시지 멱등성**: `{ roomId, senderId, clientMessageId }` unique 인덱스. 중복 키 에러면 기존 메시지를 찾아 그대로 ack.
- **히스토리**: `{ roomId: 1, _id: -1 }` 인덱스, `_id < cursor` 커서 페이지네이션.
- **Buddy 상태는 조회 시점에 계산**: 배고픔·똥은 `lastFedAt`·`lastCleanedAt`과 현재 시각으로 계산한다. 스케줄러 없음.
- 한 사용자는 room 하나에만 속한다(MVP). `users.roomId`로 찾는다.
- MVP에서는 트랜잭션, change stream, 복잡한 aggregation에 기대지 않는다(DB가 지원하더라도). 단순함,
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
| DELETE | `/api/me` | 계정 삭제 → 204(아래 계정 삭제). Firebase 계정은 앱이 이어서 지운다 |
| POST | `/api/rooms` | 내 room 생성(solo, Buddy 알) |
| GET | `/api/rooms/me` | 내 room, 멤버, Buddy 상태 |
| POST | `/api/rooms/me/invitations` | 초대 코드 발급 |
| POST | `/api/invitations/{code}/accept` | 초대 수락 → room 참가 |
| POST | `/api/rooms/me/leave` | room 나가기 → 204(아래 Room 규칙) |
| GET | `/api/rooms/me/messages?before=&after=&limit=` | 타임라인(최신순, limit ≤ 50). `before`: 이전 페이지, `after`: 재연결 후 놓친 메시지. 응답 `{ messages, hasMore }` |
| POST | `/api/me/push-tokens` | 이 기기의 Expo 푸시 토큰 등록 `{ token }` → 204. 다른 사용자가 갖고 있던 토큰이면 이쪽으로 옮긴다 |
| DELETE | `/api/me/push-tokens/{token}` | 로그아웃하거나 앱 설정에서 알림을 끌 때 토큰 삭제(자기 것만) → 204 |

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
  { type: "buddy", buddy }                         Buddy 상태 변경(돌봄, 경험치, 새로 알게 된 배고픔·💩)
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
- 호스팅 프록시의 유휴 연결 타임아웃 때문에 서버가 25초마다 ping 프레임을 보낸다.

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
- **끄기**: 앱 설정의 알림 스위치는 기기별이다. 끄면 그 기기 토큰을 서버에서 지워서 아예 보내지 않는다. 서버에 사용자별
  알림 설정은 두지 않는다.

### 웹 푸시

아이폰 앱(개발용 빌드)이 나오기 전에도 휴대폰 웹으로 채팅앱처럼 쓸 수 있게, 같은 규칙(3초 뒤에도 안 읽었으면)으로 브라우저에도
보낸다. 브라우저 표준 Web Push라 Apple 계정·네이티브 모듈이 필요 없다.

- **앱(웹)**: `public/manifest.webmanifest`와 아이콘으로 설치할 수 있고(홈 화면, 전체 화면), `public/sw.js`(서비스 워커)가 알림을
  띄우고 누르면 채팅을 연다. 설정의 알림 스위치에서만 권한을 묻는다(브라우저는 사용자 동작 중에만 허용). 켜면 서버 키로 구독해
  `POST /api/me/web-push { endpoint, p256dh, auth }`, 끄거나 로그아웃하면 `DELETE /api/me/web-push?endpoint=`. 앱을 열 때마다 다시
  구독해서 서버 키가 바뀌어도 이어진다.
- **아이폰**: iOS 16.4부터, 홈 화면에 추가한 웹 앱에서만 알림을 받는다. Safari에서는 설정 카드가 "홈 화면에 추가" 방법을 안내한다.
  Android Chrome과 PC 브라우저는 그냥 허용하면 된다.
- **서버**(`notification/WebPush`, `WebPushCrypto`): 메시지를 구독 키로 암호화하고(RFC 8291 aes128gcm) VAPID(RFC 8292, ES256 JWT)로
  서명해 브라우저의 푸시 서비스로 POST한다. JDK 암호화만 쓰고(라이브러리는 블로킹 HTTP와 BouncyCastle을 끌고 온다) WebClient로
  보낸다. 암호화는 RFC 8291 부록의 예제로 테스트한다. 구독은 `push_tokens`에 endpoint를 키로(`p256dh`, `auth` 추가) 저장한다.
  404/410이면 구독을 지운다.
- **SSRF 방지**: endpoint는 클라이언트가 보내는 URL이라, 알려진 푸시 서비스(FCM, Mozilla, Apple, Windows)의 https 주소만 받는다.
- **키**: Terraform `tls_private_key`(P-256)로 만들어 state에 두고(DB 비밀번호와 같다) 서버 변수로 넣는다(PEM).
  없으면 서버가 실행마다 임시 키를 쓴다(로컬 개발용).
- 설정: `buddychat.push.grace-period`(3s), `receipt-delay`(15m), `expo-access-token`(Expo의 강화 보안을 켤 때).

## 인프라 (S7, 2026-10 Railway·Atlas·Cloudflare로 이전)

```text
iPhone / Web ──HTTPS·WSS──▶ Railway (Spring WebFlux, Docker, 싱가포르) ──▶ MongoDB Atlas M0 (싱가포르)
웹 앱: Cloudflare Worker (정적 자산)            DNS·Terraform state: Cloudflare (puny-chat.com, R2)
외부: Firebase Authentication, Web Push(FCM·Apple·Mozilla 푸시 서비스), Expo 푸시(S8)
```

- **이전(2026-10)**: 처음에는 Azure(Container Apps, DocumentDB 무료, Static Web Apps)에 ur-manager와 환경·레지스트리·
  state를 공유해 올렸다. 서버를 항상 1대 켜두면 월 약 ¥2,000이 나왔고, 공유 때문에 이름·권한이 ur-manager에 묶였다.
  이 프로젝트만의 작은 구성으로 옮겼다: Railway Hobby(월 $5, 사용량 $5 포함), Atlas M0(무료), Cloudflare(무료).
  2026-10-01에 전환했다: 서버 health `UP`, `puny-chat.com`에서 게스트 로그인·방·메시지 확인. 그 뒤 Azure 리소스,
  공유 레지스트리의 서버 이미지, 옛 설정(`infra/azure/`)을 지웠다.
- **서버**: Railway 서비스 1개, 싱가포르(`asia-southeast1-eqsg3a`), 복제 1(연결·presence·typing이 메모리에 있다).
  항상 켜져 있어 콜드 스타트가 없다(앱의 미리 깨우기 `app/src/lib/warm-up.ts`는 남아 있다). Railway는 사용한 만큼 과금하므로
  힙을 `-Xmx384m`, SerialGC로 고정한다(`JAVA_TOOL_OPTIONS`). 유휴 연결 타임아웃 때문에 서버가 25초마다 ping을 보낸다.
  재배포하면 WebSocket이 끊기므로 앱은 재연결을 전제로 한다.
- **DB**: MongoDB Atlas M0(무료, 512MB, 초당 100 ops), 싱가포르 AWS. 서버와 같은 도시라 쿼리마다 왕복이 짧다.
  Railway Hobby는 나가는 IP가 고정이 아니어서 Atlas 접근 목록을 0.0.0.0/0으로 두었다. 비밀번호(32자, Terraform이 만들어
  Railway 변수로만 전달)와 TLS가 막는다. 사용자가 늘면 Railway의 고정 IP(Pro) 또는 Atlas 유료 티어의 private networking을 쓴다.
  DocumentDB 때 정한 대로 트랜잭션·change stream·복잡한 aggregation에 기대지 않는 원칙은 그대로 둔다(단순함).
  이전 때 데이터는 옮기지 않고 새로 시작했다.
- **웹 앱**: Cloudflare Worker의 정적 자산(스크립트 없음, `app/wrangler.jsonc`). Cloudflare가 새 프로젝트에 Pages보다
  Workers를 권장한다. `pnpm build:web`이 `expo export -p web` 뒤에 `app/scripts/worker-assets.mjs`로 404 페이지와
  `_headers`(서비스 워커 no-cache 등)를 만든다. route마다 생기는 `join.html`은 `html_handling: auto-trailing-slash`가
  `/join`으로 연결한다. 커스텀 도메인 `puny-chat.com`은 wrangler 배포가 붙인다(DNS 레코드와 인증서를 Cloudflare가
  만든다. 같은 이름의 CNAME이 있으면 안 된다). `EXPO_PUBLIC_*`는 빌드에 들어가는 공개 값이라 repo variables로 둔다.
- **도메인**: 웹 `puny-chat.com`(Worker), 서버 `api.puny-chat.com`(Railway 커스텀 도메인, CNAME + 확인용 TXT를
  Terraform이 Cloudflare에 만든다, 프록시 없음). puny-chat.com은 Cloudflare Registrar에서 샀다(2026-09-30). 전에 쓰던
  buddy.pokepidia.com은 리다이렉트하지 않고 Azure와 함께 정리했다. Firebase 콘솔의
  승인된 도메인에 웹 도메인이 있어야 Google 로그인이 된다. 서버 CORS에는 웹 도메인과 로컬 Expo dev 서버가 들어간다.
- **Terraform**(`infra/`, 사용법은 `infra/README.md`): Atlas 프로젝트·M0·DB 사용자·접근 목록, Railway 프로젝트·서비스·변수·
  커스텀 도메인, Cloudflare DNS, VAPID 키. state는 Cloudflare R2(S3 호환 backend)에 둔다. 인증 정보는 `infra/.env`(git 제외)에만
  있다. Railway provider는 커뮤니티 것(terraform-community-providers/railway)이다.
- **배포**(`.github/workflows/deploy.yml`): main에서 CI가 통과하면 서버는 `railway up`(server/의 Dockerfile·`railway.json`,
  health check 뒤 전환), 웹은 `wrangler deploy`. `server/`가 바뀐 push만 서버를 다시 배포한다(새 배포는 모든 WebSocket을
  끊는다). GitHub secrets: `RAILWAY_TOKEN`(프로젝트 토큰), `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
- **Redis는 쓰지 않는다.** 레플리카가 1개라 세션·presence·typing은 프로세스 메모리로 충분하다. 수평 확장이
  필요해지면 `RoomHub.publish` 뒤에 Redis Pub/Sub을 둔다.
- **파일 저장소는 쓰지 않는다.** 사진 첨부가 MVP 밖이다. 나중에 넣으면 바이너리는 R2, 메타데이터만 DB.
- 쓰지 않는 것: VM, self-hosted MongoDB, Kubernetes, Kafka.

## 마일스톤

1. **S1 서버 뼈대**: 프로젝트, 로컬 Mongo, Firebase token 검증, `/api/me`, CI
2. **S2 Room**: room 생성, 초대 코드, 수락(2명 제한 동시성 테스트)
3. **S3 Chat**: 메시지 저장·히스토리, WebSocket 인증·전송·ack·멱등성
4. **S4 앱 연결**: 목업을 서버 데이터로 교체, 재연결
5. **S5 Buddy**: 서버 규칙, 밥주기·청소(동시성), 타임라인 이벤트, 메시지 EXP 하루 상한
6. **S6 Presence·Typing·Read**
7. **S7 배포**: 처음에는 Azure Container Apps, DocumentDB, Terraform(2026-10 Railway·Atlas·Cloudflare로 이전, 위 인프라). 배포 후 확인할 것:
   - WebSocket을 15분 이상 유지: 25초 ping이 계속되고, 그 뒤 메시지를 보내고 받는다. 일반 HTTP 요청 timeout(240초)이나
     유휴 timeout이 업그레이드된 연결에 어떻게 적용되는지 문서로 가정하지 않고 실제로 본다.
   - 아이폰 백그라운드 → 포그라운드 → 재연결(2026-09-27 확인: 웹에서 보낸 메시지를 복귀 즉시 받음), 토큰 만료 뒤 재연결
   - DocumentDB: unique 인덱스가 null/없는 필드(Buddy 이벤트의 `senderId`)를 MongoDB처럼 하나의 값으로 다루는지,
     `$or` 조건부 update, 중복 키 upsert(읽음 위치)가 같은지
   - **결과(2026-09-27, PR #4)**: 서버 테스트 58개를 실제 DocumentDB에서 전부 통과. 배포된 서버에서 16분 idle 뒤에도
     WebSocket 유지(240초 요청 timeout은 업그레이드된 연결에 적용되지 않음), 재연결 0.14초, 토큰 만료 시각에
     `TOKEN_EXPIRED` → 새 토큰으로 재연결, 아이폰 백그라운드 복귀 정상. 메시지 전달 30~400ms.
   - scale-to-zero 뒤 첫 접속은 약 21초였다. 그래서 `minReplicas = 1`로 바꿨다(적용 후 응답 0.1초 이내). 지금 Railway도 항상 1대가 켜져 있다.
     `main` 자동 배포(CI 안의 deploy job)는 확인 완료.
8. **S8 Push**: FCM / APNs. 상대가 오프라인일 때 상대 메시지만 알린다(Buddy 알림 없음).
   iOS는 결국 APNs를 거치므로 `expo-notifications`로 할지 FCM으로 할지 이때 정한다. 개발용 빌드와
   Apple Developer Program이 필요하다. Firebase Admin SDK는 이때 도입한다.

## Buddy 규칙 (S5)

수치는 `server/.../buddy/BuddyRules.java` 한 곳에 있고 임시값이다(`docs/product.md`의 "아직 정하지 않은 것").

- **저장하는 것**: `exp`, `bornAt`, `lastFedAt`, `lastCleanedAt`, 오늘 메시지 EXP 카운터, 오늘 메시지를 보낸 사람
  (`talkDay`, `talkers`)과 둘이 함께 보너스를 받은 날(`togetherDay`). 배고픔·똥은 저장하지 않고 조회 시점에 계산한다.
  앱은 서버가 계산한 `BuddyView`(level, stage, fullness, poops, canFeed, canClean, talkedToday, togetherToday)를 그대로
  보여준다.
- **배고픔**: 밥을 먹은 뒤 2시간 30분에 걸쳐 100 → 0. 80 미만이면(30분 뒤부터) 밥을 줄 수 있고, 30 이하면(1시간 45분 뒤)
  "배고파요". 2026-09-29에 12시간에서 줄였다: 잠깐 들르는 사람도 돌볼 거리가 있게.
- **똥**: 바닥이 깨끗해진 뒤(`lastCleanedAt`) 1시간마다 하나(전에는 6시간), 최대 3개. **누를 때마다 하나씩** 치운다:
  이번 주기에 치운 수(`poopsCleaned`)를 올리고, 마지막 하나를 치우면 `lastCleanedAt`을 지금으로 옮겨 새 주기를 시작한다.
  바닥의 💩 = 주기에 생긴 수 − 치운 수. 채팅의 "청소"는 한 번에 다 치운다. `POOPED` 키는 주기 안의 번호라서 하나 치워도 남은
  💩이 다시 기록되지 않는다. 한 주기에 생기는 건 최대 3개라, 일부만 치우고 두면 다 치울 때까지 늘지 않는다.
- 두 주기는 설정값이다(`buddychat.buddy.full-to-empty`, `poop-every`). 테스트는 숫자 대신 `BuddyRules.hungryAfter()`,
  `poopEvery()`로 시간을 보낸다.
- **채팅으로 돌보기**: 메시지 전체가 "밥"·"🍚"(일본어 "ごはん", 영어 "food")이면 밥주기, "청소"·"🧹"("そうじ", "clean")이면
  청소를 보낸 사람이 한 것으로 처리한다(`CareCommand`). 끝의 "!", "~", "."는 괜찮고, "밥 먹었어?"처럼 문장 안의 단어는
  아니다. 메시지는 그대로 대화에 남고 EXP도 받는다. 필요 없을 때(배부름, 💩 없음)는 그냥 메시지다.
- **경험치**: 밥 +2, 💩 하나당 +2, 메시지 +1(room당 하루 50까지, 일본 시간 기준). **최고 레벨은 30**이고 그 뒤로도 EXP는
  쌓이지만 레벨과 바는 30·가득에서 멈춘다. 30이 되는 순간 `MAX_LEVEL` 이벤트(감사 카드) 하나를 남긴다. 레벨당 20
  (`buddychat.buddy.exp-per-level`). **포트폴리오로 보여주는 동안 운영 서버는 3**(Terraform `buddy_exp_per_level`,
  2026-09-29에 테스트용 1에서 올림). 출시 전에 변수를 null로 돌린다.
- **레벨당 EXP를 바꿔도 레벨은 그대로**(`BuddyExpScale`): 레벨은 `exp / 레벨당 EXP + 1`로 매번 계산하므로 값만 바꾸면 이미
  있는 Buddy의 레벨이 내려간다. 그래서 서버가 시작할 때 `settings` 컬렉션(`_id: "buddy"`)에 기록한 값과 지금 값을 비교해,
  다르면 모든 Buddy의 EXP를 `exp × 새 값 ÷ 옛 값`(내림)으로 바꾼다. 레벨과 바 위치가 유지된다. 처음 시작할 때는 값만 기록한다.
  새 값을 조건부 update로 먼저 기록하고 바꾸므로, 두 서버가 같이 떠도 한 번만 바꾸고 중간에 실패해도 두 번 바뀌지 않는다
  (실패하면 레벨이 내려간 채 남는다). 트래픽 전 1회성 작업이라 blocking으로 한다.
- **단계**: 알(Lv1) → 아기(Lv3) → 어린이(Lv10) → 어른(Lv20)(`BuddyRules`의 `BABY_AT`·`CHILD_AT`·`ADULT_AT`, 2026-10-01에
  2·5·10에서 올림: 어른이 너무 빨랐다). 죽지 않는다. 단계에 필요한 누적 EXP:

  | 단계 | 레벨 | 레벨당 1 (테스트) | 레벨당 3 (지금 운영) | 레벨당 20 (기본값) |
  | --- | --- | --- | --- | --- |
  | 아기 | 3 | 2 | 6 | 40 |
  | 어린이 | 10 | 9 | 27 | 180 |
  | 어른 | 20 | 19 | 57 | 380 |
  | 최고 | 30 | 29 | 87 | 580 |

  하루에 얻을 수 있는 EXP는 메시지 50 + 둘이 함께 10 + 밥(30분마다 가능) + 청소(1시간마다 가능) 정도다.
- **둘이 함께**: 같은 날(일본 시간) 두 사람이 모두 메시지를 보내면 하루 한 번 +10(`TOGETHER_EXP`, 메시지 상한과 별개).
  메시지마다 `talked`가 보낸 사람을 그날 목록에 넣는다(같은 날이면 `$addToSet`, 아니면 새 날로 시작하는 조건부 update. 새 날을
  두 메시지가 동시에 시작하면 진 쪽은 같은 날 쪽으로 다시). 그날 처음인 사람이면 둘 다 있고 `togetherDay`가 오늘이 아닐 때만
  보너스를 주는 조건부 update를 한 번 해서, 첫 메시지가 동시에 와도 한 번만 준다. 주면 타임라인 `TOGETHER`(`text` = 받은 EXP,
  키 `together:<날짜>`)와 레벨 업 처리, 아니면 `buddy` 이벤트만 보내서 상대 화면에 "누가 왔는지"가 바로 보인다. 그날 두 번째
  메시지부터는 아무것도 하지 않는다. 독립으로 온 새 알은 그날 기록을 이어받아 보너스가 두 번 들어가지 않는다. 혼자인 방은 받지
  않는다.
- **타임라인 이벤트**: `FED`, `CLEANED`(누가 했는지 포함, 바닥이 깨끗해질 때 한 줄), `TOGETHER`(위), `LEVELED_UP`(`text`에 새 레벨,
  단계가 바뀌면 대신 `EVOLVED` 하나만, 30이면 대신 `MAX_LEVEL`), `EVOLVED`는 일어날 때, `HUNGRY`, `POOPED`는 누군가
  앱을 열거나(`GET /api/rooms/me`) 연결할 때 기록한다. 원인 시각으로 만든 키(`buddy:hungry:<lastFedAt>` 등)가
  메시지 unique 인덱스에 걸려서 여러 번 확인해도 한 번만 남는다. 스케줄러가 없다.
- **동시성**: 밥주기는 `lastFedAt < 지금 - 30분` 조건부 update, 청소는 읽은 `lastCleanedAt`·`poopsCleaned`가 그대로일 때만
  바꾸는 compare-and-set. 둘이 동시에 눌러도
  한 번만 적용되고, 진 쪽은 `changed: false`와 현재 상태를 받는다. 메시지 EXP 상한도 조건부 update 두 단계로 지킨다. 둘이 함께
  보너스는 `togetherDay` 조건으로 하루 한 번(테스트는 여러 날 동안 두 첫 메시지를 동시에 보낸다).
- **독립**(`POST /api/rooms/me/buddy/graduate` `{ buddyName }`): 30레벨(`BuddyView.grown`)일 때만. 지금 버디를 room의 `album`
  (`{ name, bornAt, graduatedAt }`)에 push하고 `buddy`를 새 알로 바꾸는 것을 한 번의 조건부 update로 한다(같은 `bornAt`이고 EXP가
  30레벨 이상일 때만: 새 알은 EXP 0이라 같은 순간에 태어나도 걸리지 않는다). 둘이 동시에 하면 한 명만 되고 다른 쪽은
  `BUDDY_NOT_GROWN`(409). 타임라인 `GRADUATED`(`text` = 떠난 버디 이름), 상대 앱은 이 메시지를 받으면 room을 다시 읽는다(앨범).
  진화·레벨·최고 레벨 이벤트 키에 버디의 `bornAt`을 넣어서 새 알이 다시 진화하면 새로 기록된다.
- API: `POST /api/rooms/me/buddy/feed`, `POST /api/rooms/me/buddy/clean` → `{ buddy, changed }`.
  변화는 room 전체에 `message`(타임라인 이벤트)와 `buddy`(새 상태) WebSocket 이벤트로 전달된다.

## Room·초대 규칙 (S2에서 확정)

- 초대 코드: 8자리(헷갈리는 0/O, 1/I/L 제외), 24시간 유효, 한 번만 사용. 대소문자 구분 없음.
- 초대 링크: 앱이 공유하는 문구에 `<웹 주소>/join?code=<코드>`를 넣는다. 서버는 바뀌지 않는다: 웹이 로그인 전에 코드를 이 탭에
  기억해 뒀다가(sessionStorage), 시작하고 이름을 정하면 코드가 채워진 참가 화면을 연다(`lib/pending-invite`).
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

## 계정 삭제

App Store Guideline 5.1.1(v)(앱에서 만든 계정은 앱에서 지울 수 있어야 한다) 때문에 넣었다. 게스트는 30일 뒤 Firebase가
익명 계정을 지우지만 서버 데이터는 남으므로, 스스로 지울 방법이 있어야 한다.

- 서버(`DELETE /api/me`, `account/AccountService`): room 나가기(위 나가기와 같다: 2명 room이면 상대가 room·Buddy·대화를
  그대로 갖고 `left`를 받는다, 혼자 room이면 기록과 함께 삭제) → 내가 만든 초대 코드 → 내 읽음 위치 → 내 푸시 토큰 →
  사용자 문서 순으로 지운다. 트랜잭션 없이 단계마다 다시 해도 되는 삭제라, 중간에 실패해도 다시 요청하면 끝난다.
- 상대와 주고받은 메시지는 상대의 대화이기도 해서 room에 남는다(메신저의 일반적인 방식). 삭제 확인 문구에서 알린다.
- 앱: Google을 연결한 계정은 먼저 Google로 다시 로그인한다(Firebase는 최근 로그인 뒤에만 계정 삭제를 허용한다. 서버를
  지운 뒤에 물으면 서버 데이터만 사라지고 계정은 남을 수 있다). 그다음 서버 삭제 → Firebase `deleteUser`(로그아웃 된다).
  Admin SDK를 쓰지 않는 원칙(위 Firebase token 검증)대로 Firebase 계정은 앱이 지운다.

## 게스트 정리

Firebase가 30일 지난 익명 계정을 지워도 서버의 사용자·방·메시지는 남는다. 링크를 공개하면 방문자마다 게스트가 생기므로
서버가 **매주 월요일 04:00(일본 시간)** 정리한다(`account/GuestCleanup`, Spring `@Scheduled`). 서버가 항상 1대 떠 있어서
가능하다(인프라: Railway 서비스는 항상 켜져 있다). 배포 중 2대가 겹쳐 두 번 돌아도 삭제는 여러 번 해도 같다.

- **게스트 판단**: 토큰의 `firebase.sign_in_provider`가 `anonymous`이고 `firebase.identities`가 비어 있으면 게스트.
  Google을 연결하면 uid와 로그인 방식은 그대로지만 identity가 생겨서 게스트가 아니다.
- **기록**: 인증된 요청마다(`UserService.current`) `guest`와 `lastSeenAt`을 적는다. 쓰기는 하루 한 번까지, 게스트 여부가
  바뀌면 바로.
- **대상**: 게스트이고, 만든 지 30일이 지났고(Firebase가 지웠을 때), 7일 동안 요청이 없는 사용자. 두 조건을 다 보므로
  Firebase 정리가 늦어도 쓰고 있는 게스트는 지우지 않는다. 지우는 방법은 계정 삭제(`AccountService`)와 같다.
- 이 필드가 생기기 전의 사용자는 정리하지 않는다(테스트 기간의 몇 명뿐).

에러 코드(응답 본문 `{ "code": "..." }`, 문구는 앱이 정한다):

| code | HTTP | 상황 |
| --- | --- | --- |
| `INVALID_REQUEST` | 400 | 요청 값 검증 실패(Buddy 이름 비었거나 12자 초과 등) |
| `ROOM_NOT_FOUND` | 404 | 아직 room이 없음 |
| `BUDDY_NOT_GROWN` | 409 | 30레벨이 아닌데 독립(또는 상대가 방금 독립시켜 새 알) |
| `ROOM_ALREADY_EXISTS` | 409 | 이미 room이 있는데 만들려고 함 |
| `ROOM_FULL` | 409 | 2명이 찬 room에 초대·참가 |
| `INVITATION_NOT_FOUND` | 404 | 없는 코드 |
| `INVITATION_EXPIRED` / `INVITATION_USED` | 410 | 만료 / 이미 사용 |
| `ALREADY_MEMBER` | 409 | 자기 room의 초대를 수락 |
| `ALREADY_IN_ROOM` | 409 | 2명 room의 멤버가 다른 room에 참가 |
| `LEAVE_CONFIRMATION_REQUIRED` | 409 | solo room을 두고 참가하려면 확인 필요 |
