const PBKDF2_ITERATIONS = 120000;
const SESSION_DAYS = 30;


// ---------------------------------------------------------
// BASIC HELPERS
// ---------------------------------------------------------

function json(data, status = 200, extraHeaders = {}) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      ...extraHeaders
    }
  });
}


function bytesToBase64(bytes) {
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}


function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}


function bytesToBase64Url(bytes) {
  return bytesToBase64(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}


function bytesToHex(bytes) {
  return Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}


function constantTimeEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }

  let difference = 0;

  for (let i = 0; i < a.length; i++) {
    difference |= a[i] ^ b[i];
  }

  return difference === 0;
}


function parseCookies(request) {
  const cookieHeader = request.headers.get('Cookie') || '';

  const cookies = {};

  for (const part of cookieHeader.split(';')) {
    const index = part.indexOf('=');

    if (index === -1) continue;

    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    cookies[name] = value;
  }

  return cookies;
}


function sessionCookie(token) {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;

  return [
    `fitquest_session=${token}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${maxAge}`
  ].join('; ');
}


function clearSessionCookie() {
  return [
    'fitquest_session=',
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Max-Age=0'
  ].join('; ');
}


function sqliteDateTime(date) {
  return date
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d{3}Z$/, '');
}


// ---------------------------------------------------------
// PASSWORD HASHING
// ---------------------------------------------------------

async function hashPassword(password) {
  const encoder = new TextEncoder();

  const salt =
    crypto.getRandomValues(new Uint8Array(16));

  const keyMaterial =
    await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
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


async function verifyPassword(password, storedHash) {
  try {
    const parts = String(storedHash).split('$');

    if (parts.length !== 4) {
      return false;
    }

    const [
      algorithm,
      iterationText,
      saltBase64,
      hashBase64
    ] = parts;


    if (algorithm !== 'pbkdf2-sha256') {
      return false;
    }


    const iterations = Number(iterationText);

    if (
      !Number.isInteger(iterations) ||
      iterations < 10000 ||
      iterations > 1000000
    ) {
      return false;
    }


    const salt =
      base64ToBytes(saltBase64);

    const expectedHash =
      base64ToBytes(hashBase64);


    const encoder =
      new TextEncoder();


    const keyMaterial =
      await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
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
        keyMaterial,
        expectedHash.length * 8
      );


    const actualHash =
      new Uint8Array(bits);


    return constantTimeEqual(
      actualHash,
      expectedHash
    );

  } catch {
    return false;
  }
}


// ---------------------------------------------------------
// SESSION HELPERS
// ---------------------------------------------------------

async function hashSessionToken(token) {
  const bytes =
    new TextEncoder().encode(token);

  const digest =
    await crypto.subtle.digest(
      'SHA-256',
      bytes
    );

  return bytesToHex(
    new Uint8Array(digest)
  );
}


async function createSession(env, userId) {
  const randomBytes =
    crypto.getRandomValues(
      new Uint8Array(32)
    );

  const rawToken =
    bytesToBase64Url(randomBytes);

  const tokenHash =
    await hashSessionToken(rawToken);


  const expires =
    new Date(
      Date.now() +
      SESSION_DAYS *
      24 *
      60 *
      60 *
      1000
    );


  const expiresAt =
    sqliteDateTime(expires);


  await env.DB.prepare(
    `INSERT INTO sessions
      (token, user_id, expires_at, created_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)`
  )
    .bind(
      tokenHash,
      userId,
      expiresAt
    )
    .run();


  return {
    rawToken,
    expiresAt
  };
}


async function getCurrentUser(request, env) {
  const cookies =
    parseCookies(request);

  const rawToken =
    cookies.fitquest_session;


  if (!rawToken) {
    return null;
  }


  const tokenHash =
    await hashSessionToken(rawToken);


  const session =
    await env.DB.prepare(
      `SELECT
         sessions.token,
         sessions.user_id,
         sessions.expires_at,
         users.email
       FROM sessions
       JOIN users
         ON users.id = sessions.user_id
       WHERE sessions.token = ?
         AND sessions.expires_at > CURRENT_TIMESTAMP
       LIMIT 1`
    )
      .bind(tokenHash)
      .first();


  if (!session) {
    return null;
  }


  return {
    id: session.user_id,
    email: session.email,
    tokenHash
  };
}


// ---------------------------------------------------------
// WORKER
// ---------------------------------------------------------

export default {

  async fetch(request, env) {

    const url =
      new URL(request.url);


    // -----------------------------------------------------
    // HEALTH CHECK
    // -----------------------------------------------------

    if (
      url.pathname === '/api/health' &&
      request.method === 'GET'
    ) {

      try {

        const result =
          await env.DB.prepare(
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


    // -----------------------------------------------------
    // SIGN UP
    // -----------------------------------------------------

    if (
      url.pathname === '/api/auth/signup' &&
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


        if (
          !email ||
          !email.includes('@')
        ) {

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


        const session =
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
              sessionCookie(
                session.rawToken
              )
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
              'Unable to create account.'
          },
          500
        );

      }
    }


    // -----------------------------------------------------
    // LOGIN
    // -----------------------------------------------------

    if (
      url.pathname === '/api/auth/login' &&
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


        if (
          !email ||
          !password
        ) {

          return json(
            {
              ok: false,
              error:
                'Enter your email and password.'
            },
            400
          );
        }


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


        if (!user) {

          return json(
            {
              ok: false,
              error:
                'Incorrect email or password.'
            },
            401
          );
        }


        const passwordCorrect =
          await verifyPassword(
            password,
            user.password_hash
          );


        if (!passwordCorrect) {

          return json(
            {
              ok: false,
              error:
                'Incorrect email or password.'
            },
            401
          );
        }


        // Clean expired sessions occasionally.
        await env.DB.prepare(
          `DELETE FROM sessions
           WHERE expires_at <= CURRENT_TIMESTAMP`
        ).run();


        const session =
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
              sessionCookie(
                session.rawToken
              )
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
              'Unable to sign in.'
          },
          500
        );

      }
    }


    // -----------------------------------------------------
    // CURRENT USER
    // -----------------------------------------------------

    if (
      url.pathname === '/api/auth/me' &&
      request.method === 'GET'
    ) {

      try {

        const user =
          await getCurrentUser(
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

          user: {
            id: user.id,
            email: user.email
          }
        });


      } catch (error) {

        console.error(
          'Session check error:',
          error
        );


        return json(
          {
            ok: false,
            authenticated: false
          },
          500
        );

      }
    }


    // -----------------------------------------------------
    // LOGOUT
    // -----------------------------------------------------

    if (
      url.pathname === '/api/auth/logout' &&
      request.method === 'POST'
    ) {

      try {

        const cookies =
          parseCookies(request);


        const rawToken =
          cookies.fitquest_session;


        if (rawToken) {

          const tokenHash =
            await hashSessionToken(
              rawToken
            );


          await env.DB.prepare(
            `DELETE FROM sessions
             WHERE token = ?`
          )
            .bind(tokenHash)
            .run();
        }


        return json(
          {
            ok: true
          },
          200,
          {
            'Set-Cookie':
              clearSessionCookie()
          }
        );


      } catch (error) {

        console.error(
          'Logout error:',
          error
        );


        return json(
          {
            ok: false,
            error:
              'Unable to sign out.'
          },
          500
        );

      }
    }


    // -----------------------------------------------------
    // STATIC FITQUEST FILES
    // -----------------------------------------------------

    return env.ASSETS.fetch(request);
  }
};
