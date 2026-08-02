const PBKDF2_ITERATIONS = 100000;
const SESSION_DAYS = 30;

function json(data, status = 200, headers = {}) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      ...headers
    }
  });
}

function b64(bytes) {
  let s = '';

  for (const b of bytes) {
    s += String.fromCharCode(b);
  }

  return btoa(s);
}

function fromB64(s) {
  const bin = atob(s);

  return Uint8Array.from(
    bin,
    c => c.charCodeAt(0)
  );
}

function b64url(bytes) {
  return b64(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function hex(bytes) {
  return Array.from(
    bytes,
    b => b.toString(16).padStart(2, '0')
  ).join('');
}

function equalBytes(a, b) {
  if (a.length !== b.length) {
    return false;
  }

  let diff = 0;

  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }

  return diff === 0;
}

function cookies(request) {
  const out = {};

  const header =
    request.headers.get('Cookie') || '';

  for (const part of header.split(';')) {
    const i = part.indexOf('=');

    if (i > -1) {
      out[part.slice(0, i).trim()] =
        part.slice(i + 1).trim();
    }
  }

  return out;
}

function sessionCookie(token) {
  const maxAge =
    SESSION_DAYS * 24 * 60 * 60;

  return [
    `fitquest_session=${token}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${maxAge}`
  ].join('; ');
}

function clearCookie() {
  return [
    'fitquest_session=',
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Max-Age=0'
  ].join('; ');
}

async function hashPassword(password) {
  const enc = new TextEncoder();

  const salt =
    crypto.getRandomValues(
      new Uint8Array(16)
    );

  const key =
    await crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );

  const bits =
    await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        hash: 'SHA-256',
        salt,
        iterations: PBKDF2_ITERATIONS
      },
      key,
      256
    );

  return [
    'pbkdf2-sha256',
    PBKDF2_ITERATIONS,
    b64(salt),
    b64(new Uint8Array(bits))
  ].join('$');
}

async function verifyPassword(
  password,
  stored
) {
  try {
    const [
      alg,
      iterText,
      saltText,
      hashText
    ] = String(stored).split('$');

    if (alg !== 'pbkdf2-sha256') {
      return false;
    }

    const iterations =
      Number(iterText);

    const salt =
      fromB64(saltText);

    const expected =
      fromB64(hashText);

    const enc =
      new TextEncoder();

    const key =
      await crypto.subtle.importKey(
        'raw',
        enc.encode(password),
        'PBKDF2',
        false,
        ['deriveBits']
      );

    const bits =
      await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          hash: 'SHA-256',
          salt,
          iterations
        },
        key,
        expected.length * 8
      );

    return equalBytes(
      new Uint8Array(bits),
      expected
    );

  } catch {
    return false;
  }
}

async function tokenHash(token) {
  const digest =
    await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(token)
    );

  return hex(
    new Uint8Array(digest)
  );
}

async function createSession(
  env,
  userId
) {
  const raw =
    b64url(
      crypto.getRandomValues(
        new Uint8Array(32)
      )
    );

  const hashed =
    await tokenHash(raw);

  const expiresAt =
    new Date(
      Date.now() +
      SESSION_DAYS *
      24 *
      60 *
      60 *
      1000
    ).toISOString();

  await env.DB.prepare(
    `INSERT INTO sessions
      (
        token,
        user_id,
        expires_at,
        created_at
      )
     VALUES
      (
        ?,
        ?,
        ?,
        CURRENT_TIMESTAMP
      )`
  )
    .bind(
      hashed,
      userId,
      expiresAt
    )
    .run();

  return raw;
}

async function currentUser(
  request,
  env
) {
  const raw =
    cookies(request)
      .fitquest_session;

  if (!raw) {
    return null;
  }

  const hashed =
    await tokenHash(raw);

  return env.DB.prepare(
    `SELECT
       users.id,
       users.email
     FROM sessions
     JOIN users
       ON users.id = sessions.user_id
     WHERE sessions.token = ?
       AND sessions.expires_at >
           CURRENT_TIMESTAMP
     LIMIT 1`
  )
    .bind(hashed)
    .first();
}

