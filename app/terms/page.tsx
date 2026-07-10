import type { Metadata } from 'next';
import { LegalDocument } from '@/components/legal/LegalDocument';

export const metadata: Metadata = {
  title: 'Terms of Service | Estimate.ai',
  description: 'Terms governing use of the Estimate.ai construction estimating service.',
};

export default function TermsPage() {
  return (
    <LegalDocument
      title="Terms of Service"
      effectiveDate="July 9, 2026"
      introduction="These Terms of Service govern access to Estimate.ai. By creating an account or using the service, you agree to these terms on behalf of yourself and, when applicable, your company."
      sections={[
        {
          title: '1. The service',
          paragraphs: [
            'Estimate.ai provides tools that assist construction professionals with plan review, quantity takeoffs, pricing, and estimate exports. Features may use automated document analysis and artificial intelligence.',
          ],
        },
        {
          title: '2. Professional verification is required',
          paragraphs: [
            'Outputs are estimates and decision-support materials, not architectural, engineering, legal, code-compliance, or financial advice. You are responsible for checking drawings, field conditions, quantities, specifications, pricing, labor assumptions, taxes, waste, and contract terms before relying on or sending an estimate.',
          ],
        },
        {
          title: '3. Accounts and authorized use',
          items: [
            'Provide accurate account and company information and keep credentials secure.',
            'Use the service only for projects and documents you are authorized to process.',
            'Do not probe, disrupt, reverse engineer, scrape, or bypass access and usage controls.',
            'Notify us promptly if you suspect unauthorized account access.',
          ],
        },
        {
          title: '4. Your content',
          paragraphs: [
            'You retain ownership of plans, project information, pricing, annotations, and other material you submit. You grant Estimate.ai a limited right to host and process that content only as needed to operate, secure, support, and improve the service. You represent that you have the rights needed to submit the content.',
          ],
        },
        {
          title: '5. Fees and service changes',
          paragraphs: [
            'Paid features, limits, renewal terms, and taxes will be shown in an order form or checkout before charges apply. We may change or discontinue features, but will provide reasonable notice when a material change affects an active paid service.',
          ],
        },
        {
          title: '6. Confidentiality and security',
          paragraphs: [
            'Each party will protect the other party’s non-public information using reasonable care. No online service is risk-free. You are responsible for deciding whether the service is appropriate for particularly sensitive, regulated, export-controlled, or classified information.',
          ],
        },
        {
          title: '7. Suspension and termination',
          paragraphs: [
            'You may stop using the service at any time. We may suspend access when reasonably necessary to prevent harm, address nonpayment, investigate abuse, or comply with law. On request and subject to legal and backup-retention requirements, we will provide a reasonable process to export or delete account content.',
          ],
        },
        {
          title: '8. Disclaimers and liability',
          paragraphs: [
            'The service is provided on an “as available” basis. To the maximum extent permitted by law, Estimate.ai disclaims implied warranties and is not responsible for indirect, incidental, special, consequential, or lost-profit damages. Any aggregate liability will not exceed fees paid for the service during the twelve months before the event giving rise to the claim.',
          ],
        },
        {
          title: '9. Governing terms',
          paragraphs: [
            'An executed order form or written service agreement controls if it conflicts with these online terms. If any provision is unenforceable, the remaining provisions continue in effect. These terms may be updated prospectively, with notice for material changes.',
          ],
        },
      ]}
    />
  );
}
