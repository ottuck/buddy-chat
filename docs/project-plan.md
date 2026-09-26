# buddy-chat 프로젝트 정리

> 초기 기획 정리본이다. 뒤 섹션이 앞 섹션과 충돌하면 **§65(MVP 인프라)가 우선**한다. 검토 결과와 결정 사항은 `docs/review-notes.md`에 있다.

## 0. 프로젝트 한 줄 요약

**buddy-chat은 한 명 또는 두 명이 작은 가상 생명체(Buddy)를 함께 키우면서 사용하는 초경량 1:1 실시간 채팅 앱이다.**

핵심은 어디까지나 **채팅**이며, Buddy 육성은 게임처럼 깊게 만드는 것이 아니라 채팅에 재미와 작은 사건을 만들어주는 가벼운 보조 콘텐츠다.

서비스의 기본 컨셉은 다음과 같다.

> 혼자 Buddy를 키우기 시작할 수도 있고, 친구 한 명을 초대해서 둘이 함께 키우며 채팅할 수도 있다.  
> 둘이 대화를 많이 하고 Buddy를 돌볼수록 Buddy가 성장하고 진화한다.

---

# 1. 프로젝트의 배경

기존에 `poke-chat`이라는 개인 프로젝트가 있다.

기존 repository:

`https://github.com/ottuck/poke-chat`

과거에 채팅 기술을 공부하면서 만든 프로젝트이며, 실제 배포까지 진행했지만 현재 기준으로는 프로토타입 수준에 가깝다.

기존 기술 스택은 대략 다음과 같다.

```text
Node.js
Express
Socket.IO
MongoDB
Redis
HTML / CSS / Vanilla JS
Docker
AWS EC2
```

기존 구현은 이름과 외형상 PokeChat이지만 실제 구조는 1:1 채팅이 아니다.

모든 사용자가 다음과 같이 하나의 global room에 참가한다.

```text
User A ─┐
User B ─┼── global room
User C ─┘
```

그리고 메시지를 보내면:

```js
io.emit('chat message', messageData)
```

형태로 모든 접속자에게 broadcast한다.

따라서 기존 서비스는 사실상:

> 포켓몬 랜덤 프로필을 사용하는 익명 글로벌 채팅

에 가까웠다.

이번 리메이크에서는 기존 코드를 조금씩 개선하는 것보다는 **제품과 아키텍처를 사실상 새로 설계하는 프로젝트**로 본다.

기존 프로젝트의 아이디어와 과거 경험은 활용하되, 코드는 대부분 새로 작성해도 된다.

---

# 2. 프로젝트 이름

현재 프로젝트 working title은:

```text
buddy-chat
```

으로 확정한다.

이 이름은 **개발용 임시 프로젝트명**이다.

최종 App Store 출시 시 사용할 서비스 브랜드명은 나중에 별도로 정한다.

현재 단계에서는 브랜드 이름에 시간을 쓰지 않는다.

또한 아래와 같이 기존 IP를 직접 연상시키는 이름은 최종 제품명으로 사용하지 않을 예정이다.

```text
PokeChat
Pokemon 관련 이름
Tamagotchi
たまごっち
Tama-
-gotchi
TGChat
```

특히 Pokémon 및 Tamagotchi IP에 의존하지 않는 **완전한 오리지널 서비스**로 전환한다.

---

# 3. 기존 Pokémon 컨셉은 제거

기존 PokeChat에는 Pokémon 이미지와 Pokémon 테마가 들어가 있었다.

예를 들어 기존 코드는 PokeAPI GitHub sprite에서 1~151번 Pokémon 이미지를 랜덤 프로필로 사용했다.

이번 리메이크에서는 **Pokémon IP를 완전히 제거한다.**

Buddy 역시 Pokémon이 아니다.

```text
Pokemon ❌
Tamagotchi 캐릭터 ❌
기존 게임 IP ❌

Original Buddy ⭕
```

Tamagotchi에서 가져오는 것은 캐릭터나 브랜드가 아니라 다음과 같은 **virtual pet의 게임 디자인 아이디어**뿐이다.

```text
배고픔
밥주기
똥
청소
잠
성장
진화
```

Buddy 디자인과 애니메이션은 전부 자체 제작 또는 생성형 AI 에셋으로 만든다.

---

# 4. 제품의 가장 중요한 원칙

## Chat First

buddy-chat은 육성 게임이 아니다.

가장 중요한 기능은:

```text
1:1 Realtime Chat
```

이다.

Buddy는 채팅을 보조한다.

우선순위는 명확히:

```text
Chat >>> Buddy
```

이다.

다음과 같은 복잡한 게임 요소는 만들지 않는다.

```text
퀘스트 ❌
Daily Mission ❌
게임 재화 ❌
상점 ❌
가챠 ❌
장비 ❌
스킬 ❌
전투 ❌
미니게임 ❌
랭킹 ❌
친구 경쟁 ❌
```

Buddy 때문에 채팅 앱 개발 범위가 게임 프로젝트 수준으로 커지는 것을 막는다.

---

# 5. 제품의 핵심 차별점

일반적인 메신저는:

```text
User A ↔ User B
```

이다.

buddy-chat은:

```text
User A ─────┐
            │
            ▼
          Buddy
            ▲
            │
User B ─────┘

그리고

User A ↔ User B
```

라는 구조다.

두 사람이 단순히 대화하는 것이 아니라 **하나의 작은 생명체를 같이 키운다.**

Buddy 자체가 가끔 대화거리를 만들어주는 것이 핵심이다.

예:

```text
Buddy가 똥을 쌌다.

Henry:
똥!!

Yuki:
ㅋㅋㅋㅋ

Henry:
니가 치워

Yuki:
싫어ㅋㅋ
```

이런 자연스러운 상황이 만들어지는 것이 중요하다.

Daily Question이나 AI가 억지로 대화 소재를 제공하는 것보다 훨씬 자연스럽다.

---

# 6. Solo + Duo 구조

Between처럼 두 사람이 반드시 있어야 서비스를 시작할 수 있게 하지 않는다.

buddy-chat은 **혼자서도 시작할 수 있다.**

Room의 member 수는:

```text
1명 또는 2명
```

이다.

처음 가입했을 때:

```text
새로운 Buddy가 태어났어요.

      🥚

[혼자 시작하기]

[친구 초대하기]
```

같은 흐름을 제공할 수 있다.

혼자 시작하면:

```text
Room
 ├ User A
 └ Buddy
```

상태가 된다.

이후 친구를 초대하면:

```text
Room
 ├ User A
 ├ User B
 └ Buddy
```

로 바뀐다.

기존에 키우던 Buddy 상태는 그대로 유지한다.

즉:

```text
Solo Room
    ↓
친구 초대
    ↓
Duo Room
```

이 자연스럽게 가능해야 한다.

---

# 7. Room이 핵심 Aggregate

과거에는 `Pair`라는 이름도 고려했지만, Solo를 지원하므로 현재는 `Room`이라는 개념이 더 적절하다.

