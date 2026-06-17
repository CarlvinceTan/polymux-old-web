import { submitTeamMessage } from "../utils/email";

export default defineEventHandler((event) =>
  submitTeamMessage(event, {
    fromName: "Polymux Bug Report",
    layoutTitle: "New bug report",
    subject: (title) => `Bug: ${title}`,
    subjectLine: (title) => `Bug: ${title}`,
  }),
);
