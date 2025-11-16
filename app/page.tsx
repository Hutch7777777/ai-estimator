import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Zap, CheckCircle2 } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <main className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-center space-y-8 text-center">
          {/* Logo/Brand */}
          <div className="space-y-4">
            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl md:text-6xl">
              AI Construction Estimator
            </h1>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground sm:text-xl">
              Transform HOVER measurement PDFs into professional Excel takeoffs in minutes.
              Built for Exterior Finishes contractors.
            </p>
          </div>

          {/* CTA Button */}
          <div className="flex flex-col gap-4 sm:flex-row">
            <Button asChild size="lg" className="text-base">
              <Link href="/project/new">
                Start New Project
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="text-base">
              <Link href="#how-it-works">
                Learn More
              </Link>
            </Button>
          </div>

          {/* Key Metric */}
          <div className="rounded-lg bg-primary/10 px-6 py-3">
            <p className="text-sm font-medium text-primary">
              <Zap className="mr-2 inline-block h-4 w-4" />
              Reduce estimation time from 45 minutes to 5 minutes
            </p>
          </div>
        </div>

        {/* Features Section */}
        <div id="how-it-works" className="mt-24 scroll-mt-16">
          <h2 className="mb-12 text-center text-3xl font-bold tracking-tight text-foreground">
            How It Works
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            <Card>
              <CardHeader>
                <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <FileText className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>1. Upload HOVER PDF</CardTitle>
                <CardDescription>
                  Upload your HOVER measurement report with all the project details
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <CheckCircle2 className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>2. Configure Products</CardTitle>
                <CardDescription>
                  Select your James Hardie products, colors, and accessories from our catalog
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <Zap className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>3. Download Excel Takeoff</CardTitle>
                <CardDescription>
                  Get a professional Excel workbook with quantities, pricing, and line items
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>

        {/* Benefits Section */}
        <div className="mt-24">
          <Card className="border-2">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Perfect for Siding Contractors</CardTitle>
              <CardDescription className="text-base">
                Designed specifically for James Hardie siding installations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-1 h-5 w-5 flex-shrink-0 text-primary" />
                  <div>
                    <p className="font-medium">Database-Driven Configuration</p>
                    <p className="text-sm text-muted-foreground">
                      No hardcoded products - easily update your catalog
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-1 h-5 w-5 flex-shrink-0 text-primary" />
                  <div>
                    <p className="font-medium">Multi-Trade Support</p>
                    <p className="text-sm text-muted-foreground">
                      Siding, roofing, windows, and gutters
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-1 h-5 w-5 flex-shrink-0 text-primary" />
                  <div>
                    <p className="font-medium">Professional Output</p>
                    <p className="text-sm text-muted-foreground">
                      Excel workbooks ready for client presentation
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-1 h-5 w-5 flex-shrink-0 text-primary" />
                  <div>
                    <p className="font-medium">89% Time Savings</p>
                    <p className="text-sm text-muted-foreground">
                      From 45 minutes down to just 5 minutes
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Final CTA */}
        <div className="mt-24 text-center">
          <h2 className="mb-4 text-3xl font-bold tracking-tight text-foreground">
            Ready to streamline your estimates?
          </h2>
          <p className="mb-8 text-lg text-muted-foreground">
            Start your first project in less than a minute
          </p>
          <Button asChild size="lg" className="text-base">
            <Link href="/project/new">
              Start New Project
            </Link>
          </Button>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="container mx-auto px-4 py-8 text-center text-sm text-muted-foreground">
          <p>&copy; 2024 AI Construction Estimator. Built for Exterior Finishes.</p>
        </div>
      </footer>
    </div>
  );
}