논리적인 핵심 도메인은:

```text
Room
 ├ Members [1..2]
 ├ Buddy
 ├ Messages
 └ Invitation
```

정도로 생각한다.

핵심 invariant:

```text
Room Member Count <= 2
```

3번째 사용자가 동시에 invite URL을 눌러도 Room에 들어올 수 없어야 한다.

이 부분은 서버/DB에서 확실히 보장한다.

---

# 8. 플랫폼 전략

초기에는 Web First도 고려했지만 최종적으로 **Mobile First / iOS First**로 방향을 변경했다.

이유는 제품 특성 때문이다.

buddy-chat은:

```text
업무용 채팅
커뮤니티
Slack
Teams
Discord
```

같은 서비스가 아니다.

카카오톡, LINE처럼 **한 사람과 가볍게 메시지를 주고받는 개인 메신저**에 가깝다.

실제 사용성도 모바일 중심일 가능성이 훨씬 높다.

따라서:

```text
Primary Platform
= iOS

Secondary Platform
= Web

향후
= Android
```

로 생각한다.

---

# 9. MVP의 완성 기준은 iPhone

MVP가 완료되었다고 판단하는 기준은 Web이 아니다.

**iPhone에서 실제 앱으로 사용했을 때 자연스럽고 완성도 있는가**가 기준이다.

개발 중에도 iPhone 실기기로 계속 확인한다.

특히 다음 UX를 중요하게 본다.

```text
Safe Area
Keyboard
Chat composer
Message scrolling
Auto scroll
Unread/new message indicator
Background / Foreground
Push Notification
WebSocket reconnect
Message duplication 방지
Read state
Typing indicator
```

채팅 앱이므로 이런 작은 UX 품질이 중요하다.

---

# 10. Web은 지원하지만 제품 기준은 아니다

Web을 버리는 것은 아니다.

React Native Web을 통해 Web에서도 정상적으로 사용할 수 있게 한다.

다만:

```text
Web = Secondary Client
```

이다.

Web을 위해 별도의 Slack/Teams식 대형 Desktop UI를 만들지 않는다.

Desktop에서는 이런 식으로 간단히 해도 된다.

```text
┌──────────────────────────────────────┐
│                                      │
│       ┌──────────────────────┐       │
│       │                      │       │
│       │        Chat          │       │
│       │                      │       │
│       │                      │       │
│       ├──────────────────────┤       │
│       │ Message...        ➤ │       │
│       └──────────────────────┘       │
│                                      │
└──────────────────────────────────────┘
```

즉 chat container의 최대 폭만 적절히 제한한다.

Web을 위해 서비스 구조를 과도하게 변경하지 않는다.

포트폴리오에서는 Web Demo를 제공할 수 있다는 것 자체가 중요하다.

---

# 11. Frontend 기술 스택

현재 기본안:

```text
React Native
Expo
TypeScript
Expo Router
```

iOS First로 개발한다.

Web은 Expo / React Native Web을 이용한다.

Android도 향후 동일 코드베이스에서 지원 가능하게 만든다.

중요한 원칙:

```text
iOS-first design
≠
iOS-only code
```

플랫폼 분기를 남발하지 않는다.

예:

```text
ChatScreen
MessageList
MessageBubble
MessageComposer
BuddyView
BuddyStatus
```

등 대부분은 shared component로 만든다.

정말 플랫폼 구현이 다른 경우만:

```text
PushNotification.ios.ts
PushNotification.web.ts
```

같은 방식으로 분리한다.

---

# 12. Backend 기술 스택

이번 프로젝트에서 가장 중요한 기술적인 실험은:

```text
Spring WebFlux
```

이다.

기존 업무와 개인 프로젝트에서 주로 사용했던 전통적인 Spring MVC와 달리:

```text
Reactive
Non-blocking
Event-driven
```

백엔드를 경험하는 것이 목적 중 하나다.

현재 기본 backend stack:

```text
Java
Spring Boot
Spring WebFlux
Project Reactor
WebSocket
Spring Data Reactive MongoDB
Reactive Redis
```

이다.

---

# 13. WebFlux를 사용하는 이유

단순히 새로운 기술을 써보고 싶어서 넣는 것이 아니다.

채팅 서버는 다음과 같은 특성이 있다.

```text
사용자 접속
  ↓
WebSocket 연결
  ↓
연결을 장시간 유지
  ↓
대부분 idle
  ↓
이벤트가 발생했을 때 처리
```

따라서 request마다 thread가 장시간 blocking되는 구조보다:

```text
event-driven
non-blocking
reactive
```

방식이 자연스럽다.

포트폴리오에서 WebFlux 선택 이유 역시 명확하게 설명할 수 있다.

---

# 14. End-to-End Reactive를 유지

WebFlux를 사용하는데 내부에서 JDBC/JPA가 blocking되면 학습 목적이 약해진다.

따라서 가능하면:

```text
React Native client
      ↓
WebSocket
      ↓
Spring WebFlux
      ↓
Reactive MongoDB Driver
      ↓
MongoDB
```

형태의 end-to-end reactive 구조를 유지한다.

DB 접근에는:

```text
ReactiveMongoRepository
ReactiveMongoTemplate
```

등을 사용한다.

Redis 역시(도입 시):

```text
ReactiveRedisTemplate
Reactive Pub/Sub
```

를 사용한다.

---

# 15. Database는 MongoDB

이번 프로젝트에서는 PostgreSQL보다 MongoDB를 우선 선택한다.

이유는 Chat Message 도메인이 document 구조와 잘 맞고, WebFlux + Reactive MongoDB 조합도 자연스럽기 때문이다.

예:

```json
{
  "_id": "...",
  "roomId": "...",
  "senderId": "...",
  "type": "TEXT",
  "content": {
    "text": "오늘 뭐해?"
  },
  "createdAt": "...",
  "clientMessageId": "..."
}
```

향후 message type:

```text
TEXT
IMAGE
SYSTEM
BUDDY_EVENT
```

정도까지 확장할 수 있다.

---

# 16. Message는 별도 collection

Room document 안에 모든 메시지를 배열로 저장하지 않는다.

잘못된 구조:

```text
Room
 └ messages[]
```

대신:

```text
rooms
messages
```

collection을 분리한다.

Message에는:

```text
id
roomId
senderId
type
content
createdAt
clientMessageId
```

등을 가진다.

조회는:

```text
roomId + createdAt
```

등에 index를 두고 cursor pagination을 고려한다.

---

# 17. Redis 역할

> **MVP에서는 Redis를 쓰지 않는다(§65.7).** 아래는 horizontal scaling이 필요해졌을 때의 역할이다.

기존 PokeChat에서도 Redis를 사용했지만 단순 cache 수준이었다.

이번에는 Redis의 역할을 명확하게 한다.

MongoDB:

```text
Persistent State
```

예:

```text
User
Room
Message
Buddy
Invitation
```

Redis:

```text
Ephemeral Realtime State
```

