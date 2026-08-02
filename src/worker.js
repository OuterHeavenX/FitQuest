const PBKDF2_ITERATIONS = 120000;

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations: PBKDF2_ITERATIONS
    },
    keyMaterial,
    256
  );

  const hash = new Uint8Array(bits);

  return [
    'pbkdf2-sha256',
    PBKDF2_ITERATIONS,
    bytesToBase64(salt),
    bytesToBase64(hash)
  ].join('$');
}

function json(data, status = 200) {
  return Response.json(data, { status });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      try {
        const result = await env.DB.prepare(
          'SELECT 1 AS ok'
        ).first();

        return json({
          ok: true,
          database: result?.ok === 1
        });
      } catch (error) {
        return json(
          {
            ok: false,
            error: error.message
          },
          500
        );
      }
    }

    if (
      url.pathname === '/api/auth/signup' &&
      request.method === 'POST'
    ) {
      try {
        const body = await request.json();

        const email = String(body.email || '')
          .trim()
          .toLowerCase();

        const password = String(body.password || '');

        if (!email || !email.includes('@')) {
          return json(
            { ok: false, error: 'Enter a valid email address.' },
            400
          );
        }

        if (password.length < 10) {
          return json(
            {
              ok: false,
              error: 'Password must be at least 10 characters.'
            },
            400
          );
        }

        const existing = await env.DB.prepare(
          'SELECT id FROM users WHERE email = ?'
        )
          .bind(email)
          .first();

        if (existing) {
          return json(
            {
              ok: false,
              error: 'An account with that email already exists.'
            },
            409
          );
        }

        const id = crypto.randomUUID();
        const passwordHash = await hashPassword(password);

        await env.DB.prepare(
          `INSERT INTO users
           (id, email, password_hash, created_at)
           VALUES (?, ?, ?, CURRENT_TIMESTAMP)`
        )
          .bind(id, email, passwordHash)
          .run();

        return json(
          {
            ok: true,
            user: {
              id,
              email
            }
          },
          201
        );
      } catch (error) {
        return json(
          {
            ok: false,
            error: 'Unable to create account.'
          },
          500
        );
      }
    }

    return env.ASSETS.fetch(request);
  }
};
