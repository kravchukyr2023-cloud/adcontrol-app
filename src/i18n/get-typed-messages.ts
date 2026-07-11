import { getMessages } from "next-intl/server";
import type { Messages } from "@/messages/en";

/**
 * Typed wrapper around next-intl's getMessages(). next-intl types messages
 * as AbstractIntlMessages (a generic record); we assert the shape to our
 * platform-wide Messages type so downstream components get autocomplete
 * on `t.hero`, `t.faq.items[0].q`, etc.
 *
 * uk.ts uses `satisfies Messages`, so the shape is guaranteed at compile
 * time — a missing key in uk.ts breaks the build before this cast ever
 * runs.
 */
export async function getTypedMessages(): Promise<Messages> {
  const messages = await getMessages();
  return messages as unknown as Messages;
}
