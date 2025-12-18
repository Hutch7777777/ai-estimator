import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/logo";
import { FileText, Zap, CheckCircle2, ArrowRight, Sparkles, Database, Layers, TrendingUp } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen scroll-smooth">
      {/* Hero Section with Animated Gradient Background */}
      <div className="relative overflow-hidden gradient-bg-hero">
        {/* Dot Pattern Overlay */}
        <div className="absolute inset-0 dot-pattern opacity-50" />

        {/* Gradient Orbs */}
        <div className="absolute top-0 -left-4 w-72 h-72 bg-primary/30 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-float" />
        <div className="absolute top-0 -right-4 w-72 h-72 bg-chart-3/30 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-float" style={{ animationDelay: '1s' }} />
        <div className="absolute -bottom-8 left-20 w-72 h-72 bg-chart-4/30 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-float" style={{ animationDelay: '2s' }} />

        <main className="container relative mx-auto px-4 py-20 sm:px-6 lg:px-8 sm:py-32">
          <div className="flex flex-col items-center justify-center space-y-10 text-center">
            {/* Logo */}
            <div className="animate-scale-in">
              <Logo size="lg" className="scale-150 sm:scale-[2]" />
            </div>

            {/* Hero Title */}
            <div className="space-y-6 animate-fade-in-up">
              <h1 className="text-5xl font-bold tracking-tight sm:text-6xl md:text-7xl lg:text-8xl font-heading">
                <span className="block">Transform HOVER PDFs into</span>
                <span className="block gradient-text mt-2">Professional Takeoffs</span>
              </h1>
              <p className="mx-auto max-w-3xl text-xl text-muted-foreground sm:text-2xl leading-relaxed">
                Transform HOVER measurement PDFs into professional Excel takeoffs in minutes.
                <span className="block mt-2 font-semibold text-foreground">Built for Exterior Finishes contractors.</span>
              </p>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col gap-4 sm:flex-row animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
              <Button
                asChild
                size="lg"
                className="text-lg px-8 py-6 gradient-bg-primary text-primary-foreground shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105"
              >
                <Link href="/project">
                  Start New Project
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="text-lg px-8 py-6 border-2 hover:border-primary/50 hover:bg-primary/5 transition-all duration-300"
              >
                <Link href="#how-it-works">
                  Learn More
                </Link>
              </Button>
            </div>

            {/* Key Metric with Glass Effect */}
            <div className="glass rounded-2xl px-8 py-4 animate-fade-in-up shadow-xl" style={{ animationDelay: '0.4s' }}>
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-primary/20 p-2">
                  <Zap className="h-6 w-6 text-primary" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-muted-foreground">Average Time Savings</p>
                  <p className="text-2xl font-bold gradient-text">45 min → 5 min</p>
                </div>
              </div>
            </div>

            {/* Trust Indicators */}
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground animate-fade-in-up" style={{ animationDelay: '0.6s' }}>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-brand-500" />
                <span>No credit card required</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-brand-500" />
                <span>89% time savings</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-brand-500" />
                <span>Professional output</span>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-24 sm:py-32 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4 px-4 py-1">
              Simple Process
            </Badge>
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4 font-heading">
              How It Works
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Three simple steps to generate professional estimates
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3 max-w-6xl mx-auto">
            {/* Step 1 */}
            <Card className="hover-lift border-2 relative overflow-hidden group rounded-xl shadow-soft">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-500" />
              <CardHeader className="relative">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl gradient-bg-primary shadow-lg">
                    <FileText className="h-8 w-8 text-primary-foreground" />
                  </div>
                  <Badge className="text-2xl font-bold bg-primary/10 text-primary border-none px-4 py-2">01</Badge>
                </div>
                <CardTitle className="text-2xl mb-2 font-heading">Upload HOVER PDF</CardTitle>
                <CardDescription className="text-base">
                  Upload your HOVER measurement report with all the project details and measurements
                </CardDescription>
              </CardHeader>
            </Card>

            {/* Step 2 */}
            <Card className="hover-lift border-2 relative overflow-hidden group rounded-xl shadow-soft">
              <div className="absolute top-0 right-0 w-32 h-32 bg-chart-3/5 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-500" />
              <CardHeader className="relative">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-chart-3 to-chart-4 shadow-lg">
                    <Layers className="h-8 w-8 text-white" />
                  </div>
                  <Badge className="text-2xl font-bold bg-chart-3/10 text-chart-3 border-none px-4 py-2">02</Badge>
                </div>
                <CardTitle className="text-2xl mb-2 font-heading">Configure Products</CardTitle>
                <CardDescription className="text-base">
                  Select your James Hardie products, colors, and accessories from our comprehensive catalog
                </CardDescription>
              </CardHeader>
            </Card>

            {/* Step 3 */}
            <Card className="hover-lift border-2 relative overflow-hidden group rounded-xl shadow-soft">
              <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/5 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-500" />
              <CardHeader className="relative">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 shadow-lg">
                    <Zap className="h-8 w-8 text-white" />
                  </div>
                  <Badge className="text-2xl font-bold bg-brand-500/10 text-brand-600 border-none px-4 py-2">03</Badge>
                </div>
                <CardTitle className="text-2xl mb-2 font-heading">Download Excel Takeoff</CardTitle>
                <CardDescription className="text-base">
                  Get a professional Excel workbook with detailed quantities, pricing, and line items
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* Benefits Section with Split Background */}
      <section className="py-24 sm:py-32 relative overflow-hidden">
        {/* Split gradient background */}
        <div className="absolute inset-0 bg-gradient-to-r from-muted/50 to-background" />
        <div className="absolute inset-0 dot-pattern opacity-30" />

        <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <Card className="border-2 shadow-2xl overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-2 gradient-bg-primary" />
              <CardHeader className="text-center pb-12 pt-12">
                <Badge variant="outline" className="mb-4 px-4 py-1 mx-auto">
                  Enterprise Features
                </Badge>
                <CardTitle className="text-4xl sm:text-5xl font-bold mb-4 font-heading">
                  Perfect for Siding Contractors
                </CardTitle>
                <CardDescription className="text-xl max-w-2xl mx-auto">
                  Designed specifically for James Hardie siding installations with professional-grade features
                </CardDescription>
              </CardHeader>
              <CardContent className="pb-12">
                <div className="grid gap-8 md:grid-cols-2">
                  {/* Benefit 1 */}
                  <div className="flex items-start gap-4 p-6 rounded-xl bg-muted/50 hover:bg-muted transition-colors">
                    <div className="flex-shrink-0 rounded-xl bg-gradient-to-br from-primary to-chart-3 p-3 shadow-lg">
                      <Database className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg mb-2 font-heading">Database-Driven Configuration</h3>
                      <p className="text-muted-foreground">
                        No hardcoded products - easily update your catalog and pricing without touching code
                      </p>
                    </div>
                  </div>

                  {/* Benefit 2 */}
                  <div className="flex items-start gap-4 p-6 rounded-xl bg-muted/50 hover:bg-muted transition-colors">
                    <div className="flex-shrink-0 rounded-xl bg-gradient-to-br from-chart-3 to-chart-4 p-3 shadow-lg">
                      <Layers className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg mb-2 font-heading">Multi-Trade Support</h3>
                      <p className="text-muted-foreground">
                        Handle siding, roofing, windows, and gutters all in one comprehensive platform
                      </p>
                    </div>
                  </div>

                  {/* Benefit 3 */}
                  <div className="flex items-start gap-4 p-6 rounded-xl bg-muted/50 hover:bg-muted transition-colors">
                    <div className="flex-shrink-0 rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 p-3 shadow-lg">
                      <FileText className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg mb-2 font-heading">Professional Output</h3>
                      <p className="text-muted-foreground">
                        Generate Excel workbooks that are ready for immediate client presentation
                      </p>
                    </div>
                  </div>

                  {/* Benefit 4 */}
                  <div className="flex items-start gap-4 p-6 rounded-xl bg-muted/50 hover:bg-muted transition-colors">
                    <div className="flex-shrink-0 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 p-3 shadow-lg">
                      <TrendingUp className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg mb-2 font-heading">89% Time Savings</h3>
                      <p className="text-muted-foreground">
                        Reduce estimation time from 45 minutes down to just 5 minutes per project
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Final CTA Section with Bold Gradient */}
      <section className="relative py-24 sm:py-32 overflow-hidden">
        <div className="absolute inset-0 gradient-bg-primary animate-gradient opacity-90" />
        <div className="absolute inset-0 dot-pattern opacity-20" />

        <div className="container relative mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="max-w-4xl mx-auto space-y-8">
            <Badge className="glass border-white/20 text-white px-4 py-1.5">
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              Get Started Today
            </Badge>

            <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white font-heading">
              Ready to streamline your estimates?
            </h2>

            <p className="text-xl sm:text-2xl text-white/90 max-w-2xl mx-auto">
              Start your first project in less than a minute. No credit card required.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Button
                asChild
                size="lg"
                variant="secondary"
                className="text-lg px-8 py-6 bg-white text-primary hover:bg-white/90 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105"
              >
                <Link href="/project">
                  Start New Project
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="text-lg px-8 py-6 border-2 border-white text-white hover:bg-white/10 transition-all duration-300"
              >
                <Link href="#how-it-works">
                  Learn More
                </Link>
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-8 pt-8 text-white/80">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">Free to start</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">Instant setup</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">Professional results</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Enhanced Footer */}
      <footer className="relative border-t">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent" />
        <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-8 md:grid-cols-3">
            {/* Brand */}
            <div>
              <Logo size="md" className="mb-4" />
              <p className="text-sm text-muted-foreground">
                Built for Exterior Finishes contractors to streamline estimating workflows.
              </p>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="font-semibold mb-3 font-heading">Quick Links</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link href="/project" className="hover:text-foreground transition-colors">
                    Start New Project
                  </Link>
                </li>
                <li>
                  <Link href="#how-it-works" className="hover:text-foreground transition-colors">
                    How It Works
                  </Link>
                </li>
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h4 className="font-semibold mb-3 font-heading">Support</h4>
              <p className="text-sm text-muted-foreground">
                Questions? Reach out to our support team for assistance.
              </p>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t text-center">
            <p className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} Estimate.ai. Built for Exterior Finishes.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
