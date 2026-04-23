import { execFile } from "node:child_process";

function runSecurityCommand(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("security", args, { encoding: "utf8" }, (error, stdout, stderr) => {
      if (error) {
        const message = stderr?.trim() || error.message;
        reject(new Error(message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

export async function saveMacKeychainSecret(label: string, secretBase64: string): Promise<void> {
  await runSecurityCommand(["add-generic-password", "-U", "-a", label, "-s", label, "-w", secretBase64]);
}

export async function readMacKeychainSecret(label: string): Promise<string> {
  return runSecurityCommand(["find-generic-password", "-a", label, "-s", label, "-w"]);
}

export async function deleteMacKeychainSecret(label: string): Promise<void> {
  await runSecurityCommand(["delete-generic-password", "-a", label, "-s", label]);
}
