import { submitTeamMessage } from "../utils/email";

export default defineEventHandler((event) =>
  submitTeamMessage(event, {
    fromName: "Polymux Contact",
    layoutTitle: "New contact message",
    subject: (title) => `[Contact] ${title}`,
  }),
);