예:

```text
Presence
Typing
WebSocket session mapping
Pub/Sub
Short-lived realtime state
```

서버가 여러 대가 될 경우:

```text
                 Load Balancer

              /                 \

      WebFlux Server A      WebFlux Server B
             \                /
              \              /
                  Redis
                 Pub/Sub
```

형태로 realtime event 전달을 확장할 수 있다.

MVP에서 실제 multi-instance deployment까지 할 필요는 없지만 확장 가능한 구조를 의식한다.

---

# 18. Firebase는 Backend 대체가 아니라 보조 서비스

Firebase/Firestore를 전체 backend로 사용하는 것도 검토했지만 선택하지 않았다.

Firestore를 사용하면 RN Client에서 직접 realtime 기능을 사용하기 쉬우나, 그러면 Spring WebFlux를 사용할 이유가 크게 줄어든다.

이번 프로젝트에서는 backend 자체를 구현하는 것이 중요한 학습 목표다.

Firebase는 다음 정도로 제한한다.

```text
Firebase Authentication
Firebase Cloud Messaging
```

즉:

```text
Firebase Auth
→ 사용자 인증

FCM
→ Push Notification
```

역할만 맡긴다.

Firestore는 사용하지 않는 방향이 기본안이다.

---

# 19. 인증 흐름

기본 아이디어:

```text
React Native
    ↓
Firebase Authentication
    ↓
Firebase ID Token
    ↓
Spring WebFlux Backend
    ↓
Token 검증
    ↓
Application User
```

로그인 방식은 MVP 단계에서 간단하게 시작한다.

예:

```text
Apple
Google
```

또는 더 적은 방식으로 시작할 수도 있다.

App Store 규정상 Google 같은 소셜 로그인을 넣으면 **Sign in with Apple도 함께 제공해야 한다.** 따라서 Apple login은 MVP 필수다.

인증은 Firebase JS SDK로 구현해 iOS와 Web을 같은 코드로 처리한다(`@react-native-firebase`는 Web을 지원하지 않는다).

---

# 20. Realtime Chat 기본 흐름

메시지 전송:

```text
User A
  ↓
WebSocket
  ↓
Spring WebFlux
  ↓
Authentication
  ↓
Room Membership 확인
  ↓
MongoDB 저장
  ↓
Realtime Publish
  ↓
User B WebSocket
```

상대 사용자가 offline이면:

```text
Presence 확인
   ↓
Offline
   ↓
FCM
   ↓
Push Notification
```

가 된다.

---

# 21. 메시지 중복 방지

모바일 네트워크에서는 reconnect/retry가 일어날 수 있으므로:

```text
clientMessageId
```

를 두는 것을 고려한다.

예:

```json
{
  "clientMessageId": "uuid",
  "roomId": "...",
  "message": "hello"
}
```

동일 clientMessageId가 다시 오면 중복 저장하지 않도록 한다.

MVP에서도 가능하면 구현한다.

이 기능은 모바일 채팅의 안정성을 보여주는 좋은 포트폴리오 요소다.

---

# 22. Chat MVP 기능

채팅은 프로젝트의 본체다.

MVP에 최소한 다음 정도는 포함하고 싶다.

```text
Realtime 1:1 Message
Text Message
Push Notification
Read State
Typing Indicator
Reconnect
Message History
Pagination
```

처음부터:

```text
Voice call
Video call
Group chat
File transfer
Thread
Reaction
Sticker store
```

등까지 만들지는 않는다.

Reaction이나 sticker 정도는 나중에 추가 가능하다.

---

# 23. Buddy 컨셉

Buddy는 하나의 작은 virtual pet이다.

중요한 것은:

```text
Simple
Light
Cute
```

이다.

게임으로 만들지 않는다.

MVP의 Buddy 상태는 최대한 작게 유지한다.

예:

```text
Hunger
Cleanliness
Growth / EXP
```

정도.

---

# 24. Buddy 상태

## Hunger

시간이 지나면서 감소한다.

```text
배고픔
↓
밥주기
↓
회복
```

Buddy가 배고픈 상태라면 UI에서 표현한다.

---

## Cleanliness

가끔 Buddy가 똥을 싼다.

```text
Buddy
   💩
```

사용자는:

```text
청소하기
```

를 누를 수 있다.

이런 작은 사건이 둘 사이의 대화 소재가 되는 것이 중요하다.

---

## Growth / EXP

사용자가 Chat을 많이 사용하고 Buddy를 돌볼수록 성장한다.

복잡한 progression system은 만들지 않는다.

가장 단순하게:

```text
메시지 전송
→ EXP 증가
```

구조로 시작할 수 있다.

---

# 25. 채팅 수 = EXP

Buddy 성장의 기본 규칙은 단순하게 한다.

예:

```text
Message
→ +1 EXP

Feed
→ +2 EXP

Clean
→ +2 EXP
```

정확한 수치는 구현 과정에서 조정 가능하다.

사용자에게 반드시 숫자 공식을 공개할 필요도 없다.

UI에서는:

> 대화하고 돌봐줄수록 Buddy가 성장해요.

정도로 설명하면 된다.

---

# 26. Message EXP Spam 방지

사용자가:

```text
ㅎ
ㅎ
ㅎ
ㅎ
ㅎ
```

를 수백 번 보내 경험치를 올리는 것을 막을 수 있다.

복잡한 anti-cheat 시스템은 필요 없다.

예:

```text
Message EXP Daily Cap
```

하나만 있어도 충분하다.

예시:

```text
메시지 EXP 최대 50/day
```

또는 일정 시간 내 메시지의 EXP를 제한할 수도 있다.

이 부분은 간단한 방식으로 구현한다.

---

# 27. Buddy는 죽지 않는다

옛날 virtual pet처럼 방치하면 죽어버리는 시스템은 사용하지 않는다.

사용자가 앱에 의무적으로 접속해야 하는 스트레스를 만들고 싶지 않다.

방치하면:

```text
배고픔
더러움
삐짐
잠
```

정도만 발생한다.

다시 돌봐주면 쉽게 정상 상태로 돌아온다.

즉:

> 책임감은 조금 있지만 스트레스는 없는 virtual pet

을 목표로 한다.

---

# 28. Buddy Evolution

MVP에서는 Buddy 종류를 많이 만들지 않는다.

**Buddy 한 종류**만 먼저 만든다.

진화 단계도 단순하게:

```text
Egg
 ↓
Baby
 ↓
Child
 ↓
Adult
```

약 4단계 정도면 충분하다.

진화 조건 역시 복잡하지 않다.

```text
EXP / Level
```

기준으로 진행한다.

분기 진화는 MVP에서 하지 않는다.

---

# 29. Buddy Animation

Buddy에서 중요한 것은 정적인 이미지보다 캐릭터의 움직임이다.

예상 animation:

```text
Idle
Happy
Hungry
Sleep
Eating
Poop
Clean reaction
Level up
Evolution
```

