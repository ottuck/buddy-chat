package com.buddychat.chat;

import org.springframework.data.mongodb.repository.ReactiveMongoRepository;
import reactor.core.publisher.Mono;

interface MessageRepository extends ReactiveMongoRepository<Message, String> {

    Mono<Message> findByRoomIdAndSenderIdAndClientMessageId(String roomId, String senderId, String clientMessageId);
}
