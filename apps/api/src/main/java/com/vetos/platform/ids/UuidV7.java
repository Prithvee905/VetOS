package com.vetos.platform.ids;

import java.security.SecureRandom;
import java.util.UUID;

public final class UuidV7 {

	private static final SecureRandom RANDOM = new SecureRandom();

	private UuidV7() {
	}

	public static UUID generate() {
		long unixMs = System.currentTimeMillis() & 0xFFFFFFFFFFFFL;
		byte[] random = new byte[10];
		RANDOM.nextBytes(random);
		long msb = (unixMs << 16) | 0x7000L | ((random[0] & 0xFFL) << 4) | ((random[1] & 0xF0L) >>> 4);
		long lsb = 0;
		for (int i = 2; i < 10; i++) {
			lsb = (lsb << 8) | (random[i] & 0xFFL);
		}
		lsb = (lsb & 0x3FFFFFFFFFFFFFFFL) | 0x8000000000000000L;
		return new UUID(msb, lsb);
	}

}