하지만 MVP에서 처음부터 모든 모션을 만들 필요는 없다.

우선:

```text
Idle
Happy
Hungry
Sleep
```

정도로 시작해도 된다.

이후:

```text
Eating
Poop
Evolution
```

등을 추가한다.

---

# 30. Higgsfield + AI Asset Generation

Buddy asset 제작에는 Higgsfield 같은 AI 생성형 asset/video tool을 적극 활용해볼 예정이다.

과거 별도의 게임 프로젝트를 만들고 싶었던 이유 중 하나도:

```text
Higgsfield asset
+
AI-assisted development
```

을 경험해보고 싶었기 때문이다.

하지만 RPG를 만들면 asset 범위가 너무 커진다.

```text
몬스터
NPC
맵
배경
스킬
아이템
이펙트
...
```

buddy-chat에서는 asset scope가 훨씬 작다.

예:

```text
1 Buddy

4 Evolution Stages

Stage별:
Idle
Happy
Hungry
Sleep
...
```

정도로 관리 가능하다.

따라서 이 프로젝트에서:

> AI asset generation을 실제 앱 production asset으로 사용하는 workflow

를 경험할 수 있다.

---

# 31. Asset에서 가장 중요한 것은 Character Consistency

AI로 Buddy asset을 만들 때 가장 중요한 것은:

```text
같은 Buddy가
여러 진화 단계와 여러 animation에서도
동일한 캐릭터처럼 보여야 한다.
```

는 것이다.

Higgsfield 또는 다른 생성 도구를 사용할 때:

```text
Reference image
Character consistency
Evolution design
Motion consistency
Transparent background
Loop animation
```

등을 중요하게 본다.

필요하다면 처음에는 AI generated asset을 prototype으로 사용하고 최종적으로 수정할 수도 있다.

---

# 32. Buddy와 Chat은 분리된 게임 화면이 아니다

Buddy를 별도의 대형 게임 화면으로 만들지 않는다.

Buddy는 채팅 앱 안에 자연스럽게 존재한다.

예:

```text
┌─────────────────────────┐
│ Yuki              ●    │
│                         │
│   🐾 Mugi Lv.12 ███░   │
├─────────────────────────┤
│                         │
│ 안녕                    │
│                         │
│                퇴근했어 │
│                         │
│ 오늘 늦네               │
│                         │
├─────────────────────────┤
│ Message...           ➤ │
└─────────────────────────┘
```

Buddy를 누르면 detail screen/modal을 열 수 있다.

```text
Buddy Name
Level
EXP
Hunger
Cleanliness
Evolution
```

정도만 보여준다.

---

# 33. Buddy Event를 Chat Timeline에 넣기

Buddy 이벤트를 Chat과 완전히 분리하지 않는다.

예:

```text
17:23

Mugi가 배고파졌어요 🍚
```

```text
17:40

Yuki가 Mugi에게 밥을 줬어요.
```

```text
18:02

Mugi가 💩을 쌌어요.
```

같은 이벤트를 chat timeline에 system message 형태로 표시할 수 있다.

그 사이에서 실제 대화가 발생한다.

```text
Henry:
ㅋㅋ 또 쌌네

Yuki:
니가 치워
```

이것이 buddy-chat의 핵심 재미 중 하나다.

---

# 34. Buddy Realtime Event

Backend에는 Chat event 외에도:

```text
BuddyFed
BuddyCleaned
BuddyPooped
BuddyStateChanged
BuddyLeveledUp
BuddyEvolved
```

등이 존재할 수 있다.

예:

```text
Yuki
 ↓
Feed Button
 ↓
Spring WebFlux
 ↓
Buddy State Update
 ↓
MongoDB
 ↓
Realtime Event
 ↓
Henry
```

Henry의 화면에서도 바로:

```text
Yuki가 Buddy에게 밥을 줬어요.
```

가 나타난다.

---

# 35. 동시성도 간단한 기술 포인트가 된다

두 사람이 동시에:

```text
Feed
```

를 누르거나:

```text
Clean
```

을 누르는 상황도 존재할 수 있다.

예:

```text
User A ─ Feed ┐
              ├─ 거의 동시에 발생
User B ─ Feed ┘
```

중복 처리를 어떻게 할지 고민해야 한다.

다만 이것 때문에 거대한 게임 서버 architecture를 만들지는 않는다.

MongoDB atomic update / optimistic concurrency / idempotency 정도의 작은 문제로 해결한다.

이런 부분은 backend portfolio에서도 좋은 설명거리가 된다.

---

# 36. Buddy Time-based State

Buddy는 시간이 지나면서 상태가 변할 수 있다.

예:

```text
Hunger 감소
Poop 발생
Sleep
```

하지만 MVP에서는 복잡한 실시간 scheduler 시스템으로 만들 필요는 없다.

예를 들어 서버에서:

```text
lastFedAt
lastCleanedAt
lastStateUpdatedAt
```

등을 저장하고 요청 시점에 상태를 계산하는 lazy evaluation도 가능하다.

즉:

```text
1분마다 Buddy 전체를 scheduler로 update
```

같은 과도한 구현은 피한다.

필요해지면 나중에 scheduler/event system을 추가한다.

---

# 37. AI Chat은 제외

한때 AI Chat 기능도 고려했지만 현재는 제외한다.

다음 기능들은 MVP에 없다.

```text
AI Buddy Chat
Daily AI Question
AI Conversation Summary
AI Memory
AI Relationship Analysis
```

AI가 서비스의 핵심을 흐리거나 프로젝트 범위를 키울 가능성이 크기 때문이다.

현재 AI 활용은:

```text
Coding
Asset Generation
```

정도로 제한한다.

---

# 38. 별도의 Memory / Calendar 기능도 우선 제외

처음에는 Between처럼:

```text
Shared Album
Calendar
Anniversary
Memory
```

등도 고려했지만 현재 핵심 범위를 줄이기로 했다.

MVP는:

```text
Chat
+
Buddy
```

에 집중한다.

Photo Message 는 MvP 단계에서 제외한다.

나중에 필요하다면:

```text
Shared Album
Memory
Calendar
Anniversary
```

등을 추가할 수 있지만 MVP에 포함하지 않는다.

---

# 39. Navigation 역시 최소화

복잡한 bottom navigation이 필요하지 않을 수 있다.

초기 아이디어는:

```text
Home
Chat
Memory
Us
```

였지만 현재는 지나치게 크다.

더 단순하게:

```text
Chat
Buddy
Settings
```

또는:

```text
Chat 중심
Buddy는 Chat Header에서 접근
Settings는 우측 상단
```

정도도 가능하다.

MVP에서는 **Chat Screen이 앱의 중심 화면**이다.

---

# 40. 예상 첫 사용자 Flow

## 최초 실행

```text
Launch
 ↓
Login
 ↓
Create Room
 ↓
Buddy Egg 생성
 ↓
Solo Room
```

화면:

```text
      🥚

새로운 Buddy가 태어났어요.

[이름 정하기]
```

---

