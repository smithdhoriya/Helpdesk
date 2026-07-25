import { prisma } from "../src/db";
import { TicketCategory, TicketStatus } from "../src/generated/client/enums";

interface DemoTicket {
  subject: string;
  body: string;
  senderEmail: string;
  category: TicketCategory | null;
  status: TicketStatus;
  daysAgo: number;
}

const technicalQuestions: Omit<DemoTicket, "category">[] = [
  {
    subject: "Can't log in after password reset",
    body: "I reset my password an hour ago but the login page just spins and never redirects to the dashboard. Tried Chrome and Safari, same result on both.",
    senderEmail: "jmartinez@acmecorp.com",
    status: TicketStatus.open,
    daysAgo: 1,
  },
  {
    subject: "Mobile app crashes when opening attachments",
    body: "Every time I tap a PDF attachment on a ticket in the iOS app it crashes back to the home screen. Happens on both my iPhone 14 and my colleague's iPhone 13.",
    senderEmail: "priya.nair@globex.com",
    status: TicketStatus.open,
    daysAgo: 3,
  },
  {
    subject: "API returning 500 on /v1/tickets endpoint",
    body: "We started getting intermittent 500s from the tickets list endpoint around 9am UTC today. Roughly 1 in 10 requests fail. Here's a sample request ID: 8f3a-92cd.",
    senderEmail: "devops@initech.io",
    status: TicketStatus.open,
    daysAgo: 0,
  },
  {
    subject: "Sync with Slack stopped working",
    body: "Our Slack integration hasn't posted a new-ticket notification in 2 days. I reauthorized the app but it didn't help. Channel is #support-alerts.",
    senderEmail: "ops@brightwave.io",
    status: TicketStatus.resolved,
    daysAgo: 14,
  },
  {
    subject: "Two-factor authentication codes not arriving",
    body: "I haven't received an SMS code in the last three login attempts. Phone number on file is correct and I have signal. Can you resend or disable 2FA temporarily?",
    senderEmail: "d.oconnor@fieldstone-law.com",
    status: TicketStatus.closed,
    daysAgo: 40,
  },
  {
    subject: "Bulk export times out for large ticket counts",
    body: "Exporting anything over ~5000 tickets to CSV just hangs at 'Preparing export...' forever. Works fine under 1000. We have about 40k tickets in our account.",
    senderEmail: "m.chen@northgate-retail.com",
    status: TicketStatus.open,
    daysAgo: 6,
  },
  {
    subject: "Webhook payload missing 'category' field",
    body: "The inbound-email webhook payload we receive on our end no longer includes the ticket category since last week's update. Is this expected or a regression?",
    senderEmail: "api-team@vantel.dev",
    status: TicketStatus.resolved,
    daysAgo: 21,
  },
  {
    subject: "Dashboard graphs not loading in Firefox",
    body: "The ticket volume chart on the dashboard just shows a blank white box in Firefox 128. Works fine in Chrome and Edge. Console shows a canvas rendering error.",
    senderEmail: "s.abara@lumen-consulting.com",
    status: TicketStatus.open,
    daysAgo: 2,
  },
  {
    subject: "Search is returning stale results",
    body: "When I search for a ticket by subject it sometimes shows tickets that were deleted last month. Refreshing the page doesn't fix it, only a hard reload does.",
    senderEmail: "helpdesk@rivermill.org",
    status: TicketStatus.open,
    daysAgo: 5,
  },
  {
    subject: "SSO login loop with Okta",
    body: "Since setting up Okta SSO this morning, users get bounced back to the Okta login screen in an infinite loop after authenticating. SAML response looks valid on our end.",
    senderEmail: "it-admin@parallax-media.com",
    status: TicketStatus.open,
    daysAgo: 0,
  },
  {
    subject: "File upload stuck at 99%",
    body: "Uploading a 12MB screenshot to a ticket reply gets stuck at 99% and never completes. Smaller files under 2MB upload fine.",
    senderEmail: "rgomez@stonebridge.co",
    status: TicketStatus.resolved,
    daysAgo: 18,
  },
  {
    subject: "Email replies not threading into the same ticket",
    body: "When customers reply to our support emails, a brand new ticket gets created instead of the reply being added to the original thread. Started happening after the domain migration.",
    senderEmail: "support-lead@thornfield.io",
    status: TicketStatus.closed,
    daysAgo: 55,
  },
  {
    subject: "Timezone shown incorrectly on ticket timestamps",
    body: "All ticket 'created' times are showing in UTC even though my profile is set to America/Chicago. Was correct until the last release.",
    senderEmail: "kwilson@harbor-analytics.com",
    status: TicketStatus.open,
    daysAgo: 4,
  },
  {
    subject: "Rate limit errors on webhook retries",
    body: "We're seeing 429 responses when your system retries our webhook endpoint after a timeout. Could you space out retries more or let us configure the backoff?",
    senderEmail: "eng@copperline.dev",
    status: TicketStatus.open,
    daysAgo: 8,
  },
  {
    subject: "Dark mode toggle resets on every page load",
    body: "I switch to dark mode, navigate to a ticket, and it's back to light mode. This is on the latest Chrome, cookies are enabled.",
    senderEmail: "a.fontaine@willowbrook.net",
    status: TicketStatus.resolved,
    daysAgo: 30,
  },
  {
    subject: "Assigned tickets not showing in 'My Tickets'",
    body: "I assigned three tickets to myself yesterday but they don't show up under 'My Tickets', only under the full list. Other agents report the same.",
    senderEmail: "l.hoffman@brightwave.io",
    status: TicketStatus.open,
    daysAgo: 1,
  },
  {
    subject: "Custom domain email not receiving inbound tickets",
    body: "We pointed support@ourcompany.com at your MX records three days ago per the setup guide but no tickets are being created from emails sent there.",
    senderEmail: "postmaster@ourcompany.com",
    status: TicketStatus.open,
    daysAgo: 3,
  },
  {
    subject: "Ticket detail page 404s intermittently",
    body: "About 1 in 20 times I click into a ticket from the list, I get a 404 page instead of the ticket detail. Reloading the URL usually fixes it.",
    senderEmail: "qa@stonebridge.co",
    status: TicketStatus.closed,
    daysAgo: 62,
  },
  {
    subject: "Attachments larger than 25MB rejected silently",
    body: "When I try to attach a 30MB screen recording, the upload just disappears with no error message. Would be great to at least surface a size-limit warning.",
    senderEmail: "video@northgate-retail.com",
    status: TicketStatus.open,
    daysAgo: 7,
  },
  {
    subject: "Keyboard shortcuts stopped working after update",
    body: "The 'j/k' navigation shortcuts and 'e' to resolve a ticket no longer respond since yesterday's release. No JS errors in the console.",
    senderEmail: "power-user@vantel.dev",
    status: TicketStatus.open,
    daysAgo: 2,
  },
  {
    subject: "Notifications not showing unread count badge",
    body: "The little red badge on the notifications bell hasn't updated in two days even though I have several unread ticket mentions.",
    senderEmail: "l.hoffman@brightwave.io",
    status: TicketStatus.open,
    daysAgo: 2,
  },
  {
    subject: "CSV import fails silently for special characters",
    body: "Importing a ticket list with accented characters (é, ñ) in the subject lines just fails with no error message and nothing gets imported.",
    senderEmail: "data@northgate-retail.com",
    status: TicketStatus.open,
    daysAgo: 10,
  },
  {
    subject: "Ticket merge feature duplicating comments",
    body: "When I merge two duplicate tickets, all the comments from the secondary ticket end up appearing twice in the merged thread.",
    senderEmail: "qa@stonebridge.co",
    status: TicketStatus.resolved,
    daysAgo: 24,
  },
  {
    subject: "Can't reorder columns in the tickets table",
    body: "I tried dragging the 'Category' column before 'Status' in the tickets table but it snaps back to the original order every time.",
    senderEmail: "s.abara@lumen-consulting.com",
    status: TicketStatus.open,
    daysAgo: 13,
  },
  {
    subject: "Session expires too quickly on shared computers",
    body: "On our front-desk shared PC, the session logs out after about 5 minutes of inactivity, much shorter than on personal laptops. Is there a per-device setting?",
    senderEmail: "frontdesk@rivermill.org",
    status: TicketStatus.closed,
    daysAgo: 58,
  },
  {
    subject: "Broken image icons in ticket attachments preview",
    body: "Image attachments show a broken-image icon in the preview pane, but downloading the file directly works fine and the image opens correctly.",
    senderEmail: "design@willowbrook.net",
    status: TicketStatus.open,
    daysAgo: 4,
  },
  {
    subject: "Zapier integration missing 'ticket updated' trigger",
    body: "Your Zapier app only has 'ticket created' and 'ticket resolved' as triggers. We need a general 'ticket updated' trigger for our internal automations.",
    senderEmail: "automation@copperline.dev",
    status: TicketStatus.open,
    daysAgo: 16,
  },
  {
    subject: "Autosave losing draft replies on tab switch",
    body: "If I start typing a reply and switch to another browser tab for a minute, my draft is gone when I come back. Would love autosave here.",
    senderEmail: "d.oconnor@fieldstone-law.com",
    status: TicketStatus.resolved,
    daysAgo: 20,
  },
  {
    subject: "Print view cuts off long ticket threads",
    body: "When printing a ticket with more than ~15 replies, the print preview only shows the first page worth of comments and cuts off the rest.",
    senderEmail: "legal@fieldstone-law.com",
    status: TicketStatus.closed,
    daysAgo: 80,
  },
  {
    subject: "Custom domain SSL certificate warning in browser",
    body: "Since pointing support.ourcompany.com at your platform, visitors get a 'connection not private' warning. Certificate seems to be missing or expired.",
    senderEmail: "it@rivermill.org",
    status: TicketStatus.open,
    daysAgo: 1,
  },
  {
    subject: "Slow page load when ticket has 200+ replies",
    body: "One of our long-running support threads has over 200 replies and now takes 15+ seconds to open. Everything else loads normally.",
    senderEmail: "eng@copperline.dev",
    status: TicketStatus.open,
    daysAgo: 9,
  },
  {
    subject: "Bulk status update only applies to first 50 selected",
    body: "I selected all 120 tickets on a filtered view and clicked 'Mark as resolved', but only the first 50 actually changed status.",
    senderEmail: "m.chen@northgate-retail.com",
    status: TicketStatus.resolved,
    daysAgo: 12,
  },
];

