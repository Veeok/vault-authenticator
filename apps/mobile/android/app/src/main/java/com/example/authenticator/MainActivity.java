package com.example.authenticator;

import android.os.Bundle;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // FLAG_SECURE: blocks screenshots and non-secure-display
        // capture per Android documentation. Always on for this
        // app - TOTP secrets require display protection
        // unconditionally. JS privacy-screen setting is a
        // separate UX hint and does not control this.
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        );
        super.onCreate(savedInstanceState);
        registerPlugin(VaultKeyPlugin.class);
    }
}
