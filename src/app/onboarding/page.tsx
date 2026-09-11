import Link from "next/link";
import { Lightbulb, ShieldCheck, Thermometer } from "lucide-react";

export default function OnboardingPage() {
  return (
    <main className="flex min-h-dvh flex-col justify-center gap-10 bg-background px-6 py-10 sm:mx-auto sm:max-w-sm">
      <div className="flex flex-col items-center gap-6 rounded-[2rem] bg-brand-gradient px-6 py-10 text-primary-foreground shadow-lg shadow-primary/20">
        <div className="flex gap-3">
          {[Lightbulb, Thermometer, ShieldCheck].map((Icon, i) => (
            <span
              key={i}
              className="flex size-12 items-center justify-center rounded-2xl bg-white/15"
            >
              <Icon className="size-5" />
            </span>
          ))}
        </div>
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-xl font-bold">Welcome to Smart Home</h1>
          <p className="text-sm text-white/85">
            Manage lighting, climate, curtains and security for every room
            from a single app.
          </p>
        </div>
      </div>

      <Link
        href="/login"
        className="flex h-12 items-center justify-center rounded-xl bg-brand-gradient text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20"
      >
        Get started
      </Link>
    </main>
  );
}