const generalQuestions: Omit<DemoTicket, "category">[] = [
  {
    subject: "How do I add a teammate as an agent?",
    body: "We just hired a new support rep and I can't find where to invite her as an agent rather than an admin. Is there a docs page for this?",
    senderEmail: "ops-manager@fieldstone-law.com",
    status: TicketStatus.resolved,
    daysAgo: 25,
  },
  {
    subject: "What's included in the annual plan vs monthly?",
    body: "Considering switching from monthly to annual billing. Does the annual plan include the analytics add-on, or is that still separate?",
    senderEmail: "finance@harbor-analytics.com",
    status: TicketStatus.closed,
    daysAgo: 70,
  },
  {
    subject: "Is there a way to customize the ticket status names?",
    body: "We'd like 'closed' to read as 'Archived' for our team's workflow. Is that a setting somewhere, or would that require a feature request?",
    senderEmail: "cs-lead@willowbrook.net",
    status: TicketStatus.open,
    daysAgo: 9,
  },
  {
    subject: "Do you offer a sandbox/staging environment?",
    body: "We'd like to test webhook integrations against a non-production account before going live. Is a sandbox available on our plan?",
    senderEmail: "eng-lead@copperline.dev",
    status: TicketStatus.open,
    daysAgo: 4,
  },
  {
    subject: "How long is ticket history retained?",
    body: "For compliance purposes I need to know how long resolved and closed tickets stay accessible before they're purged, if ever.",
    senderEmail: "compliance@parallax-media.com",
    status: TicketStatus.resolved,
    daysAgo: 33,
  },
  {
    subject: "Can agents see internal notes customers can't see?",
    body: "Is there a private-notes feature for agents to leave context on a ticket that the requester won't see in their email thread?",
    senderEmail: "team-lead@lumen-consulting.com",
    status: TicketStatus.closed,
    daysAgo: 88,
  },
  {
    subject: "Where can I download an invoice for last month?",
    body: "Need last month's invoice for our expense report. I can't find a billing history page under account settings.",
    senderEmail: "accounting@thornfield.io",
    status: TicketStatus.open,
    daysAgo: 2,
  },
  {
    subject: "What browsers are officially supported?",
    body: "Our IT policy requires us to confirm official browser support before rolling this out company-wide. Is there a documented compatibility list?",
    senderEmail: "it@rivermill.org",
    status: TicketStatus.resolved,
    daysAgo: 45,
  },
  {
    subject: "Can I change my account's primary email address?",
    body: "I need to update the primary email on our workspace from my old personal address to our new support@ alias. What's the process?",
    senderEmail: "j.ferreira@stonebridge.co",
    status: TicketStatus.closed,
    daysAgo: 100,
  },
  {
    subject: "Is there a public status page for outages?",
    body: "We'd like to link a status page for your service on our own status page. Does one exist that we can subscribe to?",
    senderEmail: "sre@vantel.dev",
    status: TicketStatus.open,
    daysAgo: 1,
  },
  {
    subject: "How do permissions work for the 'agent' role?",
    body: "Trying to understand exactly what an agent can and can't do versus an admin before I finish setting up our team's roles.",
    senderEmail: "hr@northgate-retail.com",
    status: TicketStatus.resolved,
    daysAgo: 15,
  },
  {
    subject: "Do you support custom fields on tickets?",
    body: "We'd like to track an 'order number' field on every ticket tied to our e-commerce orders. Is a custom field feature available or planned?",
    senderEmail: "product@brightwave.io",
    status: TicketStatus.open,
    daysAgo: 11,
  },
  {
    subject: "Question about GDPR data processing agreement",
    body: "Our legal team needs a signed DPA before we can go live with EU customer data. Who do I contact to get that in motion?",
    senderEmail: "legal@fieldstone-law.com",
    status: TicketStatus.open,
    daysAgo: 6,
  },
  {
    subject: "Can tickets be tagged with multiple categories?",
    body: "Some of our tickets are both a billing question and a technical issue. Right now it seems like only one category can be set at a time — is that correct?",
    senderEmail: "ops@harbor-analytics.com",
    status: TicketStatus.resolved,
    daysAgo: 27,
  },
  {
    subject: "How do I set up a custom email signature for replies?",
    body: "When agents reply to tickets, we'd like our support signature (logo + phone number) to be appended automatically. Is that configurable?",
    senderEmail: "marketing@willowbrook.net",
    status: TicketStatus.closed,
    daysAgo: 120,
  },
  {
    subject: "What happens to open tickets if we downgrade our plan?",
    body: "We're considering downgrading from the team plan to the starter plan. Will existing open tickets and history be preserved?",
    senderEmail: "owner@copperline.dev",
    status: TicketStatus.open,
    daysAgo: 3,
  },
  {
    subject: "Recommended way to migrate tickets from Zendesk?",
    body: "We have about 15,000 historical tickets in Zendesk we'd like to bring over for reference. Is there an import tool or a recommended approach?",
    senderEmail: "migration@parallax-media.com",
    status: TicketStatus.open,
    daysAgo: 5,
  },
  {
    subject: "Do you have a REST API rate limit I should know about?",
    body: "Building an internal sync job against your API and want to make sure we stay under any rate limits before we scale it up.",
    senderEmail: "api-team@vantel.dev",
    status: TicketStatus.resolved,
    daysAgo: 31,
  },
  {
    subject: "Can we get a dedicated account manager on the enterprise plan?",
    body: "We're evaluating the enterprise tier for about 200 seats and our procurement team wants to know if a dedicated account manager is included.",
    senderEmail: "procurement@harbor-analytics.com",
    status: TicketStatus.open,
    daysAgo: 7,
  },
  {
    subject: "How do I transfer ownership of the workspace to someone else?",
    body: "I'm leaving the company and need to transfer workspace ownership to our new IT director before my account is deactivated next week.",
    senderEmail: "outgoing.admin@thornfield.io",
    status: TicketStatus.open,
    daysAgo: 3,
  },
  {
    subject: "Is there an audit log of admin actions?",
    body: "For our SOC 2 audit we need to show a log of who changed permissions and deleted tickets over the last quarter. Does this feature exist?",
    senderEmail: "compliance@parallax-media.com",
    status: TicketStatus.resolved,
    daysAgo: 26,
  },
  {
    subject: "Can we restrict login to our corporate VPN only?",
    body: "Our security team wants all logins to this tool restricted to our office IP range or VPN. Is IP allowlisting available on any plan?",
    senderEmail: "security@parallax-media.com",
    status: TicketStatus.open,
    daysAgo: 14,
  },
  {
    subject: "What's the SLA for your paid support plans?",
    body: "Before upgrading, I want to confirm the guaranteed first-response time for priority tickets on the business plan versus the free tier.",
    senderEmail: "ops-manager@fieldstone-law.com",
    status: TicketStatus.closed,
    daysAgo: 66,
  },
  {
    subject: "Do you support single sign-on with Google Workspace?",
    body: "We're a Google Workspace shop and would prefer 'Sign in with Google' over setting up a separate SAML SSO integration. Is that supported?",
    senderEmail: "it-admin@parallax-media.com",
    status: TicketStatus.open,
    daysAgo: 6,
  },
  {
    subject: "How do we get onboarding training for new agents?",
    body: "We're onboarding four new support agents next week and would love a walkthrough session or recorded training if one's available.",
    senderEmail: "hr@northgate-retail.com",
    status: TicketStatus.resolved,
    daysAgo: 38,
  },
  {
    subject: "Can ticket categories be renamed to match our terminology?",
    body: "We'd like 'Refund Request' to read as 'Billing Dispute' to match how our finance team refers to these internally. Is that configurable?",
    senderEmail: "cs-lead@willowbrook.net",
    status: TicketStatus.open,
    daysAgo: 8,
  },
  {
    subject: "Is there a mobile app for iPad specifically?",
    body: "Our support team mostly works from iPads at the front counter. Does the iOS app have an optimized iPad layout, or is it just the phone UI scaled up?",
    senderEmail: "frontdesk@rivermill.org",
    status: TicketStatus.open,
    daysAgo: 2,
  },
];

