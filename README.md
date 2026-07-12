# Period Buddy Content Studio

React admin-style content manager for Period Buddy blogs, questions, answers, guides, tips, and videos.

## API setup

Create a `.env` file in the project root from `.env.example` and set your backend URL:

```bash
VITE_API_BASE_URL=https://api.your-period-buddy-app.com
VITE_CONTENT_ENDPOINT=/api/content
VITE_LOGIN_ENDPOINT=/api/auth/login
VITE_API_TOKEN=
```

When `VITE_API_BASE_URL` is not set, the app uses `localStorage` so the UI still works during development.

## Expected REST contract

- `GET /api/content` returns `ContentItem[]` or `{ "items": ContentItem[] }`
- `POST /api/content` accepts a `ContentItem` body and returns `ContentItem` or `{ "item": ContentItem }`
- `PUT /api/content/:id` accepts a `ContentItem` body and returns `ContentItem` or `{ "item": ContentItem }`
- `DELETE /api/content/:id` returns `204 No Content` or any successful 2xx response

If your backend returns a JWT from email login, the dashboard saves it in browser storage and sends `Authorization: Bearer <token>` on content requests. Cookie-based auth is also supported because API requests include credentials.
# period-buddy-content
