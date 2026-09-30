package com.buddychat.notification;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.util.Base64;
import org.junit.jupiter.api.Test;

class WebPushCryptoTest {

    private static byte[] b64(String value) {
        return Base64.getUrlDecoder().decode(value);
    }

    // RFC 8291, Appendix A.
    @Test
    void encryptsTheRfcExampleExactly() throws Exception {
        KeyPair server = WebPushCrypto.keyPair(
                b64("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw"),
                b64("BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8"));

        byte[] body = WebPushCrypto.encrypt(
                "When I grow up, I want to be a watermelon".getBytes(StandardCharsets.UTF_8),
                b64("BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4"),
                b64("BTBZMqHH6r4Tts7J_aSIgg"),
                server,
                b64("DGv6ra1nlYgDCS1FRnbzlw"));

        assertThat(Base64.getUrlEncoder().withoutPadding().encodeToString(body))
                .isEqualTo("DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocIn"
                        + "mYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexS"
                        + "gSxsj_Qulcy4a-fN");
    }

    @Test
    void keysSurviveTheRoundTripThroughRawBytes() throws Exception {
        KeyPair keys = WebPushCrypto.newKeyPair();
        byte[] publicBytes = WebPushCrypto.publicKeyBytes((ECPublicKey) keys.getPublic());
        byte[] privateBytes = WebPushCrypto.privateKeyBytes((ECPrivateKey) keys.getPrivate());

        KeyPair again = WebPushCrypto.keyPair(privateBytes, publicBytes);

        assertThat(publicBytes).hasSize(65);
        assertThat(again.getPublic()).isEqualTo(keys.getPublic());
        assertThat(again.getPrivate().getEncoded()).isEqualTo(keys.getPrivate().getEncoded());
    }

    @Test
    void readsKeysAsTerraformWritesThem() throws Exception {
        KeyPair keys = WebPushCrypto.newKeyPair();
        String privatePem = "-----BEGIN PRIVATE KEY-----\n"
                + Base64.getMimeEncoder().encodeToString(keys.getPrivate().getEncoded())
                + "\n-----END PRIVATE KEY-----\n";
        String publicPem = "-----BEGIN PUBLIC KEY-----\n"
                + Base64.getMimeEncoder().encodeToString(keys.getPublic().getEncoded())
                + "\n-----END PUBLIC KEY-----\n";

        KeyPair read = WebPushCrypto.keyPair(privatePem, publicPem);

        assertThat(read.getPublic()).isEqualTo(keys.getPublic());
        assertThat(read.getPrivate().getEncoded()).isEqualTo(keys.getPrivate().getEncoded());
    }
}
