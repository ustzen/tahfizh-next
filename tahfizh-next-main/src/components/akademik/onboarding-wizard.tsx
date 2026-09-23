"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, CircleDot, Clock, Loader2 } from "lucide-react";

import {
  completeOnboardingStepAction,
  skipOnboardingAction,
  finishOnboardingAction,
} from "@/app/actions/akademik";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export type OnboardingStep = {
  n: number;
  label: string;
  description: string;
  href: string | null;
  done: boolean;
};

/**
 * TAHFIZH V11 — Onboarding wizard (#17-#28). Every step can be skipped and
 * resumed later; progress is persisted server-side per tenant (#82).
 */
export function OnboardingWizard({
  steps,
  currentStep,
  completed,
  profileHref,
}: {
  steps: OnboardingStep[];
  currentStep: number;
  completed: boolean;
  profileHref: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const doneCount = steps.filter((s) => s.done).length;
  const progress = Math.round((doneCount / steps.length) * 100);

  const mark = (n: number) =>
    startTransition(async () => {
      await completeOnboardingStepAction(n);
      router.refresh();
    });

  const skip = () =>
    startTransition(async () => {
      await skipOnboardingAction();
      router.push(profileHref);
    });

  const finish = () =>
    startTransition(async () => {
      await finishOnboardingAction();
      router.push(profileHref);
    });

  return (
    <div className="space-y-6">
      {/* Welcome + progress */}
      <Card className="shadow-card overflow-hidden rounded-2xl border-0 bg-gradient-brand text-white">
        <CardContent className="px-6 py-8">
          <h2 className="text-2xl font-bold sm:text-3xl">Selamat Datang di TAHFIZH 👋</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/90">
            Selesaikan {steps.length} langkah berikut agar lembaga Anda siap digunakan. Setiap langkah
            dapat dilewati dan dilanjutkan kapan saja.
          </p>
          <div className="mt-5 max-w-xl">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span>
                {doneCount}/{steps.length} langkah selesai
              </span>
              <span>{progress}%</span>
            </div>
            <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-white/25">
              <div
                className="h-full rounded-full bg-white transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Steps */}
      <ol className="space-y-3">
        {steps.map((s) => (
          <li key={s.n}>
            <Card className={`shadow-card rounded-2xl transition-colors ${s.done ? "border-emerald-200 bg-emerald-50/40" : ""}`}>
              <CardContent className="flex flex-wrap items-center gap-4 px-5 py-4">
                <span
                  className={`flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${
                    s.done
                      ? "bg-emerald-500 text-white"
                      : s.n === currentStep + 1
                        ? "bg-gradient-brand text-white"
                        : "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
                  }`}
                >
                  {s.done ? <Check className="size-5" /> : s.n}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-foreground">
                      {s.n}. {s.label}
                    </h3>
                    {s.done ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                        <Check className="size-3" /> Selesai
                      </span>
                    ) : s.n === currentStep + 1 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-role-soft px-2 py-0.5 text-xs font-semibold text-role-strong">
                        <CircleDot className="size-3" /> Berikutnya
                      </span>
                    ) : null}
                  </div>
                  <p className="text-muted-foreground mt-0.5 text-sm">{s.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  {s.href && (
                    <Button asChild size="sm" variant={s.done ? "outline" : "default"} className={s.done ? "" : "bg-gradient-brand hover:opacity-90"}>
                      <Link href={s.href}>
                        {s.done ? "Buka" : "Atur Sekarang"} <ArrowRight className="size-3.5" />
                      </Link>
                    </Button>
                  )}
                  {!s.done && s.href && (
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => mark(s.n)}>
                      Tandai Selesai
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>

      {/* Footer actions (#27/#28) */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-role/15 bg-role-soft/50 px-5 py-4">
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Clock className="size-4" />
          Belum sempat? Lewati sekarang, lanjutkan kapan saja — progres tersimpan otomatis.
        </p>
        <div className="flex gap-2">
          {!completed && (
            <Button variant="outline" disabled={pending} onClick={skip}>
              {pending && <Loader2 className="size-4 animate-spin" />} Lewati untuk Sekarang
            </Button>
          )}
          <Button disabled={pending} onClick={finish} className="bg-gradient-brand hover:opacity-90">
            {pending && <Loader2 className="size-4 animate-spin" />}
            {completed ? "Masuk ke Dashboard" : "Selesaikan & Masuk Dashboard"}
          </Button>
        </div>
      </div>
    </div>
  );
}
