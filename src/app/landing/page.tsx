import LandingHero from "@/components/landing/hero";
import ProblemSection from "@/components/landing/problem-section";
import ProductPreview from "@/components/landing/product-preview";
import PricingSection from "@/components/landing/pricing-section";
import CTASection from "@/components/landing/cta-section";

export default function LandingPage() {
  return (
    <main>
      <LandingHero />
      <ProblemSection />
      <ProductPreview />
      <PricingSection />
      <CTASection />
    </main>
  );
}