## Solo

```text
User
 ↓
Buddy care

Feed
Clean
Observe
```

언제든:

```text
Invite Friend
```

가능.

---

## Friend Invite

```text
Invite Link
 ↓
Friend Login
 ↓
Join Room
 ↓
Room Member = 2
```

이후:

```text
Realtime 1:1 Chat
+
Shared Buddy
```

사용.

---

# 41. MVP Scope

첫 App Store 출시를 목표로 하는 MVP는 다음 정도로 제한한다.

## Authentication

```text
Login
Logout
User profile
```

---

## Room

```text
Create Room
Solo Room
Invite Friend
Join Room
Max 2 Members
Leave / Disconnect
```

---

## Chat

```text
Realtime Text Message
Message History
Read State
Typing Indicator
Push Notification
Reconnect
Pagination
```

---

## Buddy

```text
Buddy 생성
Buddy 이름
Hunger
Cleanliness
Feed
Clean
EXP
Level
Evolution
간단한 Animation
```

---

## Settings

```text
Profile
Notification
Room information
Logout
```

이 정도면 MVP다.

---

# 42. 명확한 Non-MVP

다음은 처음부터 만들지 않는다.

```text
Group Chat
AI Chat
AI Memory
Voice Call
Video Call
Game Currency
Item Shop
Gacha
Battle
Mini Game
Quest
Daily Mission
Ranking
Complex Friendship System
Multiple Rooms
Multiple Partners
Large Social Graph
Public Profile
Public Feed
Community
Calendar
Shared Album
Anniversary System
Complex Buddy Breeding
Branch Evolution
Many Buddy Species
```

필요하면 나중에 추가한다.

---

# 43. Buddy 종류도 MVP에서는 하나

초기에는 사용자가 여러 Buddy를 고르지 않는다.

```text
Buddy Type = 1
```

로 시작한다.

한 종류만 제대로 만든다.

이유:

```text
asset 제작 비용
animation
state
evolution
testing
```

범위를 줄이기 위해서다.

MVP 이후 새로운 Buddy species를 추가할 수 있다.

---

# 44. 장기적으로 가능한 확장

서비스가 마음에 들고 계속 개발하고 싶다면 아래 기능을 고려할 수 있다.

```text
Buddy 종류 추가

진화 분기

Room theme

Sticker

Reaction

Shared Album

Anniversary

Memory

Buddy decoration

Additional animations

Android release
```

하지만 현재 architecture를 이런 미래 기능 때문에 지나치게 추상화하지 않는다.

YAGNI를 지킨다.

---

# 45. Design 방향

디자인은:

```text
Cute
Simple
Light
Friendly
```

하게 간다.

게임 UI처럼 정보가 많은 화면을 만들지 않는다.

모바일 1:1 messenger의 익숙한 interaction을 그대로 살린다.

예:

```text
Top
────────────

상대 프로필
Buddy

────────────

Messages

────────────

Composer
```

Buddy 때문에 Chat 영역이 좁아지거나 불편해지면 안 된다.

---

# 46. Buddy는 작은 감정 표현 장치

Buddy는 사용자가 계속 관리해야 하는 작업 목록이 아니다.

앱을 켰을 때:

```text
오늘 기분 좋아 보임
배고픔
잠듦
똥쌈
진화함
```

같은 작은 사건이 보이면 충분하다.

즉:

> Buddy가 앱 사용을 요구하는 것이 아니라, 사용자가 앱을 열었을 때 작은 재미를 제공한다.

는 방향이다.

---

# 47. Push Notification도 Buddy가 남발하면 안 됨

Buddy 상태 때문에 notification을 계속 보내면 피곤한 앱이 된다.

예:

```text
배고파요!
밥 주세요!
똥 쌌어요!
청소해 주세요!
```

를 계속 보내지 않는다.

Push의 기본 목적은:

```text
상대방 Message
```

이다.

Buddy notification은 정말 필요한 경우 나중에 opt-in으로 고려한다.

---

# 48. 프로젝트의 포트폴리오 역할

buddy-chat은 단순 CRUD 앱이 아니다.

주요 기술 포인트는:

```text
Realtime
WebSocket
Reactive Programming
Spring WebFlux
MongoDB
Redis Pub/Sub
Presence
Push Notification
Mobile lifecycle
Cross-platform
Concurrency
Idempotency
```

이다.

즉 backend engineer portfolio에서 다음을 보여줄 수 있다.

> 기존 Spring MVC 기반 API 개발 경험에서 확장해, 장시간 연결을 유지하는 realtime application을 Reactive Stack으로 설계했다.

---

# 49. 다른 개인 프로젝트와의 차별화

다른 프로젝트에서 이미:

```text
Spring MVC
REST
PostgreSQL
Azure
Terraform
Supabase
React Native
```

등을 경험하고 있다.

buddy-chat에서는 다른 영역을 경험한다.

```text
Spring WebFlux
Reactive
WebSocket
MongoDB
Redis
Realtime
Push
Mobile Chat UX
```

즉 프로젝트마다 기술적인 목적이 겹치지 않도록 한다.

---

# 50. 기존 poke-chat에서 가져올 것

기존 프로젝트에서 그대로 재사용할 코드가 많지는 않다.

하지만 다음 경험은 이어간다.

```text
Socket realtime experience
Redis experience
MongoDB experience
Docker
EC2 deployment
Chat UI
```

그리고 README에서 Before / After를 보여주는 것도 가능하다.

예:

```text
2024/2025

Express
Socket.IO
Global anonymous chat

       ↓

2026

React Native
Spring WebFlux
Reactive MongoDB
Redis
Private Room
Realtime 1:1
Shared Buddy
iOS release
```

개발자로서 성장한 과정을 보여주기 좋다.

---

# 52. Repository 방향

## 신규 repository

```text
buddy-chat
```

새 repo를 만들고 기존 poke-chat은 legacy archive로 남긴다. (**확정**)

장점:

```text
clean architecture
clean git history
secret history 문제 분리
```

구조는 하나의 repo에 `app/`(Expo)과 `server/`(Spring)를 두는 모노레포다.

---

# 53. 개발 Architecture 개념

> 초기 개념도다. MVP 구조는 §65.12를 따른다(Redis 없음).

대략:

```text
┌─────────────────────────────────┐
│        React Native / Expo      │
│                                 │
│      iOS        Web    Android  │
└────────────────┬────────────────┘
                 │
                 │
         Firebase Authentication
                 │
             ID Token
                 │
                 ▼
┌─────────────────────────────────┐
│        Spring Boot WebFlux      │
│                                 │
│       REST        WebSocket     │
│                                 │
│        Project Reactor          │
└──────────┬──────────────┬───────┘
           │              │
           ▼              ▼
        MongoDB          Redis
       Persistent       Realtime
           │              │
           │              ├ Presence
           │              ├ Typing
           │              └ Pub/Sub
           │
           └ Messages / Room / Buddy
```

Push:

