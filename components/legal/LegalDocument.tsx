import Link from 'next/link';
import { Logo } from '@/components/logo';

interface LegalSection {
  title: string;
  paragraphs?: string[];
  items?: string[];
}

export function LegalDocument({
  title,
  effectiveDate,
  introduction,
  sections,
}: {
  title: string;
  effectiveDate: string;
  introduction: string;
  sections: LegalSection[];
}) {
  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-5 sm:px-6">
          <Link href="/" aria-label="Estimate.ai home">
            <Logo size="md" />
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/login" className="text-muted-foreground hover:text-foreground">
              Sign in
            </Link>
            <Link href="/signup" className="font-medium text-primary hover:underline">
              Request access
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
        <article className="rounded-2xl border bg-background p-6 shadow-sm sm:p-10">
          <p className="text-sm font-medium text-primary">Estimate.ai legal</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-3 text-sm text-muted-foreground">Effective {effectiveDate}</p>
          <p className="mt-8 leading-7 text-muted-foreground">{introduction}</p>

          <div className="mt-10 space-y-9">
            {sections.map((section) => (
              <section key={section.title}>
                <h2 className="text-xl font-semibold">{section.title}</h2>
                {section.paragraphs?.map((paragraph) => (
                  <p key={paragraph} className="mt-3 leading-7 text-muted-foreground">
                    {paragraph}
                  </p>
                ))}
                {section.items && (
                  <ul className="mt-3 list-disc space-y-2 pl-6 text-muted-foreground">
                    {section.items.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                )}
              </section>
            ))}
          </div>

          <div className="mt-12 border-t pt-6 text-sm text-muted-foreground">
            Questions about these terms can be sent to{' '}
            <a className="font-medium text-foreground hover:underline" href="mailto:legal@estimate.ai">
              legal@estimate.ai
            </a>.
          </div>
        </article>
      </main>
    </div>
  );
}
