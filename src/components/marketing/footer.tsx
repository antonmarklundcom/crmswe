import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CRM_LOGIN_URL, contact, siteConfig, telHref } from "@/lib/site-config";
import { CookieSettingsLink } from "./cookie-consent";

export async function MarketingFooter() {
  const t = await getTranslations("marketing");
  const tel = telHref();

  // Every contact row is conditional on site-config: while a detail is a TODO
  // it is absent from the footer rather than rendered as a placeholder.
  const contactRows: Array<{ key: string; node: React.ReactNode }> = [];
  if (tel && contact.phoneDisplay) {
    contactRows.push({
      key: "phone",
      node: (
        <a href={tel} data-ev="call_click" data-ev-loc="footer">
          {contact.phoneDisplay}
        </a>
      ),
    });
  }
  if (contact.email) {
    contactRows.push({
      key: "email",
      node: <a href={`mailto:${contact.email}`}>{contact.email}</a>,
    });
  }
  if (contact.address) {
    contactRows.push({ key: "address", node: <span>{contact.address}</span> });
  }

  return (
    <footer className="mk-footer mk-grain">
      <div className="mk-wrap">
        <div className="mk-footer__grid">
          <div>
            <Link href="/" className="mk-wordmark" style={{ color: "inherit" }}>
              CRM<span>Swe</span>
            </Link>
            <p style={{ marginTop: "1rem", color: "inherit", opacity: 0.85 }}>
              {t("footer.tagline")}
            </p>
          </div>

          <div>
            <p style={{ color: "inherit", fontWeight: 500 }}>{t("footer.siteTitle")}</p>
            <ul className="mk-footer__list">
              <li>
                <Link href="/sa-funkar-det">{t("nav.saFunkarDet")}</Link>
              </li>
              <li>
                <Link href="/om-oss">{t("nav.omOss")}</Link>
              </li>
              <li>
                <Link href="/kontakt">{t("nav.kontakt")}</Link>
              </li>
            </ul>
          </div>

          <div>
            <p style={{ color: "inherit", fontWeight: 500 }}>{t("footer.contactTitle")}</p>
            <ul className="mk-footer__list">
              {contactRows.map((row) => (
                <li key={row.key}>{row.node}</li>
              ))}
              <li>
                {t("footer.loginNote")}{" "}
                <a href={CRM_LOGIN_URL} rel="nofollow">
                  {t("nav.login")}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mk-footer__bottom">
          <span>
            {new Date().getFullYear()} {siteConfig.name}. {t("footer.rights")}
          </span>
          <span>
            <CookieSettingsLink label={t("cookie.settingsLabel")} />
          </span>
        </div>
      </div>
    </footer>
  );
}