```text
Spring Backend
     ↓
Firebase Cloud Messaging
     ↓
iPhone
```

---

# 54. Logical Domain Model 초안

아직 물리 schema를 확정하는 단계는 아니다.

논리적으로:

```text
User

Room
 ├ Member
 ├ Buddy
 └ Invitation

Message

DeviceToken
```

정도면 충분하다.

예:

```text
User
- id
- authProviderId
- displayName
- avatar
```

```text
Room
- id
- members
- createdAt
```

```text
Buddy
- id
- roomId
- name
- stage
- exp
- hunger
- cleanliness
- lastFedAt
- lastCleanedAt
- state
```

```text
Message
- id
- roomId
- senderId
- type
- content
- clientMessageId
- createdAt
```

```text
Invitation
- id
- roomId
- code
- expiresAt
- usedAt
```

정도가 초기 모델 후보다.

---

# 55. Backend Domain Event 후보

필요하다면 내부 event를:

```text
MessageSent

MemberJoined

BuddyFed
BuddyCleaned
BuddyPooped
BuddyLeveledUp
BuddyEvolved
```

정도로 표현할 수 있다.

하지만 처음부터 복잡한 Event Sourcing 구조로 만들지는 않는다.

일반적인 application/domain event 정도면 충분하다.

---

# 56. Architecture 과설계 금지

이 프로젝트에서는 다음을 하지 않는다.

```text
Microservices
Kafka
Event Sourcing
CQRS
Kubernetes
Complex distributed system
```

MVP 규모에서 필요하지 않다.

구조는 기본적으로:

```text
Modular Monolith
```

이면 충분하다.

예:

```text
auth
user
room
chat
buddy
notification
```

모듈 수준으로 나눈다.

---

# 57. 테스트에서 중요하게 볼 부분

단순 CRUD test보다 다음을 중요하게 본다.

```text
Room member max 2

Authorization
남의 Room message 접근 불가

Message idempotency

Buddy concurrent feed

Buddy concurrent clean

WebSocket reconnect

Message order

Unread/read state

Invitation race condition
```

특히:

```text
동시에 두 사람이 마지막 invite slot을 차지하려는 경우
```

같은 concurrency test는 좋은 포트폴리오 요소다.

---

# 58. MVP 성공 기준

기능 개수가 많다고 성공이 아니다.

MVP는 실제 iPhone에서 두 명이 며칠간 써도 크게 불편하지 않은 상태를 목표로 한다.

중요한 것은:

```text
채팅이 빠르다
끊겨도 복구된다
알림이 온다
메시지가 중복되지 않는다
UI가 자연스럽다
Buddy가 귀엽다
Buddy 때문에 가끔 웃긴 상황이 생긴다
```

이다.

---

# 59. 최종 제품 경험

buddy-chat의 이상적인 사용 경험은 매우 단순하다.

아침:

```text
Buddy가 자고 있음 💤
```

점심:

```text
친구가 메시지를 보냄

"점심 뭐 먹어?"
```

오후:

```text
Buddy가 배고파짐
```

한 명이:

```text
밥주기
```

저녁:

```text
Buddy가 💩
```

둘이:

```text
ㅋㅋㅋㅋ
누가 치울래
```

밤:

```text
둘이 채팅을 많이 함
↓
Buddy Level Up
```

이 정도의 가벼운 경험이면 충분하다.

---

# 60. 제품을 한 문장으로 정의

현재 buddy-chat의 핵심 정의:

> **buddy-chat은 혼자 또는 친구 한 명과 작은 Buddy를 키우면서 사용하는 초경량 실시간 채팅 앱이다.**

조금 더 제품스럽게 표현하면:

> **Chat with someone you like, and raise a tiny buddy together.**

또는 내부 제품 철학으로는:

> **Chat first. Buddy makes it fun.**

정도가 적절하다.

---

# 61. 현재 확정된 것

```text
Working title
buddy-chat

Product
1~2인 Room 기반 light messenger

Core
Realtime Chat

Secondary Content
Virtual Buddy

Buddy
Feed / Clean / EXP / Evolution

AI Chat
사용하지 않음

Pokemon IP
사용하지 않음

Tamagotchi IP
사용하지 않음

Buddy Asset
Original asset
Higgsfield 등 AI generation 적극 검토

Frontend
React Native + Expo + TypeScript

Primary Platform
iOS

Secondary
Web

Backend
Spring Boot + Spring WebFlux

Realtime
WebSocket

Database
MongoDB

Realtime infrastructure
Redis

Authentication
Firebase Auth 기본안

Push
FCM

Architecture
Modular Monolith

MVP 기준
iPhone에서의 완성도
```

---

# 62. 아직 미정인 것

다음은 개발하면서 결정한다.

```text
최종 제품명

최종 Buddy 디자인

Buddy 이름

Firebase Auth provider 종류

MongoDB hosting

Redis hosting

Cloud provider

CI/CD

Backend hosting

정확한 EXP formula

Buddy state 감소 속도

Poop 발생 규칙

진화 level

Web 디자인 세부사항

Android 출시 시점

유료화 여부
```

이 부분을 지금 억지로 결정하지 않는다.

---

# 63. Claude가 이 프로젝트에서 따라야 할 핵심 원칙

이 프로젝트를 구현할 때 다음 원칙을 우선한다.

1. **Chat이 항상 핵심이다.**
2. Buddy 기능 때문에 채팅 UX를 희생하지 않는다.
3. Buddy는 light virtual pet이지 RPG가 아니다.
4. MVP에 필요하지 않은 게임 기능을 추가하지 않는다.
5. AI Chat 기능을 임의로 추가하지 않는다.
6. Pokémon/Tamagotchi IP를 직접 사용하지 않는다.
7. iOS UX를 최우선한다.
8. Web은 깨지지 않고 정상 동작하도록 유지한다.
9. WebFlux를 사용한다면 reactive chain 중간에 blocking I/O를 넣지 않는다.
10. MongoDB와 Redis의 역할을 명확히 분리한다.
11. Realtime 메시지의 안정성, reconnect, idempotency를 중요하게 다룬다.
12. Room member는 최대 2명이다.
13. Solo Room → Duo Room 전환을 자연스럽게 지원한다.
14. 과도한 architecture를 만들지 않는다.
15. 기술적으로 멋져 보이는 것보다 실제 출시 가능한 작은 제품을 우선한다.

---

# 64. Claude에게 당장 기대하는 다음 작업

> 진행 순서를 바꿔 Expo 앱 세팅부터 시작했다. poke-chat 분석과 서버 설계는 서버 작업을 시작할 때 한다.

이 문서를 전달받은 후 바로 코딩부터 시작하기보다는 우선 기존 repository:

```text
https://github.com/ottuck/poke-chat
```

를 분석한다.

확인할 항목:

```text
현재 repository structure

기존 server architecture

Socket.IO 구현

Redis 사용 방식

MongoDB schema

Frontend 구조

Docker

Deployment
```

그 다음 새 buddy-chat에 대해:

