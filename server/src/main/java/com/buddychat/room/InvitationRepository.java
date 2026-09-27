package com.buddychat.room;

import org.springframework.data.mongodb.repository.ReactiveMongoRepository;
import reactor.core.publisher.Mono;

interface InvitationRepository extends ReactiveMongoRepository<Invitation, String> {

    Mono<Invitation> findByCode(String code);
}
