import LandingHeader from "@/components/landing/header";
import LandingHero from "@/components/landing/hero";
import ProblemSection from "@/components/landing/problem-section";
import OperationalControlSection from "@/components/landing/operational-control-section";
import HowItWorksSection from "@/components/landing/how-it-works-section";
import DecisionEngineSection from "@/components/landing/decision-engine-section";
import WorkspaceSection from "@/components/landing/workspace-section";
import PricingSection from "@/components/landing/pricing-section";
import SecuritySection from "@/components/landing/security-section";
import CTASection from "@/components/landing/cta-section";
import LandingFooter from "@/components/landing/footer";

export default function Home() {
  return (
    <>
      <LandingHeader />
      <main>
        <LandingHero />
        <ProblemSection />
        <OperationalControlSection />
        <HowItWorksSection />
        <DecisionEngineSection />
        <WorkspaceSection />
        <PricingSection />
        <SecuritySection />
        <CTASection />
      </main>
      <LandingFooter />
    </>
  );
}
