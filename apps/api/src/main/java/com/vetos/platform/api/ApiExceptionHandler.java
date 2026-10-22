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

	private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(ApiExceptionHandler.class);

	@ExceptionHandler(Exception.class)
	public ResponseEntity<ApiError> handleUnexpected(Exception exception, HttpServletRequest request) {
		if (exception instanceof org.springframework.web.ErrorResponse errorResponse) {
			HttpStatus status = HttpStatus.resolve(errorResponse.getStatusCode().value());
			String detail = errorResponse.getBody().getDetail();
			return ResponseEntity.status(errorResponse.getStatusCode()).body(body(
					status == null ? "REQUEST_ERROR" : status.name(),
					detail == null || detail.isBlank() ? "The request could not be processed." : detail,
					List.of(),
					request));
		}
		if (exception instanceof org.springframework.http.converter.HttpMessageNotReadableException
				|| exception instanceof org.springframework.beans.TypeMismatchException) {
			return ResponseEntity.badRequest().body(body("BAD_REQUEST", "The request is malformed.", List.of(), request));
		}
		log.error("Unexpected error handling request {}: {}", request.getRequestURI(), exception.getMessage(), exception);
		return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
				.body(body("INTERNAL_ERROR", "The request could not be completed.", List.of(), request));
	}

	private static ApiError body(String code, String message, List<ApiError.FieldDetail> details, HttpServletRequest request) {
		return new ApiError(code, message, details, Instant.now(), RequestIds.from(request));
	}

}
