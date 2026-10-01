package com.vetos.identity.api;

import com.vetos.identity.application.AuthorizationSupport;
import com.vetos.identity.application.UserAdminService;
import com.vetos.identity.domain.VetosAuthentication;
import com.vetos.platform.api.RequestIds;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.http.HttpStatus;

@RestController
@RequestMapping("/api/v1/users")
public class UserController {

	private final UserAdminService userAdminService;
	private final AuthorizationSupport authorizationSupport;

	public UserController(UserAdminService userAdminService, AuthorizationSupport authorizationSupport) {
		this.userAdminService = userAdminService;
		this.authorizationSupport = authorizationSupport;
	}

	@GetMapping
	public UserPage list(
			@AuthenticationPrincipal VetosAuthentication authentication,
			@RequestParam(defaultValue = "0") int page,
			@RequestParam(defaultValue = "25") int size) {
		authorizationSupport.requirePermission(authentication, "USER_MANAGE");
		return userAdminService.list(page, size);
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	public UserResponse create(
			@AuthenticationPrincipal VetosAuthentication authentication,
			@Valid @RequestBody UserCreateRequest request,
			HttpServletRequest httpRequest) {
		authorizationSupport.requirePermission(authentication, "USER_MANAGE");
		return userAdminService.create(
				authentication.clinicId(),
				authentication.userId(),
				request,
				RequestIds.from(httpRequest));
	}

	@PatchMapping("/{userId}")
	public UserResponse update(
			@AuthenticationPrincipal VetosAuthentication authentication,
			@PathVariable UUID userId,
			@Valid @RequestBody UserUpdateRequest request,
			HttpServletRequest httpRequest) {
		authorizationSupport.requirePermission(authentication, "USER_MANAGE");
		return userAdminService.update(
				authentication.clinicId(),
				authentication.userId(),
				userId,
				request,
				RequestIds.from(httpRequest));
	}

	public record UserResponse(
			UUID id,
			String email,
			String displayName,
			String status,
			UUID branchId,
			List<String> roles,
			long version) {
	}

	public record UserPage(List<UserResponse> items, int page, int size, boolean hasNext) {
	}

	public record UserCreateRequest(
			@NotBlank @Email @Size(max = 320) String email,
			@NotBlank @Size(min = 8, max = 128) String password,
			@NotBlank @Size(max = 200) String displayName,
			UUID branchId,
			@NotEmpty List<@NotBlank @Pattern(regexp = "OWNER|DOCTOR|RECEPTIONIST|STAFF") String> roles) {
	}

	public record UserUpdateRequest(
			@NotNull Long version,
			@Size(max = 200) String displayName,
			@Pattern(regexp = "ACTIVE|DISABLED") String status,
			UUID branchId,
			List<@NotBlank @Pattern(regexp = "OWNER|DOCTOR|RECEPTIONIST|STAFF") String> roles) {
	}

}
