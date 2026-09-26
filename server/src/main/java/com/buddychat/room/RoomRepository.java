package com.buddychat.room;

import org.springframework.data.mongodb.repository.ReactiveMongoRepository;

interface RoomRepository extends ReactiveMongoRepository<Room, String> {}
