## Grow Agents MVP

This project now includes:

- Agent selection landing page
- A fully implemented `Copy Injection + Image Injection` agent
- Supabase-backed memory (funnels, revisions, reusable templates)
- AI SDK generation + edit routes
- Inline sandbox preview for generated funnel output

## One-Time Supabase Setup (Required)

1. Open your Supabase project SQL editor.
2. Run the SQL in `supabase/schema.sql`.
3. Keep RLS disabled for MVP (as requested).

## Environment Variables

`.env.local` should include:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`
- `AI_GATEWAY_API_KEY`

## Getting Started

Install dependencies and run the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), choose the live first agent, then:

1. Train templates (optional but recommended)
2. Generate a funnel from objective/context
3. Review the sandbox preview
4. Apply prompt-based edits to update the same funnel revision chain

## Notes

- HTML image placeholders are generated as `{{image:section-id}}` and replaced in preview/copy output.
- Generated images are currently stored as data URLs in Supabase JSON for fast MVP iteration.
- No authentication is enabled yet.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!