const refundRequests: Omit<DemoTicket, "category">[] = [
  {
    subject: "Charged twice for October subscription",
    body: "I see two identical charges of $79.00 on my card statement dated October 3rd. Please refund the duplicate charge and confirm when it's processed.",
    senderEmail: "billing@lumen-consulting.com",
    status: TicketStatus.resolved,
    daysAgo: 28,
  },
  {
    subject: "Requesting refund after cancelling within trial period",
    body: "I cancelled my subscription on day 12 of the 14-day trial but was still charged $49. Can you please refund this since I was within the trial window?",
    senderEmail: "newuser2024@gmail.com",
    status: TicketStatus.open,
    daysAgo: 2,
  },
  {
    subject: "Refund for annual plan, downgraded after one month",
    body: "I paid for the annual plan upfront but need to switch to monthly due to budget changes. Can I get a prorated refund for the unused months?",
    senderEmail: "cfo@thornfield.io",
    status: TicketStatus.open,
    daysAgo: 4,
  },
  {
    subject: "Never received the service, want a full refund",
    body: "I signed up three weeks ago but was never able to get the account activated despite four emails to support. I'd like a full refund at this point.",
    senderEmail: "frustrated.customer@yahoo.com",
    status: TicketStatus.closed,
    daysAgo: 95,
  },
  {
    subject: "Refund request - accidentally purchased wrong plan",
    body: "I meant to buy the 5-seat plan but clicked the 50-seat enterprise plan by mistake. Can this be corrected and the difference refunded?",
    senderEmail: "office.manager@stonebridge.co",
    status: TicketStatus.resolved,
    daysAgo: 19,
  },
  {
    subject: "Requesting chargeback reversal - I did authorize this",
    body: "My bank flagged your charge as fraud and I disputed it by mistake, but I do recognize this subscription. Can we reverse the chargeback so my account isn't suspended?",
    senderEmail: "confused.user@outlook.com",
    status: TicketStatus.open,
    daysAgo: 1,
  },
  {
    subject: "Refund for add-on we never used",
    body: "We were auto-enrolled in the analytics add-on renewal but never actually used it this cycle. Requesting a refund for the $29 add-on charge.",
    senderEmail: "procurement@vantel.dev",
    status: TicketStatus.resolved,
    daysAgo: 40,
  },
  {
    subject: "Cancelled subscription still being charged",
    body: "I cancelled back in July but was just charged again for September. Please refund this charge and confirm the cancellation actually went through.",
    senderEmail: "m.delacroix@rivermill.org",
    status: TicketStatus.open,
    daysAgo: 0,
  },
  {
    subject: "Partial refund for service outage last week",
    body: "Given the 6-hour outage last Tuesday that affected our support queue, could you credit or refund a portion of this month's bill?",
    senderEmail: "ops-director@northgate-retail.com",
    status: TicketStatus.open,
    daysAgo: 5,
  },
  {
    subject: "Refund - switched to a competitor",
    body: "We've decided to go with a different vendor and would like to cancel and get a refund for the remaining 8 months on our annual contract.",
    senderEmail: "procurement@harbor-analytics.com",
    status: TicketStatus.closed,
    daysAgo: 75,
  },
  {
    subject: "Duplicate seat charge after re-inviting a teammate",
    body: "I removed and re-invited the same teammate and it looks like we got billed for an extra seat. Can you check and refund if that's the case?",
    senderEmail: "admin@brightwave.io",
    status: TicketStatus.resolved,
    daysAgo: 22,
  },
  {
    subject: "Requesting refund - card was charged after trial cancellation email",
    body: "I got a confirmation email that my trial was cancelled on the 1st, but my card was still charged on the 3rd. Please refund and double check the cancellation status.",
    senderEmail: "k.abernathy@fieldstone-law.com",
    status: TicketStatus.open,
    daysAgo: 3,
  },
  {
    subject: "Billed in wrong currency, requesting adjustment",
    body: "We were charged in USD instead of EUR as agreed in our contract, resulting in a higher amount. Requesting a refund of the difference.",
    senderEmail: "finance-eu@parallax-media.com",
    status: TicketStatus.open,
    daysAgo: 8,
  },
  {
    subject: "Refund requested due to missing promised feature",
    body: "We upgraded specifically for the SLA reporting feature mentioned on your pricing page, but it's not actually available yet. Requesting a refund of the upgrade cost.",
    senderEmail: "ops-director@northgate-retail.com",
    status: TicketStatus.open,
    daysAgo: 11,
  },
  {
    subject: "Overcharged after seat count auto-adjusted incorrectly",
    body: "Our seat count jumped from 12 to 20 automatically after a bulk invite that mostly failed. We were billed for 20 seats we never actually used.",
    senderEmail: "admin@brightwave.io",
    status: TicketStatus.resolved,
    daysAgo: 29,
  },
  {
    subject: "Refund for annual plan purchased by mistake during demo",
    body: "During a live demo call our rep accidentally submitted a real annual purchase instead of the trial. Please refund and set us up on the standard trial.",
    senderEmail: "cfo@thornfield.io",
    status: TicketStatus.closed,
    daysAgo: 90,
  },
  {
    subject: "Requesting refund - merger means we no longer need duplicate accounts",
    body: "Following a merger with another company we now have two paid accounts. Requesting a refund on one of them going forward as we consolidate.",
    senderEmail: "finance@harbor-analytics.com",
    status: TicketStatus.open,
    daysAgo: 15,
  },
  {
    subject: "Refund after downgrading mid-cycle wasn't prorated",
    body: "I downgraded from enterprise to team plan on the 10th but was still billed the full enterprise amount for the month with no prorated credit.",
    senderEmail: "billing@lumen-consulting.com",
    status: TicketStatus.resolved,
    daysAgo: 23,
  },
  {
    subject: "Card charged in error after failed cancellation attempt",
    body: "I tried to cancel three times through the billing page and kept getting an error, then got charged anyway. Please refund and confirm cancellation.",
    senderEmail: "m.delacroix@rivermill.org",
    status: TicketStatus.open,
    daysAgo: 1,
  },
  {
    subject: "Refund requested - promotional discount wasn't applied",
    body: "I used promo code LAUNCH25 at checkout but was charged the full price. Requesting a refund of the 25% discount amount.",
    senderEmail: "newuser2024@gmail.com",
    status: TicketStatus.open,
    daysAgo: 3,
  },
  {
    subject: "Requesting refund for setup fee, onboarding never completed",
    body: "We paid the one-time setup fee for white-glove onboarding six weeks ago but never got scheduled for a session. Requesting a refund of that fee.",
    senderEmail: "office.manager@stonebridge.co",
    status: TicketStatus.open,
    daysAgo: 17,
  },
  {
    subject: "Double billed due to a failed payment retry",
    body: "It looks like a failed payment was retried and then both the original and retry went through, charging us twice for August.",
    senderEmail: "accounting@thornfield.io",
    status: TicketStatus.resolved,
    daysAgo: 34,
  },
];

