import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "@authenticator/ui";
import { mobileBridge } from "./mobile-bridge";
import { registerNativeLifecycleLocking } from "./native-lifecycle";

void registerNativeLifecycleLocking(mobileBridge);

const root = ReactDOM.createRoot(document.getElementById("app")!);
root.render(React.createElement(App, { bridge: mobileBridge }));
