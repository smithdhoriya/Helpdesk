import { prisma } from "./src/db";

async function main() {
  const total = await prisma.ticket.count();
  const withName = await prisma.ticket.count({ where: { NOT: { senderName: null } } });
  const nullName = await prisma.ticket.count({ where: { senderName: null } });
  const blankName = await prisma.ticket.count({ where: { senderName: "" } });

  console.log(`tickets: total=${total} senderName_null=${nullName} senderName_blank=${blankName} senderName_set=${withName}`);
  console.log("--- most recent 15 ---");

  const tickets = await prisma.ticket.findMany({
    orderBy: { createdAt: "desc" },
    take: 15,
    select: { id: true, subject: true, senderEmail: true, senderName: true, sourceMessageId: true, createdAt: true },
  });

  for (const t of tickets) {
    console.log(
      JSON.stringify({
        id: t.id.slice(0, 8),
        senderName: t.senderName,
        senderEmail: t.senderEmail,
        hasSourceMessageId: t.sourceMessageId != null,
        createdAt: t.createdAt.toISOString(),
        subject: t.subject.slice(0, 40),
      }),
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
