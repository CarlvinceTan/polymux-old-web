import { escapeHtml, renderTeamMessageLayout, sendEmail } from "../utils/email";

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    title?: unknown;
    email?: unknown;
    content?: unknown;
  }>(event);

  const title =
    typeof body.title === "string" ? body.title.trim() : "";
  const email =
    typeof body.email === "string" ? body.email.trim() : "";
  const content =
    typeof body.content === "string" ? body.content.trim() : "";

  if (!title) {
    throw createError({ statusCode: 400, statusMessage: "Title is required." });
  }
  if (!email || !emailRe.test(email)) {
    throw createError({
      statusCode: 400,
      statusMessage: "A valid email is required.",
    });
  }
  if (!content) {
    throw createError({ statusCode: 400, statusMessage: "Message is required." });
  }

  await sendEmail({
    from: "Polymux Contact <onboarding@resend.dev>",
    to: ["team@polymux.com"],
    replyTo: email,
    subject: `[Contact] ${title}`,
    html: renderTeamMessageLayout({
      title: "New contact message",
      fromEmail: email,
      subjectLine: title,
      bodyHtml: escapeHtml(content).replace(/\n/g, "<br>"),
    }),
  });

  return { ok: true as const };
});
