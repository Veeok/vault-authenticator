package com.example.authenticator;

import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyInfo;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import android.security.keystore.StrongBoxUnavailableException;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.security.KeyStore;
import java.util.UUID;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "VaultKey")
public class VaultKeyPlugin extends Plugin {
    private static final String KEYSTORE_NAME = "AndroidKeyStore";
    private static final int GCM_TAG_BITS = 128;
    private static final int BIOMETRIC_AUTH_VALIDITY_SECONDS = 30;

    private KeyGenParameterSpec buildSpec(String alias, boolean biometric, boolean preferStrongBox) {
        KeyGenParameterSpec.Builder builder = new KeyGenParameterSpec.Builder(
            alias,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256);

        if (biometric) {
            builder.setUserAuthenticationRequired(true);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                builder.setUserAuthenticationParameters(BIOMETRIC_AUTH_VALIDITY_SECONDS, KeyProperties.AUTH_BIOMETRIC_STRONG);
            } else {
                builder.setUserAuthenticationValidityDurationSeconds(BIOMETRIC_AUTH_VALIDITY_SECONDS);
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                builder.setInvalidatedByBiometricEnrollment(true);
            }
        }

        if (preferStrongBox && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            builder.setIsStrongBoxBacked(true);
        }

        return builder.build();
    }

    private JSObject buildHardwareInfo(SecretKey secretKey) {
        JSObject result = new JSObject();
        result.put("secureHardwareEnforced", false);
        result.put("securityLevel", "unknown");

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return result;
        }

        try {
            SecretKeyFactory factory = SecretKeyFactory.getInstance(secretKey.getAlgorithm(), KEYSTORE_NAME);
            KeyInfo keyInfo = (KeyInfo) factory.getKeySpec(secretKey, KeyInfo.class);
            boolean insideSecureHardware = keyInfo.isInsideSecureHardware();
            boolean authEnforcedByHardware = false;
            try {
                authEnforcedByHardware = keyInfo.isUserAuthenticationRequirementEnforcedBySecureHardware();
            } catch (Exception ignored) {
                // best effort on older platforms
            }
            result.put("secureHardwareEnforced", insideSecureHardware || authEnforcedByHardware);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                result.put("securityLevel", String.valueOf(keyInfo.getSecurityLevel()));
            } else {
                result.put("securityLevel", insideSecureHardware ? "SECURE_HARDWARE" : "SOFTWARE");
            }
        } catch (Exception ignored) {
            // best effort only
        }

        return result;
    }

    private SecretKey requireKey(String alias) throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE_NAME);
        keyStore.load(null);
        KeyStore.SecretKeyEntry entry = (KeyStore.SecretKeyEntry) keyStore.getEntry(alias, null);
        if (entry == null) {
            throw new IllegalStateException("Key not found");
        }
        return entry.getSecretKey();
    }

    @PluginMethod
    public void generateKey(PluginCall call) {
        try {
            String alias = call.getString("alias");
            boolean biometric = call.getBoolean("biometric", false);
            if (alias == null || alias.trim().isEmpty()) {
                alias = "vault-key-" + UUID.randomUUID();
            }

            KeyGenerator keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE_NAME);
            try {
                keyGenerator.init(buildSpec(alias, biometric, biometric));
            } catch (StrongBoxUnavailableException ignored) {
                keyGenerator.init(buildSpec(alias, biometric, false));
            }
            keyGenerator.generateKey();

            JSObject result = new JSObject();
            result.put("alias", alias);
            call.resolve(result);
        } catch (Exception error) {
            call.reject(error.getMessage());
        }
    }

    @PluginMethod
    public void wrap(PluginCall call) {
        try {
            String alias = call.getString("alias");
            String plaintextBase64 = call.getString("plaintextBase64");
            if (alias == null || plaintextBase64 == null) {
                call.reject("Missing wrap parameters");
                return;
            }

            SecretKey secretKey = requireKey(alias);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, secretKey);
            byte[] encrypted = cipher.doFinal(Base64.decode(plaintextBase64, Base64.NO_WRAP));
            byte[] iv = cipher.getIV();

            int cipherLength = encrypted.length - (GCM_TAG_BITS / 8);
            byte[] ciphertext = new byte[cipherLength];
            byte[] authTag = new byte[GCM_TAG_BITS / 8];
            System.arraycopy(encrypted, 0, ciphertext, 0, cipherLength);
            System.arraycopy(encrypted, cipherLength, authTag, 0, authTag.length);

            JSObject result = new JSObject();
            result.put("iv", Base64.encodeToString(iv, Base64.NO_WRAP));
            result.put("wrappedKey", Base64.encodeToString(ciphertext, Base64.NO_WRAP));
            result.put("authTag", Base64.encodeToString(authTag, Base64.NO_WRAP));
            call.resolve(result);
        } catch (Exception error) {
            call.reject(error.getMessage());
        }
    }

    @PluginMethod
    public void unwrap(PluginCall call) {
        try {
            String alias = call.getString("alias");
            String iv = call.getString("iv");
            String wrappedKey = call.getString("wrappedKey");
            String authTag = call.getString("authTag");
            if (alias == null || iv == null || wrappedKey == null || authTag == null) {
                call.reject("Missing unwrap parameters");
                return;
            }

            SecretKey secretKey = requireKey(alias);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(
                Cipher.DECRYPT_MODE,
                secretKey,
                new GCMParameterSpec(GCM_TAG_BITS, Base64.decode(iv, Base64.NO_WRAP))
            );

            byte[] ciphertext = Base64.decode(wrappedKey, Base64.NO_WRAP);
            byte[] tag = Base64.decode(authTag, Base64.NO_WRAP);
            byte[] encrypted = new byte[ciphertext.length + tag.length];
            System.arraycopy(ciphertext, 0, encrypted, 0, ciphertext.length);
            System.arraycopy(tag, 0, encrypted, ciphertext.length, tag.length);

            byte[] plaintext = cipher.doFinal(encrypted);
            JSObject result = new JSObject();
            result.put("plaintextBase64", Base64.encodeToString(plaintext, Base64.NO_WRAP));
            JSObject hardwareInfo = buildHardwareInfo(secretKey);
            result.put("secureHardwareEnforced", hardwareInfo.getBool("secureHardwareEnforced", false));
            result.put("securityLevel", hardwareInfo.getString("securityLevel", "unknown"));
            call.resolve(result);
        } catch (KeyPermanentlyInvalidatedException error) {
            call.reject("KEY_INVALIDATED_BY_BIOMETRIC_ENROLLMENT", "E_BIOMETRIC_INVALIDATED");
        } catch (Exception error) {
            String message = error.getMessage();
            if (message != null && message.toLowerCase().contains("permanently invalidated")) {
                call.reject("KEY_INVALIDATED_BY_BIOMETRIC_ENROLLMENT", "E_BIOMETRIC_INVALIDATED");
                return;
            }
            call.reject(message);
        }
    }

    @PluginMethod
    public void deleteKey(PluginCall call) {
        try {
            String alias = call.getString("alias");
            if (alias == null || alias.trim().isEmpty()) {
                call.reject("Missing key alias");
                return;
            }

            KeyStore keyStore = KeyStore.getInstance(KEYSTORE_NAME);
            keyStore.load(null);
            keyStore.deleteEntry(alias);

            JSObject result = new JSObject();
            result.put("alias", alias);
            call.resolve(result);
        } catch (Exception error) {
            call.reject(error.getMessage());
        }
    }
}
