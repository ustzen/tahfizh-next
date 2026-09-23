import { LandingHeader } from "@/components/landing/landing-header";
import { LandingFooter } from "@/components/landing/landing-footer";
import {
  DashboardPreview,
  Faq,
  Features,
  FinalCta,
  Hero,
  HowItWorks,
  SecurityAndFree,
  TargetUsers,
} from "@/components/landing/sections";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <LandingHeader />
      <main>
        <Hero />
        <DashboardPreview />
        <Features />
        <TargetUsers />
        <HowItWorks />
        <SecurityAndFree />
        <Faq />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  );
}