const uncategorizedTickets: Omit<DemoTicket, "category">[] = [
  {
    subject: "Great support experience last week",
    body: "Just wanted to say thanks to whoever helped me set up SSO last Tuesday, it was quick and painless. No action needed, just wanted to share the feedback.",
    senderEmail: "happy.customer@willowbrook.net",
    status: TicketStatus.closed,
    daysAgo: 10,
  },
  {
    subject: "Interested in a partnership / integration",
    body: "I run a small SaaS tool for freelancers and think there could be a good integration opportunity between our products. Who would be the right person to talk to?",
    senderEmail: "founder@copperline.dev",
    status: TicketStatus.open,
    daysAgo: 12,
  },
  {
    subject: "Following up on my ticket from last month",
    body: "Just checking in, haven't heard back on ticket about the export timeout issue in a couple weeks. Any update?",
    senderEmail: "m.chen@northgate-retail.com",
    status: TicketStatus.open,
    daysAgo: 1,
  },
  {
    subject: "Press inquiry - writing an article about helpdesk tools",
    body: "I'm a freelance writer working on a comparison piece about support ticketing platforms and would love to ask a few quick questions if someone has 15 minutes.",
    senderEmail: "writer@techjournal.example",
    status: TicketStatus.closed,
    daysAgo: 50,
  },
  {
    subject: "(no subject)",
    body: "hi is anyone there? i sent an email yesterday and nobody replied",
    senderEmail: "urgent.person@gmail.com",
    status: TicketStatus.open,
    daysAgo: 0,
  },
  {
    subject: "Job application - Customer Support Specialist",
    body: "I saw your job posting for a support specialist and I'm very interested. Attaching my resume, please let me know next steps.",
    senderEmail: "jobseeker88@yahoo.com",
    status: TicketStatus.closed,
    daysAgo: 65,
  },
  {
    subject: "Unsubscribe me from all emails",
    body: "Please remove me from your mailing list, I no longer use this product and keep getting notification emails.",
    senderEmail: "former.user@outlook.com",
    status: TicketStatus.resolved,
    daysAgo: 35,
  },
  {
    subject: "Testing - please ignore",
    body: "This is a test message from our monitoring system to confirm the inbound email pipeline is functioning. Please disregard.",
    senderEmail: "monitoring@vantel.dev",
    status: TicketStatus.closed,
    daysAgo: 48,
  },
  {
    subject: "Quick question before I sign up",
    body: "Hi, before committing to a paid plan I wanted to ask a couple things but I'm not sure this is the right inbox — is there a sales team I should contact instead?",
    senderEmail: "prospective@lumen-consulting.com",
    status: TicketStatus.open,
    daysAgo: 6,
  },
  {
    subject: "Feedback on the new dashboard redesign",
    body: "The new layout is a big improvement overall, though I do miss having the ticket count visible at a glance on the sidebar. Just some feedback, not urgent.",
    senderEmail: "s.abara@lumen-consulting.com",
    status: TicketStatus.open,
    daysAgo: 9,
  },
  {
    subject: "Is this the right place to report a security issue?",
    body: "I noticed something that might be a minor security concern with how session tokens are handled. Wasn't sure if this should go to a dedicated security contact instead.",
    senderEmail: "researcher@security-list.example",
    status: TicketStatus.resolved,
    daysAgo: 17,
  },
  {
    subject: "Re: Re: Re: Following up again",
    body: "This is my third email on this, forwarding the whole thread below in case it got lost. Would really appreciate a response this time.",
    senderEmail: "persistent@stonebridge.co",
    status: TicketStatus.open,
    daysAgo: 2,
  },
  {
    subject: "Thank you note for the migration help",
    body: "Wanted to send a note thanking the team for the extra help during our Zendesk migration last month, it went smoother than we expected.",
    senderEmail: "migration@parallax-media.com",
    status: TicketStatus.closed,
    daysAgo: 44,
  },
  {
    subject: "Question about your affiliate program",
    body: "I run a newsletter for support-ops professionals and I'm curious if you have an affiliate or referral program I could join.",
    senderEmail: "newsletter@supportops.example",
    status: TicketStatus.open,
    daysAgo: 19,
  },
  {
    subject: "Email bounced, resending in case it got lost",
    body: "I got a bounce notice on my last email to support so I'm resending this in case the original never reached you.",
    senderEmail: "k.abernathy@fieldstone-law.com",
    status: TicketStatus.resolved,
    daysAgo: 7,
  },
  {
    subject: "Conference speaking opportunity inquiry",
    body: "We're organizing a customer support conference next spring and would love to invite someone from your team to speak on a panel.",
    senderEmail: "events@supportops.example",
    status: TicketStatus.open,
    daysAgo: 22,
  },
  {
    subject: "Accessibility feedback on ticket list contrast",
    body: "The gray status badges on the ticket list are quite hard to read against the white background for low-vision users. Sharing as accessibility feedback.",
    senderEmail: "a11y@willowbrook.net",
    status: TicketStatus.open,
    daysAgo: 5,
  },
  {
    subject: "Out of office autoreply - ignore",
    body: "I am out of the office until Monday and will respond to your message when I return. For urgent issues please contact my manager.",
    senderEmail: "s.abara@lumen-consulting.com",
    status: TicketStatus.closed,
    daysAgo: 41,
  },
  {
    subject: "Checking if this address is still monitored",
    body: "Not sure if this inbox is actively monitored, sending a quick test message before I forward our real question to it.",
    senderEmail: "cautious@northgate-retail.com",
    status: TicketStatus.resolved,
    daysAgo: 52,
  },
];

function buildTickets(): DemoTicket[] {
  const withCategory = (
    list: Omit<DemoTicket, "category">[],
    category: TicketCategory | null,
  ): DemoTicket[] => list.map((ticket) => ({ ...ticket, category }));

  return [
    ...withCategory(technicalQuestions, TicketCategory.technicalQuestion),
    ...withCategory(generalQuestions, TicketCategory.generalQuestion),
    ...withCategory(refundRequests, TicketCategory.refundRequest),
    ...withCategory(uncategorizedTickets, null),
  ];
}

async function main() {
  const tickets = buildTickets();
  console.log(`Seeding ${tickets.length} demo tickets...`);

  const now = Date.now();
  let created = 0;

  for (const ticket of tickets) {
    const createdAt = new Date(now - ticket.daysAgo * 24 * 60 * 60 * 1000);

    await prisma.ticket.create({
      data: {
        subject: ticket.subject,
        body: ticket.body,
        senderEmail: ticket.senderEmail,
        status: ticket.status,
        category: ticket.category,
        createdAt,
        updatedAt: createdAt,
      },
    });
    created += 1;
  }

  console.log(`Created ${created} demo tickets.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
