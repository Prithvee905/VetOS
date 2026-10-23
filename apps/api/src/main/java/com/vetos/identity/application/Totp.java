package com.vetos.identity.application;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.WriterException;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import java.net.URLEncoder;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Map;
import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/** RFC 6238 time-based one-time passwords (6 digits, 30 seconds, HMAC-SHA1), as used by authenticator apps. */
public final class Totp {

	public static final int STEP_SECONDS = 30;
	private static final int DIGITS = 6;
	/** Accept the previous and next code too, for phone clocks that drift. */
	private static final int WINDOW = 1;
	private static final char[] BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".toCharArray();
	private static final SecureRandom RANDOM = new SecureRandom();

	private Totp() {
	}

	/** A new 160-bit secret, base32 encoded (what authenticator apps expect). */
	public static String newSecret() {
		byte[] bytes = new byte[20];
		RANDOM.nextBytes(bytes);
		return base32(bytes);
	}

	public static long currentStep(long epochSeconds) {
		return epochSeconds / STEP_SECONDS;
	}

	/**
	 * Returns the time step the code matches, or -1. Steps at or before {@code lastUsedStep} are refused
	 * so the same code cannot be used twice.
	 */
	public static long verify(String base32Secret, String code, long epochSeconds, Long lastUsedStep) {
		String digits = code == null ? "" : code.replaceAll("\\s", "");
		if (!digits.matches("\\d{" + DIGITS + "}")) {
			return -1;
		}
		byte[] key = decodeBase32(base32Secret);
		long now = currentStep(epochSeconds);
		for (long step = now - WINDOW; step <= now + WINDOW; step++) {
			if (lastUsedStep != null && step <= lastUsedStep) {
				continue;
			}
			if (MessageDigest.isEqual(codeAt(key, step).getBytes(StandardCharsets.US_ASCII), digits.getBytes(StandardCharsets.US_ASCII))) {
				return step;
			}
		}
		return -1;
	}

	static String codeAt(byte[] key, long step) {
		try {
			Mac mac = Mac.getInstance("HmacSHA1");
			mac.init(new SecretKeySpec(key, "HmacSHA1"));
			byte[] hash = mac.doFinal(ByteBuffer.allocate(8).putLong(step).array());
			int offset = hash[hash.length - 1] & 0x0f;
			int binary = ((hash[offset] & 0x7f) << 24) | ((hash[offset + 1] & 0xff) << 16)
					| ((hash[offset + 2] & 0xff) << 8) | (hash[offset + 3] & 0xff);
			return String.format("%0" + DIGITS + "d", binary % 1_000_000);
		}
		catch (GeneralSecurityException exception) {
			throw new IllegalStateException("HmacSHA1 unavailable", exception);
		}
	}

	/** Current code for a secret; used by tests. */
	public static String codeFor(String base32Secret, long epochSeconds) {
		return codeAt(decodeBase32(base32Secret), currentStep(epochSeconds));
	}

	public static String otpauthUri(String issuer, String account, String base32Secret) {
		String label = enc(issuer) + ":" + enc(account);
		return "otpauth://totp/" + label + "?secret=" + base32Secret + "&issuer=" + enc(issuer)
				+ "&algorithm=SHA1&digits=" + DIGITS + "&period=" + STEP_SECONDS;
	}

	/** The URI as an SVG QR code, so the browser needs no QR library. */
	public static String qrSvg(String text) {
		try {
			BitMatrix matrix = new QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, 0, 0,
					Map.of(EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.M, EncodeHintType.MARGIN, 2));
			int size = matrix.getWidth();
			StringBuilder path = new StringBuilder();
			for (int y = 0; y < size; y++) {
				for (int x = 0; x < size; x++) {
					if (matrix.get(x, y)) {
						path.append('M').append(x).append(' ').append(y).append("h1v1h-1z");
					}
				}
			}
			return "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 " + size + " " + size
					+ "\" shape-rendering=\"crispEdges\"><rect width=\"100%\" height=\"100%\" fill=\"#fff\"/><path fill=\"#000\" d=\""
					+ path + "\"/></svg>";
		}
		catch (WriterException exception) {
			throw new IllegalStateException("Could not build the QR code", exception);
		}
	}

	// ----------------------------------------------------
	// Secret encryption at rest (AES-256-GCM). The key is derived from the server's JWT secret,
	// so database backups alone cannot be used to generate codes. Rotating the JWT secret means
	// everyone must set up two-step login again.
	// ----------------------------------------------------

	public static String encrypt(String plaintext, String serverSecret) {
		try {
			byte[] iv = new byte[12];
			RANDOM.nextBytes(iv);
			Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
			cipher.init(Cipher.ENCRYPT_MODE, aesKey(serverSecret), new GCMParameterSpec(128, iv));
			byte[] sealed = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
			return "v1:" + Base64.getEncoder().encodeToString(ByteBuffer.allocate(iv.length + sealed.length).put(iv).put(sealed).array());
		}
		catch (GeneralSecurityException exception) {
			throw new IllegalStateException("Could not encrypt the two-step secret", exception);
		}
	}

	public static String decrypt(String stored, String serverSecret) {
		if (stored == null || !stored.startsWith("v1:")) {
			throw new IllegalStateException("Unknown two-step secret format");
		}
		try {
			byte[] all = Base64.getDecoder().decode(stored.substring(3));
			Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
			cipher.init(Cipher.DECRYPT_MODE, aesKey(serverSecret), new GCMParameterSpec(128, all, 0, 12));
			return new String(cipher.doFinal(all, 12, all.length - 12), StandardCharsets.UTF_8);
		}
		catch (GeneralSecurityException exception) {
			throw new IllegalStateException("Could not decrypt the two-step secret", exception);
		}
	}

	private static SecretKeySpec aesKey(String serverSecret) throws GeneralSecurityException {
		byte[] key = MessageDigest.getInstance("SHA-256").digest(("vetos-two-step|" + serverSecret).getBytes(StandardCharsets.UTF_8));
		return new SecretKeySpec(key, "AES");
	}

	// ----------------------------------------------------
	// Base32 (RFC 4648, no padding)
	// ----------------------------------------------------

	static String base32(byte[] data) {
		StringBuilder out = new StringBuilder();
		int buffer = 0;
		int bits = 0;
		for (byte b : data) {
			buffer = (buffer << 8) | (b & 0xff);
			bits += 8;
			while (bits >= 5) {
				out.append(BASE32[(buffer >> (bits - 5)) & 31]);
				bits -= 5;
			}
		}
		if (bits > 0) {
			out.append(BASE32[(buffer << (5 - bits)) & 31]);
		}
		return out.toString();
	}

	static byte[] decodeBase32(String text) {
		String clean = text.replace("=", "").replace(" ", "").toUpperCase();
		ByteBuffer out = ByteBuffer.allocate(clean.length() * 5 / 8);
		int buffer = 0;
		int bits = 0;
		for (char c : clean.toCharArray()) {
			int value = c >= 'A' && c <= 'Z' ? c - 'A' : c >= '2' && c <= '7' ? c - '2' + 26 : -1;
			if (value < 0) {
				throw new IllegalArgumentException("Invalid base32 character");
			}
			buffer = (buffer << 5) | value;
			bits += 5;
			if (bits >= 8) {
				out.put((byte) ((buffer >> (bits - 8)) & 0xff));
				bits -= 8;
			}
		}
		return out.array();
	}

	private static String enc(String value) {
		return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
	}
}
