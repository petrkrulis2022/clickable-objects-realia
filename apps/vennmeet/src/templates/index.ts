import type { Template } from "@vennmeet/shared";
import oneToOne from "./one-to-one.json";
import clientMeeting from "./client-meeting.json";
import salesCall from "./sales-call.json";
import negotiation from "./negotiation.json";
import projectCheckIn from "./project-check-in.json";
import secondLanguageMeeting from "./second-language-meeting.json";
import difficultConversation from "./difficult-conversation.json";
import blank from "./blank.json";

// All eight templates from docs/SPEC-VENNMEET.md, "Templates".
export const TEMPLATES: Template[] = [
  oneToOne,
  clientMeeting,
  salesCall,
  negotiation,
  projectCheckIn,
  secondLanguageMeeting,
  difficultConversation,
  blank,
] as Template[];