export default {
  async fetch(request, env) {
    const url =
      new URL(request.url);


    // HEALTH CHECK

    if (
      url.pathname === '/api/health' &&
      request.method === 'GET'
    ) {
      try {
        const row =
          await env.DB.prepare(
            'SELECT 1 AS ok'
          ).first();

        return json({
          ok: true,
          database: row?.ok === 1
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


    // CREATE ACCOUNT

    if (
      url.pathname ===
        '/api/auth/signup' &&
      request.method === 'POST'
    ) {
      try {
        const body =
          await request.json();

        const email =
          String(body.email || '')
            .trim()
            .toLowerCase();

        const password =
          String(body.password || '');

        if (!email.includes('@')) {
          return json(
            {
              ok: false,
              error:
                'Enter a valid email address.'
            },
            400
          );
        }

        if (password.length < 10) {
          return json(
            {
              ok: false,
              error:
                'Password must be at least 10 characters.'
            },
            400
          );
        }

        const existing =
          await env.DB.prepare(
            `SELECT id
             FROM users
             WHERE email = ?`
          )
            .bind(email)
            .first();

        if (existing) {
          return json(
            {
              ok: false,
              error:
                'An account with that email already exists.'
            },
            409
          );
        }

        const id =
          crypto.randomUUID();

        const passwordHash =
          await hashPassword(password);

        await env.DB.prepare(
          `INSERT INTO users
            (
              id,
              email,
              password_hash,
              created_at
            )
           VALUES
            (
              ?,
              ?,
              ?,
              CURRENT_TIMESTAMP
            )`
        )
          .bind(
            id,
            email,
            passwordHash
          )
          .run();

        const raw =
          await createSession(
            env,
            id
          );

        return json(
          {
            ok: true,
            user: {
              id,
              email
            }
          },
          201,
          {
            'Set-Cookie':
              sessionCookie(raw)
          }
        );

      } catch (error) {
        console.error(
          'Signup error:',
          error
        );

        return json(
          {
            ok: false,
            error:
              error.message ||
              String(error)
          },
          500
        );
      }
    }


    // LOGIN

    if (
      url.pathname ===
        '/api/auth/login' &&
      request.method === 'POST'
    ) {
      try {
        const body =
          await request.json();

        const email =
          String(body.email || '')
            .trim()
            .toLowerCase();

        const password =
          String(body.password || '');

        const user =
          await env.DB.prepare(
            `SELECT
               id,
               email,
               password_hash
             FROM users
             WHERE email = ?
             LIMIT 1`
          )
            .bind(email)
            .first();

        if (
          !user ||
          !await verifyPassword(
            password,
            user.password_hash
          )
        ) {
          return json(
            {
              ok: false,
              error:
                'Incorrect email or password.'
            },
            401
          );
        }

        await env.DB.prepare(
          `DELETE FROM sessions
           WHERE expires_at <=
                 CURRENT_TIMESTAMP`
        ).run();

        const raw =
          await createSession(
            env,
            user.id
          );

        return json(
          {
            ok: true,
            user: {
              id: user.id,
              email: user.email
            }
          },
          200,
          {
            'Set-Cookie':
              sessionCookie(raw)
          }
        );

      } catch (error) {
        console.error(
          'Login error:',
          error
        );

        return json(
          {
            ok: false,
            error:
              error.message ||
              String(error)
          },
          500
        );
      }
    }


    // CHECK CURRENT SESSION

    if (
      url.pathname ===
        '/api/auth/me' &&
      request.method === 'GET'
    ) {
      try {
        const user =
          await currentUser(
            request,
            env
          );

        if (!user) {
          return json(
            {
              ok: false,
              authenticated: false
            },
            401
          );
        }

        return json({
          ok: true,
          authenticated: true,
          user
        });

      } catch (error) {
        return json(
          {
            ok: false,
            authenticated: false,
            error:
              error.message ||
              String(error)
          },
          500
        );
      }
    }


    // LOGOUT

    if (
      url.pathname ===
        '/api/auth/logout' &&
      request.method === 'POST'
    ) {
      try {
        const raw =
          cookies(request)
            .fitquest_session;

        if (raw) {
          const hashed =
            await tokenHash(raw);

          await env.DB.prepare(
            `DELETE FROM sessions
             WHERE token = ?`
          )
            .bind(hashed)
            .run();
        }

        return json(
          {
            ok: true
          },
          200,
          {
            'Set-Cookie':
              clearCookie()
          }
        );

      } catch (error) {
        return json(
          {
            ok: false,
            error:
              error.message ||
              String(error)
          },
          500
        );
      }
    }


    // NORMAL FITQUEST FILES

    return env.ASSETS.fetch(request);
  }
};
