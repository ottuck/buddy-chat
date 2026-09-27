package com.buddychat.common;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.bind.support.WebExchangeBindException;

@RestControllerAdvice
class ApiExceptionHandler {

    record ErrorResponse(String code) {}

    @ExceptionHandler(ApiException.class)
    ResponseEntity<ErrorResponse> handle(ApiException e) {
        return ResponseEntity.status(e.status()).body(new ErrorResponse(e.code()));
    }

    @ExceptionHandler(WebExchangeBindException.class)
    ResponseEntity<ErrorResponse> handleValidation(WebExchangeBindException e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(new ErrorResponse("INVALID_REQUEST"));
    }
}
