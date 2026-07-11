import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { LOCALE_COOKIE, defaultLocale, locales, type Locale } from "./config";

/**
 * next-intl request config — cookie-driven locale detection.
 *
 * We read `locale` cookie set by the LocaleSwitcher on the client. If it's
 * missing or unknown, we fall back to the platform default (Ukrainian).
 * The locale + messages returned here are what NextIntlClientProvider in
 * the root layout consumes.
 */
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const raw = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale: Locale =
    raw && (locales as readonly string[]).includes(raw)
      ? (raw as Locale)
      : defaultLocale;

  const messages =
    locale === "en"
      ? (await import("../messages/en")).en
      : (await import("../messages/uk")).uk;

  return { locale, messages };
});
