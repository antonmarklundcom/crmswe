/*
 * VenderCRM chat widget embed (docs/SPEC-CHAT-WIDGET.md §1.2).
 *
 * Drop on every page of a connected site:
 *   <script src="https://YOUR-CRM/w.js" data-widget="wgt_01H..." defer></script>
 *
 * This file does three things and nothing else: draw a bubble, inject an
 * iframe served from the CRM's own origin on first open, and listen for the
 * iframe's postMessage to size and close it.
 *
 * Why an iframe rather than a CORS JSON API: every request the chat makes is
 * then SAME-ORIGIN, from our page to our API, so no Access-Control-Allow-Origin
 * header is added anywhere and the server-to-server-only rule that protects
 * /api/v1/leads stays exactly as strict as it was. It also keeps the host
 * page's CSS out of the chat and the chat's out of the host page.
 *
 * The `data-widget` key is PUBLIC by design — the same category as a
 * Turnstile site key. Nothing is authorised by holding it.
 *
 * This is the second and last piece of client-side code this project ships.
 */
(function () {
  var script = document.currentScript;
  if (!script) return;

  var key = script.getAttribute("data-widget");
  if (!key) return;

  var origin = new URL(script.src, window.location.href).origin;
  var side = script.getAttribute("data-position") === "left" ? "left" : "right";
  var color = script.getAttribute("data-color") || "#111827";
  var label = script.getAttribute("data-label") || "💬";

  var frame = null;
  var open = false;

  var bubble = document.createElement("button");
  bubble.type = "button";
  bubble.setAttribute("aria-label", "chat");
  bubble.textContent = label;
  bubble.style.cssText =
    "position:fixed;bottom:20px;" + side + ":20px;z-index:2147483000;" +
    "width:56px;height:56px;border-radius:9999px;border:0;cursor:pointer;" +
    "font-size:24px;line-height:1;color:#fff;background:" + color + ";" +
    "box-shadow:0 6px 24px rgba(0,0,0,.25)";

  function ensureFrame() {
    if (frame) return frame;
    frame = document.createElement("iframe");
    frame.src = origin + "/w/" + encodeURIComponent(key);
    frame.title = "chat";
    // The host page's UTM cookie lives on THEIR origin and is unreadable from
    // our iframe, so it is forwarded once here instead (first-touch
    // attribution, same cookie vc-attribution.js writes).
    try {
      var match = document.cookie.match(/(^|; )vc_attr=([^;]*)/);
      if (match) {
        frame.src += "?attr=" + encodeURIComponent(match[2]);
      }
    } catch {
      /* a blocked cookie jar is not a reason to have no chat */
    }
    frame.style.cssText =
      "position:fixed;bottom:88px;" + side + ":20px;z-index:2147483000;" +
      "width:380px;height:560px;max-width:calc(100vw - 32px);" +
      "max-height:calc(100vh - 120px);border:0;border-radius:16px;" +
      "box-shadow:0 12px 48px rgba(0,0,0,.25);display:none;background:#fff";
    document.body.appendChild(frame);
    return frame;
  }

  function toggle() {
    var element = ensureFrame();
    open = !open;
    element.style.display = open ? "block" : "none";
    if (open) {
      element.contentWindow.postMessage(
        { type: "vc-chat:page", url: window.location.href, referrer: document.referrer },
        origin,
      );
    }
  }

  bubble.addEventListener("click", toggle);

  window.addEventListener("message", function (event) {
    // Only our own iframe may drive this — an arbitrary page must not be able
    // to open or resize someone's chat.
    if (event.origin !== origin || !event.data) return;
    if (event.data.type === "vc-chat:close" && open) toggle();
    if (event.data.type === "vc-chat:height" && frame) {
      var height = Number(event.data.height);
      if (height > 0) frame.style.height = Math.min(height, 640) + "px";
    }
  });

  if (document.body) {
    document.body.appendChild(bubble);
  } else {
    document.addEventListener("DOMContentLoaded", function () {
      document.body.appendChild(bubble);
    });
  }
})();
