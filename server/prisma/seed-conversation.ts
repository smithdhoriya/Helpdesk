/**
 * Seed a single ticket with a long, alternating agent/customer conversation:
 * 20 replies, alternating starting with the agent, each at least 10 lines long.
 * Useful for exercising the ticket summarizer and the long-thread UI.
 *
 * Usage (run from server/):
 *   bun prisma/seed-conversation.ts [ticketId]
 *   TICKET_ID=<uuid> bun prisma/seed-conversation.ts
 *   RESET_REPLIES=1 bun prisma/seed-conversation.ts   # clear this ticket's replies first
 *
 * Ticket ids are UUIDs — there is no numeric "ticket 110". When no id is given,
 * the script targets the most recently created ticket and logs which one it picked.
 *
 * The customer side of the thread is authored by a per-ticket "customer" User
 * that is soft-deleted (`deletedAt` set), so it never appears in the agents
 * dropdown (GET /api/tickets/agents) or the admin Users list (GET /api/users),
 * both of which filter on `deletedAt: null`.
 */
import { randomUUID } from "node:crypto";

import { prisma } from "../src/db";
import { UserRole } from "../src/generated/client/enums";

const REPLY_COUNT = 20;
const MIN_LINES = 10;
const INTERVAL_MS = 20 * 60 * 1000; // 20 minutes between consecutive replies

