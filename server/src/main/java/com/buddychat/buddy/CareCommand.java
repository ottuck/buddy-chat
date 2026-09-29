package com.buddychat.buddy;

import java.util.Locale;
import java.util.Optional;
import java.util.Set;

/**
 * Care from the chat (docs/product.md, Buddy 무대): a message that is only "밥" or "🍚" feeds the
 * buddy, only "청소" or "🧹" cleans up, in each supported language. Only the whole message counts,
 * so "밥 먹었어?" stays a question; trailing "!", "~" or "." are fine.
 */
enum CareCommand {
    FEED(Set.of("밥", "🍚", "ごはん", "ご飯", "food", "feed")),
    CLEAN(Set.of("청소", "🧹", "そうじ", "掃除", "clean"));

    private final Set<String> words;

    CareCommand(Set<String> words) {
        this.words = words;
    }

    static Optional<CareCommand> of(String text) {
        String word = text.strip().replaceAll("[!~.！。]+$", "").strip().toLowerCase(Locale.ROOT);
        for (CareCommand command : values()) {
            if (command.words.contains(word)) return Optional.of(command);
        }
        return Optional.empty();
    }
}
