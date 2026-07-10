import type { Metadata } from 'next';
import { LegalDocument } from '@/components/legal/LegalDocument';

export const metadata: Metadata = {
  title: 'Privacy Policy | Estimate.ai',
  description: 'How Estimate.ai collects, uses, and protects personal and project information.',
};

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Privacy Policy"
      effectiveDate="July 9, 2026"
      introduction="This policy explains how Estimate.ai handles account information, construction documents, project data, and service usage information."
      sections={[
        {
          title: '1. Information we collect',
          items: [
            'Account data such as name, email address, authentication identifiers, role, and company membership.',
            'Project data such as customer names, addresses, plans, measurements, annotations, material selections, pricing, estimates, and exports.',
            'Technical data such as browser information, IP address, device and session data, feature usage, errors, and security events.',
            'Support communications and any information you choose to include in them.',
          ],
        },
        {
          title: '2. How we use information',
          items: [
            'Provide, secure, troubleshoot, and improve the estimating service.',
            'Process plans, create takeoffs and estimates, and generate requested documents.',
            'Authenticate users and enforce organization-level permissions.',
            'Communicate about projects, support, security, billing, and material service changes.',
            'Comply with law and protect customers, Estimate.ai, and the public from misuse or harm.',
          ],
        },
        {
          title: '3. Service providers',
          paragraphs: [
            'We use infrastructure and processing providers to operate the service, including hosting, database, storage, workflow automation, document intelligence, and AI providers. These providers process information under their service terms and only for the functions we request. Current categories include Vercel, Supabase, Railway, n8n, Anthropic, and Microsoft Azure.',
          ],
        },
        {
          title: '4. How we share information',
          paragraphs: [
            'We do not sell personal information. We may share information with authorized members of your organization, service providers, a successor in a corporate transaction, or authorities when legally required. We may also share information at your direction, such as when you export or send an estimate.',
          ],
        },
        {
          title: '5. Retention and deletion',
          paragraphs: [
            'We retain information while an account is active and as reasonably needed to provide the service, maintain security and audit records, resolve disputes, and meet legal obligations. Account owners may request deletion or export. Some information may remain temporarily in protected backups or where retention is legally required.',
          ],
        },
        {
          title: '6. Security',
          paragraphs: [
            'We use access controls, encryption in transit, tenant isolation, private document storage, logging, and other safeguards designed to protect customer information. Security is a shared responsibility: use strong credentials, limit account access, and avoid uploading information that is not needed for estimating.',
          ],
        },
        {
          title: '7. Your choices and rights',
          paragraphs: [
            'Depending on location, you may have rights to access, correct, delete, restrict, or obtain a copy of personal information. Organization administrators may manage much of this information within the service. We may need to verify identity and authority before completing a request.',
          ],
        },
        {
          title: '8. Children and international processing',
          paragraphs: [
            'The service is intended for business users and is not directed to children. Information may be processed in the United States and other locations where our providers operate, subject to applicable contractual and legal safeguards.',
          ],
        },
        {
          title: '9. Contact and updates',
          paragraphs: [
            'We may update this policy as the service changes. Material updates will be communicated through the service or by email. Privacy questions and rights requests can be sent to privacy@estimate.ai.',
          ],
        },
      ]}
    />
  );
}
