package com.vetos.identity.infrastructure;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import com.vetos.identity.domain.VetosAuthentication;
import com.vetos.platform.config.VetosProperties;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.stereotype.Component;

@Component
public class AccessTokenService {

	private final JwtEncoder encoder;
	private final JwtDecoder decoder;
	private final VetosProperties properties;

	public AccessTokenService(VetosProperties properties) {
		this.properties = properties;
		SecretKey key = new SecretKeySpec(properties.jwt().secret().getBytes(StandardCharsets.UTF_8), "HmacSHA256");
		this.encoder = new NimbusJwtEncoder(new ImmutableSecret<>(key));
		this.decoder = NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
	}

	/** Token type of the short-lived proof that the password was right and a two-step code is now needed. */
	private static final String TWO_STEP_CHALLENGE = "two_step_challenge";
	private static final Duration CHALLENGE_TTL = Duration.ofMinutes(5);

	public String issue(UUID userId, UUID clinicId, String displayName, List<String> roles) {
		return issue(userId, clinicId, displayName, roles, false);
	}

	/** @param twoStepSetupRequired the clinic requires two-step login and this user has not set it up yet */
	public String issue(UUID userId, UUID clinicId, String displayName, List<String> roles, boolean twoStepSetupRequired) {
		Instant now = Instant.now();
		JwtClaimsSet.Builder claims = JwtClaimsSet.builder()
				.subject(userId.toString())
				.issuedAt(now)
				.expiresAt(now.plus(properties.jwt().accessTtl()))
				.claim("clinic_id", clinicId.toString())
				.claim("display_name", displayName)
				.claim("roles", roles);
		if (twoStepSetupRequired) {
			claims.claim("two_step_setup", true);
		}
		JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
		return encoder.encode(JwtEncoderParameters.from(header, claims.build())).getTokenValue();
	}

	public VetosAuthentication authenticate(String token) {
		Jwt jwt = decoder.decode(token);
		if (jwt.getClaim("typ") != null) {
			throw new IllegalArgumentException("Not an access token");
		}
		@SuppressWarnings("unchecked")
		List<String> roles = (List<String>) jwt.getClaim("roles");
		return new VetosAuthentication(
				UUID.fromString(jwt.getSubject()),
				UUID.fromString(jwt.getClaimAsString("clinic_id")),
				jwt.getClaimAsString("display_name"),
				roles == null ? List.of() : roles,
				Boolean.TRUE.equals(jwt.getClaim("two_step_setup")));
	}

	public String issueTwoStepChallenge(UUID userId, UUID clinicId) {
		Instant now = Instant.now();
		JwtClaimsSet claims = JwtClaimsSet.builder()
				.subject(userId.toString())
				.issuedAt(now)
				.expiresAt(now.plus(CHALLENGE_TTL))
				.claim("clinic_id", clinicId.toString())
				.claim("typ", TWO_STEP_CHALLENGE)
				.build();
		JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
		return encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
	}

	/** Returns {userId, clinicId} for a valid, unexpired challenge, or throws. */
	public UUID[] readTwoStepChallenge(String token) {
		Jwt jwt = decoder.decode(token);
		if (!TWO_STEP_CHALLENGE.equals(jwt.getClaimAsString("typ"))) {
			throw new IllegalArgumentException("Not a two-step challenge");
		}
		return new UUID[] { UUID.fromString(jwt.getSubject()), UUID.fromString(jwt.getClaimAsString("clinic_id")) };
	}

}
