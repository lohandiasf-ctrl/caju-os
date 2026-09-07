export type DesktopNotificationKind =
  | "new-ticket"
  | "spare"
  | "schedule"
  | "field-check"
  | "sos"
  | "removed-ticket"
  | "operational"
  | "message"
  | "call";

let permissionRequested = false;

function isTauri() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function appInBackground() {
  return typeof document !== "undefined" && (document.hidden || !document.hasFocus());
}

/** Sends the same operational event to the native desktop and browser toast layers. */
export async function notifyDesktop({
  title,
  body,
  tag,
  kind,
  requireInteraction = false,
}: {
  title: string;
  body: string;
  tag: string;
  kind: DesktopNotificationKind;
  requireInteraction?: boolean;
}) {
  if (typeof window === "undefined") return;
  try {
    if (isTauri()) {
      const notification = await import("@tauri-apps/plugin-notification");
      let allowed = await notification.isPermissionGranted();
      if (!allowed && !permissionRequested) {
        permissionRequested = true;
        allowed = (await notification.requestPermission()) === "granted";
      }
      if (allowed) {
        await notification.sendNotification({
          title,
          body,
          group: `caju-${kind}`,
          extra: { tag, kind },
          autoCancel: !requireInteraction,
        });
      }
      return;
    }
    if (!("Notification" in window)) return;
    if (Notification.permission === "default" && !permissionRequested) {
      permissionRequested = true;
      await Notification.requestPermission();
    }
    if (Notification.permission === "granted") {
      const toast = new Notification(title, {
        body,
        tag,
        requireInteraction,
      });
      toast.onclick = () => {
        window.focus();
        window.dispatchEvent(new CustomEvent("caju-notification-click", { detail: { kind, tag } }));
        toast.close();
      };
    }
  } catch {
    // In-app alert remains the fallback when OS permission is unavailable.
  }
}
