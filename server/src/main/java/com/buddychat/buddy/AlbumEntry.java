package com.buddychat.buddy;

import java.time.Instant;

/**
 * A buddy that grew up and went its own way (docs/product.md, 독립과 앨범), kept in its room's album.
 * Only what the album shows: the name and the days it spent with the two.
 */
public record AlbumEntry(String name, Instant bornAt, Instant graduatedAt) {}
