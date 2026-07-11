import { getLocale } from "next-intl/server";
import { getTypedMessages } from "@/i18n/get-typed-messages";
import type { Locale } from "@/i18n/config";
import LandingHeader from "@/components/landing/header";
import LandingHero from "@/components/landing/hero";
import NumbersStrip from "@/components/landing/numbers-strip";
import HowItWorksSection from "@/components/landing/how-it-works-section";
import EngineSection from "@/components/landing/engine-section";
import WhoItsForSection from "@/components/landing/who-its-for-section";
import DataSourcesSection from "@/components/landing/data-sources-section";
import SecuritySection from "@/components/landing/security-section";
import FaqSection from "@/components/landing/faq-section";
import AccessSection from "@/components/landing/access-section";
import LandingFooter from "@/components/landing/footer";
import { RevealScript } from "@/components/landing/reveal-script";

export default async function Home() {
  const m = await getTypedMessages();
  const locale = (await getLocale()) as Locale;
  return (
    <>
      <LandingHeader t={m.header} locale={locale} />
      <LandingHero hero={m.hero} tbl={m.compareTable} />
      <NumbersStrip items={m.numbersStrip} />
      <HowItWorksSection t={m.howItWorks} />
      <EngineSection t={m.engine} />
      <WhoItsForSection t={m.whoItsFor} />
      <DataSourcesSection t={m.dataSources} />
      <SecuritySection t={m.security} />
      <FaqSection t={m.faq} />
      <AccessSection t={m.access} />
      <LandingFooter t={m.footer} />
      <RevealScript />
    </>
  );
}
