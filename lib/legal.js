// The Privacy & Terms document, supplied by KastoChha.
//
// It is deliberately ONE document rather than two: it covers data handling and
// the rules of using the platform together, and is titled that way. Both
// /privacy and /terms render it, because the footer links to both and the
// consent gate every new account passes links to both (see lib/terms.js).
// /terms points its canonical at /privacy so the pair isn't treated as
// duplicate content.
//
// Treat the strings below as the legal text of record: transcribe changes
// exactly as supplied, don't paraphrase, and update EFFECTIVE_DATE whenever the
// wording materially changes. Section 12 promises exactly that.

export const EFFECTIVE_DATE = "August, 2026";

// Renders a "this is an outline, not a policy" banner while true. The real copy
// is in, so it is off.
export const DRAFT = false;

export const LEGAL = {
  kicker: "Legal",
  title: "Privacy & Terms",
  lede:
    "Welcome to KastoChha (“KastoChha”, “we”, “our”, or “us”). Your privacy matters to us. This Privacy & Terms page explains how we collect, use, store, and protect your information, as well as the rules and responsibilities that apply when using the KastoChha platform, including our website, AI chatbot, community features, and related services.",
  intro: [
    "By accessing or using KastoChha, you agree to this Privacy & Terms policy."
  ],
  sections: [
    {
      heading: "1. Who We Are",
      blocks: [
        {
          type: "p",
          text:
            "KastoChha is a Nepal-based startup building Nepal's Curious Community Network - a platform where people can ask questions, share experiences, engage with AI, and participate in meaningful community discussions."
        }
      ]
    },
    {
      heading: "2. Information We Collect",
      blocks: [
        {
          type: "p",
          text:
            "Depending on how you use KastoChha, we may collect the following information."
        },
        { type: "h3", text: "Account Information" },
        { type: "p", text: "When you create an account, we may collect:" },
        {
          type: "ul",
          items: [
            "Name",
            "Username",
            "Email address",
            "Profile picture",
            "Login credentials or authentication through third-party providers"
          ]
        },
        { type: "h3", text: "Community Content" },
        {
          type: "p",
          text: "Information you choose to share on KastoChha, including:"
        },
        {
          type: "ul",
          items: [
            "Questions",
            "Experiences",
            "Posts",
            "Comments",
            "Replies",
            "Uploaded images or other supported media"
          ]
        },
        {
          type: "p",
          text: "Content you publish publicly may be visible to other users."
        },
        { type: "h3", text: "Usage Information" },
        {
          type: "p",
          text: "To improve our platform, we may automatically collect:"
        },
        {
          type: "ul",
          items: [
            "Device and browser information",
            "IP address",
            "Pages visited",
            "Features used",
            "Date and time of access",
            "General usage analytics"
          ]
        },
        { type: "h3", text: "Cookies" },
        {
          type: "p",
          text: "We may use cookies and similar technologies to:"
        },
        {
          type: "ul",
          items: [
            "Keep you signed in",
            "Remember your preferences",
            "Improve website performance",
            "Understand how KastoChha is used"
          ]
        },
        {
          type: "p",
          text:
            "You can manage cookies through your browser settings. Disabling cookies may affect certain features of the platform."
        }
      ]
    },
    {
      heading: "3. How We Use Your Information",
      blocks: [
        { type: "p", text: "We use your information to:" },
        {
          type: "ul",
          items: [
            "Provide and improve KastoChha",
            "Create and manage your account",
            "Enable community participation",
            "Deliver AI-powered responses",
            "Improve platform performance and user experience",
            "Detect spam, fraud, and abuse",
            "Respond to support requests",
            "Communicate important service updates",
            "Comply with applicable legal obligations"
          ]
        }
      ]
    },
    {
      heading: "4. AI & Community Content",
      blocks: [
        {
          type: "p",
          text:
            "KastoChha combines AI with community knowledge to help users discover honest and practical answers."
        },
        {
          type: "p",
          text:
            "AI-generated responses are intended for informational purposes only and may occasionally be inaccurate, incomplete, or outdated. They should not be considered professional legal, financial, medical, or other expert advice."
        },
        {
          type: "p",
          text:
            "Community posts, experiences, and opinions represent the views of individual users and do not necessarily reflect the views of KastoChha. Users should exercise their own judgment before making important decisions based on AI-generated or community-generated content."
        },
        {
          type: "p",
          text:
            "As our community grows, publicly shared experiences may help improve the quality and relevance of future AI responses."
        }
      ]
    },
    {
      heading: "5. Sharing Your Information",
      blocks: [
        {
          type: "p",
          text:
            "We do not sell or rent your personal information to third parties."
        },
        {
          type: "p",
          text:
            "We may use anonymized and aggregated platform data, such as trends, popular topics, or community interests, to improve KastoChha, publish insights, or help businesses and organizations better understand what people are curious about. This information does not identify individual users."
        },
        {
          type: "p",
          text:
            "We may share limited information with trusted third-party service providers that help us operate KastoChha, including hosting, authentication, analytics, and AI infrastructure providers."
        },
        {
          type: "p",
          text:
            "We may also disclose information when required by law or when necessary to protect the rights, safety, and security of our users, our platform, or the public."
        }
      ]
    },
    {
      heading: "6. Community Content",
      blocks: [
        {
          type: "p",
          text: "You retain ownership of the content you publish on KastoChha."
        },
        {
          type: "p",
          text:
            "By posting content on our platform, you grant KastoChha a non-exclusive, worldwide, royalty-free license to host, display, distribute, reproduce, and use your content for operating, improving, promoting, and developing the platform."
        },
        {
          type: "p",
          text:
            "You are responsible for ensuring that the content you publish does not violate the rights of others or applicable laws."
        }
      ]
    },
    {
      heading: "7. User Responsibilities",
      blocks: [
        { type: "p", text: "By using KastoChha, you agree to:" },
        {
          type: "ul",
          items: [
            "Provide accurate account information.",
            "Respect other members of the community.",
            "Share genuine experiences and opinions.",
            "Publish only content that you have the right to share.",
            "Avoid posting illegal, abusive, hateful, misleading, fraudulent, or spam content.",
            "Avoid impersonating others or creating fake accounts.",
            "Use KastoChha in accordance with applicable laws."
          ]
        },
        {
          type: "p",
          text:
            "We reserve the right to remove content, restrict features, suspend, or permanently terminate accounts that violate these guidelines."
        }
      ]
    },
    {
      heading: "8. Data Security",
      blocks: [
        {
          type: "p",
          text:
            "We take reasonable technical and organizational measures to protect your information against unauthorized access, misuse, loss, or disclosure."
        },
        {
          type: "p",
          text:
            "However, no online service can guarantee absolute security, and you use the platform at your own risk."
        }
      ]
    },
    {
      heading: "9. Data Retention",
      blocks: [
        {
          type: "p",
          text: "We retain your information only for as long as necessary to:"
        },
        {
          type: "ul",
          items: [
            "Provide our services",
            "Comply with legal obligations",
            "Resolve disputes",
            "Enforce our policies",
            "Improve the platform"
          ]
        },
        {
          type: "p",
          text:
            "When information is no longer required, we will delete or anonymize it where reasonably possible."
        }
      ]
    },
    {
      heading: "10. Your Rights",
      blocks: [
        {
          type: "p",
          text: "Depending on applicable laws, you may have the right to:"
        },
        {
          type: "ul",
          items: [
            "Access your personal information",
            "Update or correct your information",
            "Request deletion of your account or personal data",
            "Contact us regarding privacy concerns"
          ]
        },
        {
          type: "p",
          text:
            "Certain information may be retained where required by law or for legitimate operational purposes."
        }
      ]
    },
    {
      heading: "11. Children's Privacy",
      blocks: [
        {
          type: "p",
          text: "KastoChha is not intended for children under the age of 13."
        },
        {
          type: "p",
          text:
            "We do not knowingly collect personal information from children under 13. If we become aware that such information has been collected, we will take reasonable steps to remove it."
        }
      ]
    },
    {
      heading: "12. Changes to This Policy",
      blocks: [
        {
          type: "p",
          text:
            "We may update this Privacy & Terms page from time to time to reflect changes to our platform, technology, or legal requirements."
        },
        {
          type: "p",
          text:
            "When significant changes are made, we will update the Effective Date and, where appropriate, notify users through the platform."
        },
        {
          type: "p",
          text:
            "Your continued use of KastoChha after any updates constitutes your acceptance of the revised policy."
        }
      ]
    }
  ]
};
