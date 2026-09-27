package com.buddychat.notification;

import java.util.Map;

/** One notification to one device, in the format of Expo's push API. */
record PushMessage(String to, String title, String body, String sound, Map<String, String> data) {}