```text
Target architecture

Package structure

Domain model

MongoDB collections

REST API

WebSocket protocol

Realtime event model

Authentication flow

Buddy state model

MVP milestone
```

을 먼저 설계한다.

**설계가 확정되기 전에는 기존 코드를 억지로 유지하려 하지 않는다.**

이번 프로젝트의 목적은 legacy PokeChat을 patch하는 것이 아니라:

> **과거의 간단한 채팅 prototype을 현재 실력으로 실제 출시 가능한 realtime mobile product로 다시 설계하는 것**

이다.


# 65. MVP 인프라 구조 확정

buddy-chat의 MVP 인프라는 다음 구조로 확정한다.

```text
                 iPhone
                    │
                HTTPS / WSS
                    │
                    ▼
          Azure Container Apps
           Spring Boot + WebFlux
                    │
                    ▼
          Azure DocumentDB
                    │
      ┌─────────────┼─────────────┐
      │             │             │
    User           Room         Message
                                  │
                                Buddy
```

추가 외부 서비스:

```text
Firebase Authentication
Firebase Cloud Messaging
```

MVP 단계에서는 **Redis를 사용하지 않는다.**

또한 MVP 채팅에는 **사진 첨부 기능을 넣지 않으므로 Azure Blob Storage도 사용하지 않는다.**

---

## 65.1 Backend Hosting

Spring Boot + Spring WebFlux backend는 다음에 배포한다.

```text
Azure Container Apps
```

배포 형태:

```text
Docker
  ↓
Azure Container Registry
  ↓
Azure Container Apps
  ↓
Spring Boot + Spring WebFlux
```

VM 한 대에 애플리케이션과 Database를 함께 운영하는 방식은 사용하지 않는다.

사용하지 않는 구조:

```text
Azure VM

Docker Compose
 ├ Spring WebFlux
 ├ MongoDB
 └ Redis
```

이유:

- 작은 VM에서 JVM + MongoDB + Redis를 함께 운영할 필요가 없다.
- MongoDB의 OS, patch, disk, backup 등을 직접 관리하는 것이 프로젝트 목표가 아니다.
- buddy-chat의 핵심 기술 목표는 Realtime / WebSocket / Spring WebFlux / Reactive architecture다.
- Container 기반 배포가 애플리케이션 업데이트와 운영에 더 적합하다.
- 향후 필요할 경우 Container Apps의 replica 확장이 가능하다.

---

## 65.2 Azure Container Apps 운영 방향

buddy-chat은 일반적인 REST API뿐 아니라 장시간 유지되는 WebSocket connection을 사용한다.

기본 통신 구조:

```text
React Native / iPhone
        │
        │ HTTPS / WSS
        ▼
Azure Container Apps
        │
        ▼
Spring WebFlux
```

MVP 단계에서는 backend를 여러 대 운영하지 않는다.

기본:

```text
maxReplicas = 1
```

초기 비용을 줄이기 위해:

```text
minReplicas = 0
```

을 우선 고려한다.

이 경우 사용자가 없을 때 scale-to-zero가 가능하지만 첫 접속 시 cold start가 발생할 수 있다.

실제 iPhone 테스트 또는 출시 후 cold start가 채팅 UX에 영향을 준다고 판단되면:

```text
minReplicas = 1
```

로 변경한다.

즉:

```text
초기
min = 0
max = 1

↓ 필요 시

min = 1
max = 1
```

정도로 운영한다.

---

## 65.3 Database는 Azure DocumentDB

MVP Database는 다음으로 확정한다.

```text
Azure DocumentDB
```

Azure DocumentDB는 MongoDB-compatible document database이므로 Spring의 reactive MongoDB stack을 사용한다.

```text
Spring WebFlux
      │
      ▼
Spring Data Reactive MongoDB
      │
      ▼
MongoDB Reactive Driver
      │
      ▼
Azure DocumentDB
```

단, Azure DocumentDB는 MongoDB 자체가 아니라:

```text
MongoDB-compatible database
```

라는 점을 명확히 인지한다.

README나 기술 문서에서는 필요할 경우 다음처럼 정확히 표기한다.

```text
Azure DocumentDB (MongoDB-compatible)
```

---

## 65.4 Azure DocumentDB를 선택한 이유

buddy-chat의 주요 persistent data는 document model과 잘 맞는다.

예상 데이터:

```text
User
Room
Message
Buddy
Invitation
```

특히 Chat Message는 document 형태로 자연스럽게 표현할 수 있다.

예:

```json
{
  "_id": "...",
  "roomId": "...",
  "senderId": "...",
  "type": "TEXT",
  "content": {
    "text": "오늘 뭐해?"
  },
  "clientMessageId": "...",
  "createdAt": "..."
}
```

선택 이유:

```text
Azure 중심의 infrastructure 구성

Document DB 경험

MongoDB-compatible API

Reactive MongoDB Driver 사용 가능

Spring WebFlux와 reactive stack 유지 가능

Azure 무료 혜택 활용

MVP 규모에서 충분한 storage
```

---

## 65.5 MongoDB 호환성을 의식한다

Azure DocumentDB를 MongoDB와 완전히 동일한 제품으로 가정하지 않는다.

개발 시:

```text
Spring Data Reactive MongoDB
MongoDB Reactive Driver
```

를 사용하되, 복잡한 MongoDB-specific 기능을 적극적으로 사용하지 않는다.

MVP의 주요 DB 사용 패턴:

```text
Document CRUD

Indexed Query

Cursor Pagination

Atomic Update

Simple Conditional Update
```

정도로 제한한다.

필요한 query/operator/index 기능이 Azure DocumentDB에서 지원되는지는 구현 시 확인한다.

---

## 65.6 MVP에서는 Azure Blob Storage를 사용하지 않는다

초기 설계에서는 채팅 사진 첨부 기능을 위해 Azure Blob Storage를 고려했지만, MVP 범위에서 사진 첨부 기능을 제외하기로 결정했다.

따라서 MVP에서는:

```text
Azure Blob Storage
```

를 사용하지 않는다.

MVP Chat Message Type은 우선:

```text
TEXT
SYSTEM
BUDDY_EVENT
```

정도로 제한한다.

향후 Photo Message 기능을 추가할 때 Azure Blob Storage 도입을 다시 검토한다.

그 경우에도 binary image 자체를 DocumentDB에 저장하지 않고 Blob Storage와 DocumentDB metadata를 분리한다.

하지만 이는 **MVP 이후 범위**다.

---

## 65.7 MVP에서는 Redis를 사용하지 않는다

기존 architecture 후보에서는 Redis를 다음 용도로 고려했다.

```text
Presence
Typing
WebSocket session mapping
Pub/Sub
Multi-instance realtime event propagation
```

하지만 MVP에서는 Redis를 사용하지 않는다.

핵심 이유:

```text
Backend Replica = 1
```

이기 때문이다.

단일 Spring process가 WebSocket connection을 모두 처리하므로 MVP에서는 다음과 같은 ephemeral state를 application memory에서 관리할 수 있다.

