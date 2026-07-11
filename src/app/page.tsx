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

export default function Home() {
  return (
    <>
      <LandingHeader />
      <LandingHero />
      <NumbersStrip />
      <HowItWorksSection />
      <EngineSection />
      <WhoItsForSection />
      <DataSourcesSection />
      <SecuritySection />
      <FaqSection />
      <AccessSection />
      <LandingFooter />
      <RevealScript />
    </>
  );
}
