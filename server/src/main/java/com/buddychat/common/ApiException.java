package com.buddychat.common;

import org.springframework.http.HttpStatus;

/**
 * An expected failure with a stable {@code code} the app maps to a message. UI copy lives in the
 * app, never in the server.
 */
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String code;

    public ApiException(HttpStatus status, String code) {
        super(code);
        this.status = status;
        this.code = code;
    }

    public HttpStatus status() {
        return status;
    }

    public String code() {
        return code;
    }
}
