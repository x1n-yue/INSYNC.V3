import { withTimeout } from "./requests";

export const recoveryMessage = "If this address is eligible, an email has been requested. Check your inbox and spam folder before trying again.";
export function authRedirect(recovery = false, location = window.location) {
  const url = new URL(location.pathname, location.origin);
  if (recovery) url.searchParams.set("flow", "recovery");
  return url.href;
}
export async function requestAccountEmail(client, kind, email) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new Error("Enter a valid email address.");
  const response = await withTimeout(kind === "reset"
    ? client.auth.resetPasswordForEmail(email.trim(), { redirectTo: authRedirect(true) })
    : client.auth.resend({ type: "signup", email: email.trim(), options: { emailRedirectTo: authRedirect() } }), "The email request timed out. Check your inbox before requesting again.");
  if (response.error) throw new Error(response.error.status === 429 ? "Too many requests. Wait before requesting another email." : "The email request could not be completed. Wait and retry.");
  return recoveryMessage;
}
