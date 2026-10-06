# RATty — Repository Analysis Tool

RATty is a [Next.js](https://nextjs.org) web app that deep-clones a Git repository
from a URL (or local path) and computes a rich set of software metrics from its
commit history: file, directory, repository, commit-set, and author metrics.

It supports **multiple repositories** — clone as many as you like, switch between
them in the sidebar, and re-analyse each independently with an optional date range
and author merging (via `.mailmap` or manual selection).

## Features

- **Clone by URL or path** — deep clones the full history locally.
- **Multi-repository** — every clone is stored and selectable from the sidebar.
- **Metrics** — added/removed lines, growth, churn, modification frequency (η),
  churn rate (ρ), and per-author ownership (ω).
- **Author merging** — honours a repository's `.mailmap`, and lets you merge
  authors manually when no mailmap exists.
- **Commit breakdown** — clearly reconciles the analysed non-merge commit count
  with the total reachable from HEAD (including merge commits).
- **Dual theme** — green & white light mode and a matching dark mode.

## Prerequisites

Before you begin, make sure you have the following installed:

- **[Node.js](https://nodejs.org) 20.9 or newer** (LTS recommended) — this also
  provides `npm`.
- **[Git](https://git-scm.com/downloads)** — RATty shells out to `git` to clone
  repositories and read their history, so it must be available on your `PATH`.

Make sure you have [Node.js](https://nodejs.org/) installed.

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.7/install.sh | bash
source ~/.bashrc
nvm install 22
nvm use 22
```

Check your versions:

```bash
node --version
npm --version
git --version
```

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/devSimphiwe/repo-analysis-tool.git
cd repo-analysis-tool
```

### 2. Install dependencies

```bash
npm install
```

### 3. Run the development server

```bash
npm run dev
```

Open http://localhost:3000 in your browser to use the app.

## Running a Production Build

To build an optimised production bundle and serve it:

```bash
npm run build
npm start
```

The app will be available at http://localhost:3000.

## Using the App

1. Paste a repository URL (e.g. `https://github.com/user/repo.git`) or a local
   path into the **Repository URL or path** field.
2. Optionally set **Since** / **Until** dates (UTC) to limit the commit range.
3. Click **Clone & analyse**. The clone appears in the left sidebar and its
   metrics are shown on the right.
4. Select any repository in the sidebar to switch between your clones, adjust the
   date range, or merge authors in the **Authors** section.

## Available Scripts

| Script            | Description                                     |
| ----------------- | ----------------------------------------------- |
| `npm run dev`     | Start the development server.                   |
| `npm run build`   | Create an optimised production build.           |
| `npm start`       | Serve the production build.                     |
| `npm run lint`    | Run ESLint over the project.                    |

## Notes

- Cloned repositories and the app index are stored in a git-ignored
  `.ratty-data/` directory inside the project. You can override its location with
  the `RATTY_DATA_DIR` environment variable.
- Merge commits are excluded from churn-based metrics because they carry no
  original diff and would double-count changes. The UI shows both the analysed
  non-merge count and the total reachable from HEAD so it reconciles with the
  commit count reported by your Git host.

## Learn More

- [Next.js Documentation](https://nextjs.org/docs) — learn about Next.js features and API.
- [Git Documentation](https://git-scm.com/doc) — learn about `git log`, `.mailmap`, and more.
