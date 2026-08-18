# Contributing to OpenWed

Thanks for considering a contribution! OpenWed is a wedding website platform
that couples self-host for their own weddings. Every contribution makes it
better for the next couple.

## Ground Rules

- **No personal data in the repo.** This is a public repository. Never commit
  real guest lists, real names, real emails, or real wedding details. Use the
  demo seed data or clearly fake placeholders.
- **No secrets.** Never commit `.env` files, API keys, or tokens. `.env*` is
  git-ignored.
- **TypeScript only** — no `any` types.
- **Server components by default**; client components only when needed.
- **Mobile-first responsive design** on every page.
- **Never hardcode event names** — always pull from the `Event` table.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/<you>/openwed.git`
3. Install dependencies: `npm install`
4. Generate the Prisma client: `npx prisma generate`
5. Set up a local PostgreSQL database and copy `.env.example` to `.env`
6. Push the schema: `npx prisma db push`
7. Seed: `npx prisma db seed`
8. Run the dev server: `npm run dev`

## Making Changes

1. Create a branch: `git checkout -b feat/your-feature` (or `fix/...`)
2. Make your changes
3. Type check: `npx tsc --noEmit --skipLibCheck`
4. Lint: `npm run lint`
5. Test manually against the dev server
6. Commit with a conventional message: `feat(scope): description`
7. Push and open a pull request

## Pull Request Checklist

- [ ] Type check passes
- [ ] Lint passes
- [ ] No real personal data in the diff
- [ ] No secrets in the diff
- [ ] Screenshots or description of UI changes
- [ ] PR title follows conventional commits

## Project Structure

See the README's Project Structure section. Key conventions:

- `/src/app` — Next.js pages and API routes
- `/src/lib` — utilities (db client, auth config, helpers)
- `/src/components/public` — public site components
- `/src/components/admin` — admin components
- `/prisma` — schema and seed files

## License

By contributing, you agree that your contributions are licensed under the
[GNU Affero General Public License v3.0](LICENSE).
