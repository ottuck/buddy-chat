package com.buddychat.notification;

import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPoint;
import java.security.spec.ECPrivateKeySpec;
import java.security.spec.ECPublicKeySpec;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Arrays;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Message encryption for Web Push (RFC 8291, "aes128gcm" content coding of RFC 8188) with the
 * JDK's own crypto: the browser's push service only relays the ciphertext. One record, as the
 * payloads here are small. Checked against the example in RFC 8291's appendix.
 */
final class WebPushCrypto {

    static final int RECORD_SIZE = 4096;
    private static final byte[] KEY_INFO = "WebPush: info\0".getBytes(StandardCharsets.US_ASCII);
    private static final byte[] CEK_INFO = "Content-Encoding: aes128gcm\0".getBytes(StandardCharsets.US_ASCII);
    private static final byte[] NONCE_INFO = "Content-Encoding: nonce\0".getBytes(StandardCharsets.US_ASCII);
    private static final ECParameterSpec P256 = p256();

    private WebPushCrypto() {}

    /**
     * @param uaPublic the browser's key ({@code p256dh}), an uncompressed P-256 point
     * @param authSecret the browser's 16-byte {@code auth}
     * @param serverKeys a key pair for this message only (not the VAPID keys)
     * @param salt 16 random bytes
     * @return the request body: header (salt, record size, the server's public key) and ciphertext
     */
    static byte[] encrypt(byte[] plaintext, byte[] uaPublic, byte[] authSecret, KeyPair serverKeys, byte[] salt)
            throws GeneralSecurityException {
        byte[] asPublic = publicKeyBytes((ECPublicKey) serverKeys.getPublic());
        KeyAgreement agreement = KeyAgreement.getInstance("ECDH");
        agreement.init(serverKeys.getPrivate());
        agreement.doPhase(publicKey(uaPublic), true);
        byte[] ecdhSecret = agreement.generateSecret();

        byte[] prkKey = hmac(authSecret, ecdhSecret);
        byte[] ikm = hmac(prkKey, concat(KEY_INFO, uaPublic, asPublic, new byte[] {1}));
        byte[] prk = hmac(salt, ikm);
        byte[] cek = Arrays.copyOf(hmac(prk, concat(CEK_INFO, new byte[] {1})), 16);
        byte[] nonce = Arrays.copyOf(hmac(prk, concat(NONCE_INFO, new byte[] {1})), 12);

        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(cek, "AES"), new GCMParameterSpec(128, nonce));
        // 0x02: the last (and only) record, no further padding.
        byte[] ciphertext = cipher.doFinal(concat(plaintext, new byte[] {2}));

        ByteBuffer header = ByteBuffer.allocate(16 + 4 + 1 + asPublic.length);
        header.put(salt).putInt(RECORD_SIZE).put((byte) asPublic.length).put(asPublic);
        return concat(header.array(), ciphertext);
    }

    static KeyPair newKeyPair() throws GeneralSecurityException {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
        generator.initialize(new ECGenParameterSpec("secp256r1"));
        return generator.generateKeyPair();
    }

    /** A key pair from its raw parts: the 32-byte private value and the uncompressed public point. */
    static KeyPair keyPair(byte[] privateKey, byte[] publicKey) throws GeneralSecurityException {
        ECPrivateKey d = (ECPrivateKey)
                KeyFactory.getInstance("EC").generatePrivate(new ECPrivateKeySpec(new BigInteger(1, privateKey), P256));
        return new KeyPair(publicKey(publicKey), d);
    }

    /**
     * A key pair from configuration: PEM (PKCS#8 private key, X.509 public key, as Terraform's
     * tls_private_key writes them) or base64url of the raw parts.
     */
    static KeyPair keyPair(String privateKey, String publicKey) throws GeneralSecurityException {
        if (!privateKey.strip().startsWith("-----BEGIN")) {
            return keyPair(
                    Base64.getUrlDecoder().decode(privateKey.strip()),
                    Base64.getUrlDecoder().decode(publicKey.strip()));
        }
        KeyFactory factory = KeyFactory.getInstance("EC");
        return new KeyPair(
                factory.generatePublic(new X509EncodedKeySpec(pem(publicKey))),
                factory.generatePrivate(new PKCS8EncodedKeySpec(pem(privateKey))));
    }

    private static byte[] pem(String text) {
        return Base64.getMimeDecoder()
                .decode(text.replaceAll("-----[A-Z ]+-----", "").strip());
    }

    static ECPublicKey publicKey(byte[] uncompressed) throws GeneralSecurityException {
        if (uncompressed.length != 65 || uncompressed[0] != 4) {
            throw new GeneralSecurityException("Not an uncompressed P-256 point");
        }
        ECPoint point = new ECPoint(
                new BigInteger(1, Arrays.copyOfRange(uncompressed, 1, 33)),
                new BigInteger(1, Arrays.copyOfRange(uncompressed, 33, 65)));
        return (ECPublicKey) KeyFactory.getInstance("EC").generatePublic(new ECPublicKeySpec(point, P256));
    }

    static byte[] publicKeyBytes(ECPublicKey key) {
        byte[] out = new byte[65];
        out[0] = 4;
        copyUnsigned(key.getW().getAffineX(), out, 1);
        copyUnsigned(key.getW().getAffineY(), out, 33);
        return out;
    }

    static byte[] privateKeyBytes(ECPrivateKey key) {
        byte[] out = new byte[32];
        copyUnsigned(key.getS(), out, 0);
        return out;
    }

    // A coordinate as exactly 32 bytes (BigInteger adds a sign byte or drops leading zeros).
    private static void copyUnsigned(BigInteger value, byte[] out, int offset) {
        byte[] bytes = value.toByteArray();
        int start = Math.max(0, bytes.length - 32);
        int length = bytes.length - start;
        System.arraycopy(bytes, start, out, offset + 32 - length, length);
    }

    private static byte[] hmac(byte[] key, byte[] data) throws GeneralSecurityException {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(key, "HmacSHA256"));
        return mac.doFinal(data);
    }

    private static byte[] concat(byte[]... parts) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        for (byte[] part : parts) out.writeBytes(part);
        return out.toByteArray();
    }

    private static ECParameterSpec p256() {
        try {
            return ((ECPublicKey) newKeyPair().getPublic()).getParams();
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("P-256 is not available", e);
        }
    }
}
