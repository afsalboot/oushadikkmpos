const details = new URLSearchParams(window.location.search);
const code = details.get("error") || "UNKNOWN";
document.getElementById("connection-error").textContent = code;
document.getElementById("app-version").textContent = details.get("version") || "Unknown";

let advice = "If the site opens in Chrome but this app still fails, send a photo of this screen so we can check the desktop connection.";
if (code.startsWith("ERR_CERT_") || code.startsWith("ERR_SSL_")) {
  advice = "Check Windows date, time and time zone. If they are correct, send this error code so we can check the secure connection.";
} else if (code.includes("PROXY") || code.includes("TUNNEL")) {
  advice = "Check this computer's proxy or VPN settings, or try a mobile hotspot, then reconnect.";
} else if (code === "ERR_NAME_NOT_RESOLVED" || code === "ERR_INTERNET_DISCONNECTED") {
  advice = "Try a mobile hotspot, then reconnect. If it still fails, send this error code.";
}
document.getElementById("connection-advice").textContent = advice;
