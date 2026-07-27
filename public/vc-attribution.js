/*
 * VenderCRM first-touch attribution snippet (PLAN.md §5.1).
 *
 * Drop on every page of a connected site:
 *   <script src="https://YOUR-CRM/vc-attribution.js" defer></script>
 *
 * It stores the FIRST utm_* / gclid / fbclid the visitor ever arrived with in
 * a 90-day cookie and never overwrites it — so a lead that arrives via a
 * campaign today, browses, and converts next week is still credited to the
 * campaign that actually produced it.
 *
 * Read it on your server when posting to /api/v1/leads:
 *   JSON.parse(decodeURIComponent(cookies.vc_attr || "%7B%7D"))
 *
 * This is the ONLY client-side code VenderCRM ships. Pageview/scroll/funnel
 * analytics are deliberately not built here — self-host Umami for that.
 */
(function () {
  var COOKIE = "vc_attr";
  var DAYS = 90;

  function readCookie(name) {
    var match = document.cookie.match(new RegExp("(^|; )" + name + "=([^;]*)"));
    return match ? decodeURIComponent(match[2]) : null;
  }

  // First touch wins: if we already recorded one, do nothing at all.
  if (readCookie(COOKIE)) return;

  var params = new URLSearchParams(window.location.search);
  var keys = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "gclid",
    "fbclid",
  ];

  var attribution = {};
  var found = false;
  for (var i = 0; i < keys.length; i++) {
    var value = params.get(keys[i]);
    if (value) {
      attribution[keys[i]] = value.slice(0, 200);
      found = true;
    }
  }

  // Direct/organic visits still get a record, so referrer and landing page
  // are available even with no campaign tagging.
  attribution.landing_page = window.location.href.slice(0, 2000);
  if (document.referrer) attribution.referrer = document.referrer.slice(0, 2000);
  if (!found && !document.referrer) attribution.utm_source = "direct";

  var expires = new Date(Date.now() + DAYS * 864e5).toUTCString();
  document.cookie =
    COOKIE +
    "=" +
    encodeURIComponent(JSON.stringify(attribution)) +
    "; expires=" +
    expires +
    "; path=/; SameSite=Lax";
})();
