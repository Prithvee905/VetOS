package com.vetos.identity.infrastructure;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import com.vetos.identity.domain.VetosAuthentication;
import com.vetos.platform.config.VetosProperties;
import java.nio.charset.StandardCharsets;
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

	public String issue(UUID userId, UUID clinicId, String displayName, List<String> roles) {
		Instant now = Instant.now();
		JwtClaimsSet claims = JwtClaimsSet.builder()
				.subject(userId.toString())
				.issuedAt(now)
				.expiresAt(now.plus(properties.jwt().accessTtl()))
				.claim("clinic_id", clinicId.toString())
				.claim("display_name", displayName)
				.claim("roles", roles)
				.build();
		JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
		return encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
	}

	public VetosAuthentication authenticate(String token) {
		Jwt jwt = decoder.decode(token);
		@SuppressWarnings("unchecked")
		List<String> roles = (List<String>) jwt.getClaim("roles");
		return new VetosAuthentication(
				UUID.fromString(jwt.getSubject()),
				UUID.fromString(jwt.getClaimAsString("clinic_id")),
				jwt.getClaimAsString("display_name"),
				roles == null ? List.of() : roles);
	}

}
