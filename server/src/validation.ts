import { z } from 'zod';

export const email = z
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());
export const password = z.string().min(12, 'Use at least 12 characters.').max(128);
const shortText = z.string().trim().min(1).max(250);
const dateTime = z.iso.datetime({ offset: true });
function hasProtocol(value: string, protocols: string[]) {
  try {
    return protocols.includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
const webUrl = z
  .url()
  .max(2000)
  .refine((value) => hasProtocol(value, ['http:', 'https:']), 'Use an HTTP or HTTPS URL.');
export const httpsUrl = z
  .url()
  .max(2000)
  .refine((value) => hasProtocol(value, ['https:']), 'Use an HTTPS URL.');
const optionalLink = webUrl.optional();
const base = {
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(1).max(20000),
  facultyId: z.uuid().nullable().optional(),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(32)).max(8).default([]),
  imageUrl: httpsUrl.nullable().optional(),
  status: z.enum(['open', 'filled', 'resolved', 'closed']).default('open'),
};

// A type switch changes the required fields; unknown fields are rejected rather than stored unvalidated.
export const postInput = z
  .discriminatedUnion('type', [
    z.strictObject({
      ...base,
      type: z.literal('Announcement'),
      details: z.strictObject({ audience: shortText, expiryDate: dateTime.optional() }),
    }),
    z.strictObject({
      ...base,
      type: z.literal('Club recruitment'),
      details: z.strictObject({
        club: shortText,
        joiningInstructions: z.string().trim().min(1).max(2000),
        applicationDeadline: dateTime.optional(),
      }),
    }),
    z.strictObject({
      ...base,
      type: z.literal('Event'),
      details: z.strictObject({
        startsAt: dateTime,
        endsAt: dateTime.optional(),
        location: shortText,
        organizer: shortText,
        registrationUrl: optionalLink,
      }),
    }),
    z.strictObject({
      ...base,
      type: z.literal('Opportunity'),
      details: z.strictObject({
        deadline: dateTime,
        eligibility: z.string().trim().min(1).max(2000),
        organizer: shortText,
        applicationUrl: optionalLink,
      }),
    }),
    z.strictObject({
      ...base,
      type: z.literal('Find teammates'),
      details: z.strictObject({
        skillsNeeded: z.array(shortText).min(1).max(20),
        peopleNeeded: z.number().int().min(1).max(100),
        deadline: dateTime.optional(),
      }),
    }),
    z.strictObject({
      ...base,
      type: z.literal('Study group'),
      details: z.strictObject({
        course: shortText,
        format: z.enum(['in-person', 'online', 'hybrid']),
        schedule: shortText,
        places: z.number().int().min(1).max(100),
        location: shortText.optional(),
      }),
    }),
    z.strictObject({
      ...base,
      type: z.literal('Question'),
      details: z.strictObject({ topic: shortText.optional() }),
    }),
    z.strictObject({
      ...base,
      type: z.literal('Lost & found'),
      details: z.strictObject({ item: shortText, location: shortText, foundAt: dateTime }),
    }),
    z.strictObject({
      ...base,
      type: z.literal('Poll'),
      details: z.strictObject({
        options: z
          .array(shortText)
          .min(2)
          .max(10)
          .refine(
            (options) => new Set(options).size === options.length,
            'Poll choices must be unique.',
          ),
        closingAt: dateTime,
      }),
    }),
  ])
  .superRefine((post, context) => {
    if (
      post.type === 'Event' &&
      post.details.endsAt &&
      new Date(post.details.endsAt) <= new Date(post.details.startsAt)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['details', 'endsAt'],
        message: 'The end must be after the start.',
      });
    }
  });

export const pagination = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const feedQuery = pagination.extend({
  q: z.string().trim().max(200).optional(),
  type: z
    .enum([
      'Announcement',
      'Club recruitment',
      'Event',
      'Opportunity',
      'Find teammates',
      'Study group',
      'Question',
      'Lost & found',
      'Poll',
    ])
    .optional(),
  facultyId: z.uuid().optional(),
  tag: z.string().trim().toLowerCase().max(32).optional(),
  from: dateTime.optional(),
  to: dateTime.optional(),
  mine: z.enum(['true', 'false']).optional(),
});

export const commentInput = z.strictObject({
  body: z.string().trim().min(1).max(5000),
  parentId: z.uuid().optional(),
});
export const reasonInput = z.string().trim().min(5).max(2000);
