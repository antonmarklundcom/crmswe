"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { CRM_URL } from "@/lib/site-config";

// GDPR-granular consent (plan.md §6.2): two categories, "necessary" always on
// and never asked about, "analytics" (first-touch attribution + the click
// shim) unchecked by default and only ever on after an explicit choice —
// never pre-ticked, never implied by continued browsing. Stored client-side
// only (localStorage), so there is nothing to purge server-side and no
// personal data leaves the browser before consent exists.
const STORAGE_KEY = "mk_consent";
const OPEN_EVENT = "mk-open-consent";

type Consent = { analytics: boolean };

function readConsent(): Consent | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Consent>;
    return { analytics: parsed.analytics === true };
  } catch {
    // Blocked storage (private mode, a locked-down browser) degrades to
    // "ask every visit" rather than throwing — the banner just reappears.
    return null;
  }
}

function writeConsent(consent: Consent) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
  } catch {
    // Nothing to persist to — the choice still applies for this page view.
  }
  window.dispatchEvent(new CustomEvent<Consent>("mk-consent", { detail: consent }));
}

export type CookieConsentCopy = {
  body: string;
  necessaryLabel: string;
  analyticsLabel: string;
  saveLabel: string;
  acceptAllLabel: string;
  settingsLabel: string;
};

/**
 * The banner. Shows once (no stored decision), and again whenever
 * `MarketingFooter`'s "cookie settings" link dispatches `mk-open-consent` —
 * the one way a visitor can revisit their choice after the fact.
 */
export function CookieConsentBanner({ copy }: { copy: CookieConsentCopy }) {
  const [visible, setVisible] = useState(false);
  const [analytics, setAnalytics] = useState(false);

  useEffect(() => {
    if (readConsent() === null) setVisible(true);

    function reopen() {
      setAnalytics(readConsent()?.analytics ?? false);
      setVisible(true);
    }
    window.addEventListener(OPEN_EVENT, reopen);
    return () => window.removeEventListener(OPEN_EVENT, reopen);
  }, []);

  if (!visible) return null;

  function save(nextAnalytics: boolean) {
    writeConsent({ analytics: nextAnalytics });
    setVisible(false);
  }

  return (
    <div className="mk-consent" role="dialog" aria-modal="false" aria-label={copy.body}>
      <p>{copy.body}</p>

      <label className="mk-consent__option">
        <input type="checkbox" checked disabled aria-readonly="true" />
        <span>{copy.necessaryLabel}</span>
      </label>

      <label className="mk-consent__option">
        <input
          type="checkbox"
          checked={analytics}
          onChange={(e) => setAnalytics(e.target.checked)}
        />
        <span>{copy.analyticsLabel}</span>
      </label>

      <div className="mk-consent__actions">
        <button
          type="button"
          className="mk-btn mk-btn--ghost"
          onClick={() => save(analytics)}
          data-ev="consent_save"
        >
          {copy.saveLabel}
        </button>
        <button
          type="button"
          className="mk-btn mk-btn--primary"
          onClick={() => save(true)}
          data-ev="consent_accept_all"
        >
          {copy.acceptAllLabel}
        </button>
      </div>
    </div>
  );
}

/** Reopens the banner. Rendered in the footer on every marketing page. */
export function CookieSettingsLink({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="mk-consent-settings"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
    >
      {label}
    </button>
  );
}

/**
 * The two non-essential scripts (first-touch attribution, the analytics
 * click shim) load only once `analytics` consent is on — checked on mount
 * and re-checked on every `mk-consent` change, so accepting mid-visit loads
 * them immediately rather than waiting for the next page.
 */
export function ConsentGatedScripts() {
  const [analytics, setAnalytics] = useState(false);

  useEffect(() => {
    setAnalytics(readConsent()?.analytics ?? false);

    function onConsent(e: Event) {
      setAnalytics((e as CustomEvent<Consent>).detail.analytics);
    }
    window.addEventListener("mk-consent", onConsent);
    return () => window.removeEventListener("mk-consent", onConsent);
  }, []);

  if (!analytics) return null;

  return (
    <>
      {/* First-touch attribution: stores the first utm / gclid / fbclid the
          visitor ever arrived with in a 90-day cookie, read server-side by
          the contact action. Without it every lead looks like direct
          traffic. Non-essential under GDPR — gated on consent. */}
      <Script src={`${CRM_URL}/vc-attribution.js`} strategy="afterInteractive" />
      {/* Analytics shim: ~350 bytes, loads nothing, pushes every data-ev
          click into dataLayer so GA4/GTM/Plausible can be switched on later
          with one paste and no markup changes. Also non-essential. */}
      <Script id="mk-analytics-shim" strategy="afterInteractive">
        {`(function(){window.dataLayer=window.dataLayer||[];document.addEventListener('click',function(e){var t=e.target.closest&&e.target.closest('[data-ev]');if(!t)return;window.dataLayer.push({event:t.dataset.ev,ev_loc:t.dataset.evLoc||'',page_path:location.pathname,site:location.hostname});},true);})();`}
      </Script>
    </>
  );
}
