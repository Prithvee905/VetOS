package com.vetos.identity.application;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class TotpTest {

	// RFC 6238 appendix B, SHA-1 seed "12345678901234567890" (last 6 of the 8-digit values).
	private static final String RFC_SECRET = Totp.base32("12345678901234567890".getBytes(StandardCharsets.US_ASCII));

	@Test
	void matchesRfc6238TestVectors() {
		assertThat(RFC_SECRET).isEqualTo("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
		assertThat(Totp.codeFor(RFC_SECRET, 59)).isEqualTo("287082");
		assertThat(Totp.codeFor(RFC_SECRET, 1111111109)).isEqualTo("081804");
		assertThat(Totp.codeFor(RFC_SECRET, 2000000000)).isEqualTo("279037");
	}

	@Test
	void acceptsNeighbouringStepsButNeverTheSameStepTwice() {
		long now = 1_700_000_000L;
		String current = Totp.codeFor(RFC_SECRET, now);
		long step = Totp.verify(RFC_SECRET, current, now, null);
		assertThat(step).isEqualTo(Totp.currentStep(now));
		assertThat(Totp.verify(RFC_SECRET, current, now, step)).isEqualTo(-1);
		assertThat(Totp.verify(RFC_SECRET, Totp.codeFor(RFC_SECRET, now - 30), now, null)).isEqualTo(step - 1);
		assertThat(Totp.verify(RFC_SECRET, Totp.codeFor(RFC_SECRET, now - 90), now, null)).isEqualTo(-1);
		assertThat(Totp.verify(RFC_SECRET, "12345", now, null)).isEqualTo(-1);
	}

	@Test
	void secretsRoundTripThroughEncryption() {
		String secret = Totp.newSecret();
		String sealed = Totp.encrypt(secret, "server-secret");
		assertThat(sealed).startsWith("v1:").doesNotContain(secret);
		assertThat(Totp.decrypt(sealed, "server-secret")).isEqualTo(secret);
		assertThat(Totp.decodeBase32(secret)).hasSize(20);
	}

	@Test
	void buildsAScannableEnrollmentUri() {
		String uri = Totp.otpauthUri("VetOS Paws Clinic", "doc@clinic.test", "ABC");
		assertThat(uri).isEqualTo("otpauth://totp/VetOS%20Paws%20Clinic:doc%40clinic.test?secret=ABC&issuer=VetOS%20Paws%20Clinic&algorithm=SHA1&digits=6&period=30");
		assertThat(Totp.qrSvg(uri)).startsWith("<svg").contains("<path");
	}
}