/** Turn an email local-part into a readable display name, e.g. priya.nair -> "Priya Nair". */
function deriveName(email: string): string {
  const localPart = email.split("@")[0] ?? "";
  const words = localPart
    .split(/[.\-_+]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return words.join(" ") || "Customer";
}

function assertMinLines(label: string, body: string): void {
  const lineCount = body.split("\n").filter((line) => line.trim().length > 0).length;
  if (lineCount < MIN_LINES) {
    throw new Error(`${label} has only ${lineCount} lines; expected at least ${MIN_LINES}.`);
  }
}

async function resolveTicket() {
  const requested = process.env.TICKET_ID ?? process.argv[2];

  if (requested) {
    const ticket = await prisma.ticket.findUnique({ where: { id: requested } });
    if (!ticket) {
      throw new Error(
        `No ticket found with id "${requested}". Ticket ids are UUIDs — check GET /api/tickets or omit the id to target the newest ticket.`,
      );
    }
    return ticket;
  }

  const newest = await prisma.ticket.findFirst({ orderBy: { createdAt: "desc" } });
  if (!newest) {
    throw new Error("No tickets exist yet. Seed some first with `bun prisma/seed-demo-tickets.ts`.");
  }
  console.log(
    `No ticket id given — targeting the newest ticket: "${newest.subject}" (${newest.id}).`,
  );
  return newest;
}

/** Pick a real agent to author the agent side: the assignee, else an admin, else any active user. */
async function resolveAgent(assignedTo: string | null) {
  if (assignedTo) {
    const assignee = await prisma.user.findUnique({ where: { id: assignedTo } });
    if (assignee) return assignee;
  }

  const admin = await prisma.user.findFirst({
    where: { role: UserRole.admin, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
  if (admin) return admin;

  const anyUser = await prisma.user.findFirst({
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
  if (anyUser) return anyUser;

  throw new Error("No users found to author agent replies. Run `bun run db:seed` first.");
}

/**
 * Get (or create) the soft-deleted "customer" User for this ticket. Keyed by a
 * synthetic, namespaced email so it can never collide with — and never
 * soft-delete — a real Better Auth account.
 */
async function resolveCustomer(ticket: { id: string; senderEmail: string; senderName: string | null }) {
  const email = `customer+${ticket.id}@seed.helpdesk.local`;
  const name = ticket.senderName?.trim() || deriveName(ticket.senderEmail);

  return prisma.user.upsert({
    where: { email },
    update: { name, deletedAt: new Date() },
    create: {
      id: randomUUID(),
      email,
      name,
      emailVerified: false,
      role: UserRole.agent,
      deletedAt: new Date(),
    },
  });
}

function buildConversation(subject: string): { fromAgent: boolean; body: string }[] {
  const agentTurns: string[] = [
    `Hi, and thanks for reaching out about "${subject}".
I'm Sam from the Helpdesk support team and I'll be helping you with this.
First, I want to say sorry for the disruption this has caused you.
I've read through your message and I understand the issue you're describing.
To get to the bottom of it quickly, I have a few questions.
Could you tell me roughly when you first noticed the problem?
Does it happen every single time, or only intermittently?
Have you tried it from more than one device or browser?
If you saw any error message, a screenshot would be really helpful.
I'll keep this ticket open and stay on it until we have it resolved.
Talk soon,
Sam`,
    `Thanks for the details — that's genuinely useful.
The fact that it happens across devices tells me it isn't a local cache issue.
Before we escalate, let's rule out a couple of quick things.
1. Please try a hard refresh with Ctrl+Shift+R (Cmd+Shift+R on a Mac).
2. Then clear cookies for our domain and sign in again.
3. If you use browser extensions, try once in a private/incognito window.
These steps resolve a surprising number of cases like this one.
If it still fails afterward, that's genuinely helpful to know too.
When you test, please note the exact time you tried.
That lets me line your attempts up against our server logs.
I'll be standing by for your results.
Sam`,
    `Appreciate you trying all of that so thoroughly.
Since the basic steps didn't help, I'm escalating this internally.
I've opened an investigation ticket with our engineering team on your behalf.
To help them, could you capture one more piece of information?
When the error appears, please open your browser's developer console.
You can do that with F12, then click the "Console" tab.
Copy any red error lines you see there and paste them into a reply.
If you're comfortable, the "Network" tab showing the failed request helps too.
Don't worry if this is unfamiliar — a screenshot of the console is fine.
I know this is extra effort and I really appreciate your patience.
I'll update you the moment engineering has something.
Sam`,
    `This is exactly what engineering needed — thank you.
Those 500s on /api/tickets line up with an issue we just reproduced.
It looks like a recent change is choking on a specific set of records.
The good news is we've identified the likely cause already.
A permanent fix is being written and tested as we speak.
In the meantime, there is a workaround that should unblock your team.
If you filter the ticket list to a single status, the errors stop.
That avoids the code path that's currently misbehaving.
It's not elegant, but it should keep you moving until the fix ships.
Give that a try and let me know whether it holds up for you.
I'll keep this ticket updated with our progress.
Sam`,
    `That's helpful feedback, and the CSV detail is a great catch.
I've added the failing export to the engineering ticket so it's covered too.
Here's where things stand as of this morning.
The root cause is confirmed: a malformed value in a small number of records.
Engineering has a fix in code review right now.
Once it's approved, it goes to our staging environment for testing.
If staging looks clean, we aim to deploy to production tomorrow.
I want to be honest that dates can slip if testing surfaces anything.
I'll give you a firm heads-up before the deploy either way.
Thank you for your patience while we get this properly fixed.
I'll be in touch again soon with the next update.
Sam`,
    `Completely understand, and thank you for being so transparent.
I've flagged the CSV export as high priority given the dashboard impact.
Quick update: the fix passed code review a little while ago.
It's now deployed to our staging environment and under test.
Our QA team is specifically checking both the list view and the export.
Early results are promising — the 500s are gone in staging so far.
I re-ran your exact scenario there and the ticket list loaded cleanly.
The CSV export also completed without the error in staging.
Assuming testing stays green, we're on track for a production deploy tomorrow.
I'll message you here as soon as it's live so you can verify on your end.
Thanks again for hanging in there with us.
Sam`,
    `Great news — the fix is now live in production.
The deploy completed a few minutes ago with no downtime for users.
To answer your earlier question: no action is strictly required on your end.
That said, a single hard refresh (Ctrl+Shift+R) clears any stale page state.
There's no need to sign out and back in, and no cache clearing beyond that.
Could you and a colleague verify the full ticket list loads for you now?
Please also run the CSV export that had been failing for your dashboard.
If both work, your manager's daily report should populate again.
I've kept the engineering ticket open until you confirm on your side.
Take your time testing and let me know how it goes.
Fingers crossed this is behind us now.
Sam`,
    `Wonderful — I'm really glad the main issue is resolved for you.
Thanks for confirming across two machines and the export; that's thorough.
The slow-loading long threads are a separate, known performance item.
It isn't caused by yesterday's fix, so nothing regressed there.
We already have an improvement in progress to paginate long reply threads.
That should make even 200-reply tickets open almost instantly.
I've linked this ticket to that work so you're notified when it ships.
In the meantime, opening those threads will still work, just a touch slowly.
If any single thread becomes unusable, tell me and I'll prioritize it.
For now, the 500 errors and the export failure are both fully resolved.
Is there anything else about this issue I can help with before we wrap up?
Sam`,
    `Thanks — it's been a pleasure working through this with you.
Let me summarize where we landed so it's all in one place.
The ticket list and CSV export were failing with 500 errors.
The cause was a malformed value in a small number of records.
Engineering shipped a fix that's now live and verified on your side.
We've also added a safeguard so that class of bad data can't recur.
Separately, long reply threads load slowly; that's a known performance item.
An improvement to paginate those threads is already in progress.
I've linked this ticket to that work so you'll hear when it ships.
I'll leave this ticket open for a couple more days just in case.
If anything resurfaces, simply reply here and it'll come straight back to me.
Sam`,
    `You're very welcome — I'm glad your team is fully unblocked.
To answer your questions: yes, I'll post here when the thread fix ships.
It will also appear in our public changelog at the same time.
So you'll have both a note on this ticket and the changelog entry.
For proactive updates, we do have a status page you can subscribe to.
I've included the link in a private note along with how to add email alerts.
That will notify you of any incidents or scheduled maintenance in advance.
It's been genuinely great working with you on this one.
I'll go ahead and mark this ticket as resolved now.
It will stay searchable, and replying will reopen it if you ever need to.
Take care, and thanks again for your patience and great troubleshooting.
Sam`,
  ];

  const customerTurns: string[] = [
    `Hi Sam, thanks for the quick reply.
To answer your questions: I first noticed it yesterday morning around 9am.
It happens almost every time now, maybe nine times out of ten.
I've tried it on my work laptop and my phone, and both behave the same way.
I also asked a colleague to try and she ran into the exact same thing.
There is an error that flashes up briefly before the page reloads.
I managed to grab a screenshot and I'll attach it to this ticket.
We were completely fine on this until the end of last week.
This is starting to slow down our whole team.
Let me know what else you need from me.
Thanks,
Priya`,
    `Thanks Sam, I worked through your list carefully.
I did a hard refresh with Ctrl+Shift+R on both machines.
Then I cleared cookies for your domain and signed back in.
I also tried once in a fresh incognito window with no extensions.
Unfortunately the problem is still there in every case.
I tested at 10:12am and again at 10:20am this morning.
Each time the page tried to load and then threw the same error.
Incognito made no difference, so it doesn't look extension-related.
I'm noting the times as you asked so you can match the logs.
Happy to try anything else you can think of.
Fingers crossed your logs show something,
Priya`,
    `No problem, I got into the developer console like you described.
There are two red lines that show up right when it fails.
The first says "Failed to load resource: the server responded with 500".
The second mentions something about an "unexpected token in JSON".
I've pasted both of them below and attached a full screenshot.
The Network tab shows the failing request is to /api/tickets.
It's marked in red with a 500 status code every time it breaks.
The request that succeeds occasionally returns a 200 as expected.
Hopefully that gives your engineers something concrete to work with.
Please let me know if you need anything else captured.
Thanks again for staying on this,
Priya`,
    `Thanks, I passed the workaround along to the rest of the team.
Filtering by a single status does seem to stop the errors.
We can load the list and open individual tickets again, which is a relief.
It's a bit awkward because we normally work from the full unfiltered view.
A couple of people forgot and hit the error again out of habit.
But overall it's a workable stopgap for now.
One thing we noticed: exporting to CSV still fails the same way.
So the workaround helps the main view but not everything.
Do you have a rough idea of when the real fix will land?
We have a busy support week coming up and want to plan around it.
Appreciate you keeping us in the loop,
Priya`,
    `Thanks for laying out the timeline so clearly.
Tomorrow would be great if it holds, but I understand things can shift.
I do want to flag the impact on our side so you have the full picture.
Our team handles a few hundred customer tickets a day through your tool.
The workaround is keeping us afloat but it's slowing everyone down.
We've had to warn our own customers about slightly longer response times.
If the CSV export could be prioritized, that would help our reporting.
Our manager runs a daily export that feeds an executive dashboard.
That report has been blank for two days now, which is drawing attention.
I'm not trying to add pressure, just to be transparent about the stakes.
Really do appreciate how responsive you've been through all this,
Priya`,
    `That's genuinely great to hear, thank you.
It's reassuring to know both the list and the export passed in staging.
I'll let my team know a fix is close so they can stop worrying.
When it does go live tomorrow, is there anything we need to do?
For example, will we need to clear our cache or sign out and back in?
I want to send clear instructions to everyone so the rollout is smooth.
Also, should we expect any brief downtime during the deploy itself?
If so, I'll pick a quieter window to warn the team about.
No rush on these — just planning ahead on our side.
Thanks for turning this around so quickly.
Looking forward to the all-clear,
Priya`,
    `Thank you — I just tested and the main list loads perfectly now.
No more errors on the full unfiltered view, which is a huge relief.
My colleague confirmed the same on her machine after a hard refresh.
The CSV export also ran and produced a complete file this time.
Our manager's dashboard populated correctly on the next refresh.
So the core problem definitely appears to be fixed. Thank you!
There is one small thing I noticed while testing, though.
When a ticket has a very long reply thread, the page loads slowly.
It's not an error, just a few seconds of delay before it appears.
I'm not sure if that's related to this fix or a separate thing entirely.
Wanted to mention it in case it's useful,
Priya`,
    `Got it, thanks for explaining the long-thread slowness so clearly.
It's a relief to know that part is a separate, already-planned improvement.
And it's reassuring that nothing regressed from yesterday's fix.
I'll let the team know the delay on big threads is expected for now.
None of our current threads are long enough to be a real blocker.
So please don't prioritize it on our account just yet.
I think that genuinely covers everything on the original problem.
The 500 errors and the CSV export are both fully sorted on our side.
I really can't thank you enough for how you handled this.
No further questions from me on the main issue,
Priya`,
    `This summary is perfect, thank you for pulling it all together.
I've shared it with my team and our manager, who is very relieved.
Everyone is back on the full ticket view and the dashboard is green again.
I really appreciate how clearly you communicated at every step.
One last follow-up, if you don't mind: how will we know about the thread fix?
Will it show up in a changelog, or will you post an update on this ticket?
I'd like to let the team know when long threads get faster.
Also, is there a status page we can subscribe to for future incidents?
That would help us get ahead of any issues proactively.
No urgency on either question.
Thanks again for turning this around so quickly, Sam,
Priya`,
    `That all sounds perfect, thank you so much.
Knowing the thread fix will hit both this ticket and the changelog is ideal.
I've subscribed to the status page and added the email alerts you mentioned.
My whole team is back to normal and the executive dashboard is green again.
I passed your summary up the chain and it was very well received.
Honestly, this is the smoothest support experience we've had in a while.
You kept us informed at every step and the fix landed right on schedule.
I'm completely happy for you to mark this ticket as resolved.
If the long-thread slowness ever becomes a real blocker, I'll reply here.
Thanks again for all your help and patience, Sam.
Have a great rest of your week,
Priya`,
  ];

  const replies: { fromAgent: boolean; body: string }[] = [];
  for (let i = 0; i < REPLY_COUNT; i += 1) {
    const fromAgent = i % 2 === 0;
    const body = fromAgent ? agentTurns[i / 2] : customerTurns[(i - 1) / 2];
    if (body === undefined) {
      throw new Error(`Missing conversation text for reply ${i + 1}.`);
    }
    assertMinLines(`${fromAgent ? "Agent" : "Customer"} reply ${i + 1}`, body);
    replies.push({ fromAgent, body });
  }
  return replies;
}

async function main() {
  const ticket = await resolveTicket();
  const agent = await resolveAgent(ticket.assignedTo);
  const customer = await resolveCustomer(ticket);

  console.log(`Ticket:   "${ticket.subject}" (${ticket.id})`);
  console.log(`Agent:    ${agent.name} (${agent.id})`);
  console.log(`Customer: ${customer.name} (soft-deleted, ${customer.email})`);

  const existing = await prisma.reply.findMany({
    where: { ticketId: ticket.id },
    orderBy: { createdAt: "desc" },
    take: 1,
  });

  if (process.env.RESET_REPLIES) {
    const { count } = await prisma.reply.deleteMany({ where: { ticketId: ticket.id } });
    console.log(`RESET_REPLIES set — deleted ${count} existing repl${count === 1 ? "y" : "ies"}.`);
  } else if (existing.length > 0) {
    console.log(
      "This ticket already has replies; appending after the latest one. Set RESET_REPLIES=1 to clear first.",
    );
  }

  // Anchor the conversation so it starts after the ticket (and any existing
  // replies we're appending to), spacing each reply INTERVAL_MS apart.
  const latestExisting = process.env.RESET_REPLIES ? undefined : existing[0]?.createdAt;
  const startAfter = latestExisting && latestExisting > ticket.createdAt ? latestExisting : ticket.createdAt;

  const conversation = buildConversation(ticket.subject);
  const data = conversation.map((reply, index) => ({
    ticketId: ticket.id,
    authorId: reply.fromAgent ? agent.id : customer.id,
    body: reply.body,
    createdAt: new Date(startAfter.getTime() + (index + 1) * INTERVAL_MS),
  }));

  const { count } = await prisma.reply.createMany({ data });
  console.log(`Created ${count} replies (alternating agent/customer, each >= ${MIN_LINES} lines).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });



