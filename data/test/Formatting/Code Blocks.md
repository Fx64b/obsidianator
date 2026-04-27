---
title: Code Blocks
tags:
  - formatting
  - code
  - syntax-highlighting
---

# Code Blocks

## Inline Code

Use `console.log("hello")` for debugging.

Install with `npm install react` or `yarn add react`.

The `--watch` flag enables live reload.

## Fenced Code Blocks

### TypeScript

```typescript
interface User {
  id: string
  name: string
  email: string
  createdAt: Date
}

async function fetchUser(id: string): Promise<User | null> {
  try {
    const response = await fetch(`/api/users/${id}`)
    if (!response.ok) return null
    return response.json()
  } catch (error) {
    console.error('Failed to fetch user:', error)
    return null
  }
}
```

### Go

```go
package main

import (
	"fmt"
	"net/http"
)

func handler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "Hello, %s!", r.URL.Path[1:])
}

func main() {
	http.HandleFunc("/", handler)
	fmt.Println("Listening on :8080")
	http.ListenAndServe(":8080", nil)
}
```

### Python

```python
from dataclasses import dataclass
from typing import Optional
import httpx

@dataclass
class Config:
    base_url: str
    timeout: float = 30.0
    retries: int = 3

async def fetch_data(config: Config, path: str) -> Optional[dict]:
    async with httpx.AsyncClient(base_url=config.base_url) as client:
        response = await client.get(path, timeout=config.timeout)
        response.raise_for_status()
        return response.json()
```

### Bash

```bash
#!/usr/bin/env bash
set -euo pipefail

BUILD_DIR="./dist"
BINARY="obsidianator"

echo "Building..."
go build -o "$BINARY" .

echo "Running tests..."
go test ./... -v

echo "Build complete: $BUILD_DIR/$BINARY"
```

### SQL

```sql
SELECT
    u.id,
    u.name,
    u.email,
    COUNT(p.id) AS post_count,
    MAX(p.created_at) AS last_post
FROM users u
LEFT JOIN posts p ON p.user_id = u.id
WHERE u.created_at > '2024-01-01'
GROUP BY u.id, u.name, u.email
HAVING COUNT(p.id) > 0
ORDER BY last_post DESC
LIMIT 50;
```

### JSON

```json
{
  "name": "obsidianator",
  "version": "0.1.0",
  "description": "Export Obsidian vaults to static sites",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  }
}
```

### YAML

```yaml
name: obsidianator
version: "0.1.0"
services:
  web:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./dist:/usr/share/nginx/html:ro
    environment:
      - NGINX_HOST=localhost
      - NGINX_PORT=80
```

### CSS

```css
:root {
  --primary: hsl(263, 70%, 50%);
  --background: hsl(0, 0%, 100%);
  --foreground: hsl(222, 84%, 5%);
  --radius: 0.5rem;
}

.markdown-body h1 {
  font-size: 2rem;
  font-weight: 700;
  margin-top: 2rem;
  margin-bottom: 1rem;
  border-bottom: 1px solid var(--border);
}
```

## Code Block Edge Case: Hash in Code

```bash
# This is a comment, not a heading
echo "# Also a comment"
git log --oneline # inline comment
```

See also: [[Basic Formatting]], [[Lists]], [[Tables]].