```text
Active WebSocket Sessions
Presence
Typing State
Room Realtime Subscribers
```

서버가 재시작하면 사라져도 되는 데이터만 memory에서 관리한다.

---

## 65.8 Redis를 제외하는 이유

Redis를 처음부터 추가하면 다음 관리 대상이 생긴다.

```text
Redis instance
Connection configuration
Network configuration
Health check
Pub/Sub implementation
Additional infrastructure cost
```

하지만 MVP 규모에서는 Redis가 실제 문제를 해결하지 않는다.

따라서:

> 필요해지기 전까지 Redis를 추가하지 않는다.

라는 YAGNI 원칙을 적용한다.

---

## 65.9 Presence / Typing 처리

MVP에서는 Presence와 Typing을 Spring application memory에서 처리한다.

예:

```text
User A WebSocket connected
          ↓
In-memory session registry
          ↓
Presence = ONLINE
```

Typing:

```text
User A typing
     ↓
WebSocket Event
     ↓
Spring WebFlux
     ↓
User B WebSocket
```

다음 데이터는 DocumentDB에 영속화하지 않는다.

```text
Online / Offline
Typing / Not Typing
Current WebSocket Session
```

---

## 65.10 Redis를 도입하는 시점

향후 backend horizontal scaling이 필요해지면 Redis를 다시 검토한다.

예:

```text
                 Load Balancer
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
 WebFlux Instance A       WebFlux Instance B
          │                       │
          └──────────┬────────────┘
                     ▼
                   Redis
                  Pub/Sub
```

예를 들어:

```text
User A → Instance A
User B → Instance B
```

가 되면 instance 간 realtime event 전달이 필요하다.

이 시점에는 Redis가 다음 역할을 가질 수 있다.

```text
Redis Pub/Sub
Distributed Presence
Distributed Typing State
Instance 간 WebSocket Event 전달
```

즉 Redis는:

> 처음부터 넣어두는 인프라가 아니라 실제 horizontal scaling이 필요해졌을 때 추가한다.

---

## 65.11 Firebase 역할

Firebase는 backend를 대체하지 않는다.

MVP에서는 다음 두 기능만 사용한다.

```text
Firebase Authentication
Firebase Cloud Messaging
```

Authentication:

```text
React Native
    ↓
Firebase Authentication
    ↓
Firebase ID Token
    ↓
Spring WebFlux
    ↓
Token Validation
```

Push Notification:

```text
Spring Backend
     ↓
FCM
     ↓
iPhone
```

Firestore는 사용하지 않는다.

---

## 65.12 MVP Infrastructure 최종 구조

최종적인 MVP 구조:

```text
┌─────────────────────────────────┐
│       React Native / Expo       │
│                                 │
│             iPhone              │
└────────────────┬────────────────┘
                 │
             HTTPS / WSS
                 │
                 ▼
┌─────────────────────────────────┐
│      Azure Container Apps       │
│                                 │
│      Spring Boot + WebFlux      │
│                                 │
│      REST API / WebSocket       │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│       Azure DocumentDB          │
│                                 │
│ User                            │
│ Room                            │
│ Message                         │
│ Buddy                           │
│ Invitation                      │
└─────────────────────────────────┘
```

외부 서비스:

```text
Firebase Authentication
Firebase Cloud Messaging
```

MVP에 없는 infrastructure:

```text
Redis ❌
Azure Blob Storage ❌
Azure VM ❌
Self-hosted MongoDB ❌
MongoDB Atlas ❌
Cosmos DB for MongoDB ❌
Kafka ❌
Kubernetes / AKS ❌
```

---

## 65.13 Infrastructure as Code

Azure resource는 가능한 범위에서 Terraform으로 관리한다.

예상 resource:

```text
Resource Group
Azure Container Apps Environment
Azure Container App
Azure Container Registry
Azure DocumentDB
```

필요한 경우 다음을 추가한다.

```text
Log Analytics
Application Insights
Budget / Alert
```

단, buddy-chat은 infrastructure 자체가 핵심인 프로젝트가 아니다.

따라서 IaC는:

> 안정적인 배포와 재현 가능한 환경을 만드는 데 필요한 수준

까지만 구현한다.

---

## 65.14 Deployment 기본 방향

애플리케이션 배포 흐름은 다음 형태를 기본으로 한다.

```text
GitHub
   │
   ▼
CI
   │
   ├ Test
   ├ Build
   └ Docker Image Build
       │
       ▼
Azure Container Registry
       │
       ▼
Azure Container Apps
```

Infrastructure provisioning:

```text
Terraform
```

Application deployment:

```text
GitHub Actions
또는
Azure 기반 CI/CD
```

구체적인 CI/CD 도구 선택은 구현 단계에서 결정한다.

---

## 65.15 Region

buddy-chat은 일본 사용자를 우선 대상으로 하므로 가능한 경우 Azure resource를 동일한 일본 region에 배치한다.

기본 후보:

```text
Japan East
```

목표:

```text
Container Apps
      ↕
DocumentDB
```

간 network latency를 최소화하고 resource 관리를 단순화하는 것이다.

실제 provisioning 시점에는 각 서비스의 region 지원 여부와 무료 tier 조건을 다시 확인한다.

---

## 65.16 MVP Infrastructure 핵심 원칙

1. **Backend는 Azure Container Apps에 Docker container로 배포한다.**
2. **VM에서 MongoDB를 직접 운영하지 않는다.**
3. **Database는 Azure DocumentDB를 사용한다.**
4. **Spring Data Reactive MongoDB를 사용해 reactive stack을 유지한다.**
5. **MVP에서는 Redis를 사용하지 않는다.**
6. **Presence / Typing 등 ephemeral state는 단일 backend process memory에서 처리한다.**
7. **Backend replica는 MVP에서 1개를 기본으로 한다.**
8. **Horizontal scaling이 실제로 필요해지면 Redis Pub/Sub을 검토한다.**
9. **MVP에는 사진 첨부 기능이 없으므로 Azure Blob Storage를 사용하지 않는다.**
10. **Firebase는 Authentication과 FCM에만 사용한다.**
11. **Azure infrastructure는 가능한 범위에서 Terraform으로 관리한다.**
12. **Infrastructure를 필요 이상으로 복잡하게 만들지 않는다.**

---

## 65.17 현재 확정된 MVP Infrastructure

```text
Frontend
React Native + Expo
iOS First

        ↓

Authentication
Firebase Authentication

        ↓

Backend
Azure Container Apps
Spring Boot + Spring WebFlux

        ↓

Persistent Data
Azure DocumentDB
(MongoDB-compatible)

        ↓

Push Notification
Firebase Cloud Messaging
```

사용하지 않음:

```text
Redis
Blob Storage
VM
Self-hosted MongoDB
MongoDB Atlas
Firestore
Kafka
Kubernetes
```

이 구성을 **buddy-chat MVP의 baseline infrastructure**로 사용한다.

