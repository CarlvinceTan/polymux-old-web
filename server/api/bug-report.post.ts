import { Resend } from "resend";

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

  const config = useRuntimeConfig();
  const resend = new Resend(config.resendApiKey);

  const prefixedTitle = `Bug: ${title}`;

  const { error } = await resend.emails.send({
    from: "Polymux Bug Report <onboarding@resend.dev>",
    to: ["carlvincetan@outlook.com"],
    replyTo: email,
    subject: prefixedTitle,
    html: `
      <p><strong>From:</strong> ${email}</p>
      <p><strong>Subject:</strong> ${prefixedTitle}</p>
      <hr />
      <p>${content.replace(/\n/g, "<br>")}</p>
    `,
  });

  if (error) {
    console.error("[bug-report] email error", error);
    throw createError({ statusCode: 500, statusMessage: "Failed to send bug report. Please try again." });
  }

  return { ok: true as const };
});
