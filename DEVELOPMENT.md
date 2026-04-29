# Development

## Branch Strategy

### Alpha / Beta Phases (current)

Use `main` as the working branch. All development, fixes, and features land directly on `main` while the project is in alpha/beta.

- Commit and push directly to `main`
- No long-lived `dev` branch yet
- Feature branches are fine, but they merge back into `main`

### Post-Launch (after proper 1.0 launch)

Once the project has a proper launch, switch to a two-branch flow:

- `main` — stable, release-ready code only
- `dev` — integration branch for ongoing work; merges into `main` for releases

Until that launch happens, **do not** use `dev`. Keep everything on `main`.
