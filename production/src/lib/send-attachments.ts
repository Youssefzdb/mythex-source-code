/**
 * Which files a send carries.
 *
 * A queued follow-up carries the files it was queued with, and only those. It
 * is sent from a closure made when an EARLIER message was sent, whose composer
 * `attachments` are that earlier message's files: reading the composer for it
 * sent the previous message's picture again with the follow-up (seen on prod,
 * 2026-11-08), and dropped any picture queued with the follow-up itself.
 */
export type SendAttachmentInput<A> = {
  /** Files handed over explicitly (landing seed, plan hand-off). */
  readyAttachments?: A[];
  /** Set when this send drains a queued follow-up. */
  queued?: { attachments?: A[] };
  isEdit: boolean;
  editAttachments: A[];
  composerAttachments: A[];
};

export function pickSendAttachments<A>(input: SendAttachmentInput<A>): { atts: A[]; fromQueue: boolean } {
  if (input.readyAttachments) return { atts: input.readyAttachments, fromQueue: false };
  if (input.queued) return { atts: input.queued.attachments ?? [], fromQueue: true };
  return { atts: input.isEdit ? input.editAttachments : input.composerAttachments, fromQueue: false };
}
