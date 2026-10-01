package com.vetos.platform.api;

import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {

	@ExceptionHandler(ApiException.class)
	public ResponseEntity<ApiError> handleApi(ApiException exception, HttpServletRequest request) {
		return ResponseEntity.status(exception.status()).body(body(
				exception.code(),
				exception.getMessage(),
				List.of(),
				request));
	}

	@ExceptionHandler(MethodArgumentNotValidException.class)
	public ResponseEntity<ApiError> handleValidation(MethodArgumentNotValidException exception, HttpServletRequest request) {
		List<ApiError.FieldDetail> details = exception.getBindingResult().getFieldErrors().stream()
				.map(error -> new ApiError.FieldDetail(error.getField(), error.getDefaultMessage()))
				.toList();
		return ResponseEntity.badRequest().body(body("VALIDATION_ERROR", "Request validation failed.", details, request));
	}

	@ExceptionHandler(Exception.class)
	public ResponseEntity<ApiError> handleUnexpected(Exception exception, HttpServletRequest request) {
		return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
				.body(body("INTERNAL_ERROR", "The request could not be completed.", List.of(), request));
	}

	private static ApiError body(String code, String message, List<ApiError.FieldDetail> details, HttpServletRequest request) {
		return new ApiError(code, message, details, Instant.now(), RequestIds.from(request));
	}

}
