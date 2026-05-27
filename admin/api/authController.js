const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const https = require('https');
const db = require('../config/db');
const { mergeGuestCart } = require('./cartController');

const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID;
const requireGoogleClientId = () => {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error('Google client ID is not configured.');
  }
  return GOOGLE_CLIENT_ID;
};
const GOOGLE_TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo?id_token=';
const ITOA64 = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BREVO_API_KEY =
  process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY || '';
const BREVO_SENDER_EMAIL =
  process.env.BREVO_SENDER_EMAIL ;
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || 'NESTCASE';
const RESET_TOKEN_HASH_META = 'password_reset_token_hash';
const RESET_TOKEN_EXPIRES_META = 'password_reset_token_expires';
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const MAX_BCRYPT_PASSWORD_BYTES = 72;

const roleSlugFromType = (type) => {
  if (type === 1) return 'admin';
  if (type === 2) return 'agents';
  if (type === 3) return 'customers';
  if (type === 4) return 'guests';
  return 'guest';
};

const toSlug = (value) =>
  String(value ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const md5 = (val) => crypto.createHash('md5').update(val).digest('hex');

const md5Buffer = (val) => crypto.createHash('md5').update(val).digest();
const sha256 = (val) => crypto.createHash('sha256').update(val).digest('hex');

const isHex32 = (val) => /^[a-f0-9]{32}$/i.test(val || '');

// Stricter email validation used in register() and updateProfile().
// Rejects obvious garbage that /\S+@\S+\.\S+/ passes (e.g. 'a@b.c',
// leading/trailing spaces, missing TLD, multiple consecutive dots).
// local part : 1–64 chars, no whitespace or bare @
// domain     : labels of alphanumeric/hyphen chars separated by dots
// TLD        : 2–24 letters only
const VALID_EMAIL_RE = /^[^\s@]{1,64}@[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,24}$/;

function encode64(input, count) {
  let output = '';
  let i = 0;
  while (i < count) {
    let value = input[i++];
    output += ITOA64[value & 0x3f];
    if (i < count) value |= input[i] << 8;
    output += ITOA64[(value >> 6) & 0x3f];
    if (i++ >= count) break;
    if (i < count) value |= input[i] << 16;
    output += ITOA64[(value >> 12) & 0x3f];
    if (i++ >= count) break;
    output += ITOA64[(value >> 18) & 0x3f];
  }
  return output;
}

function phpassHash(password, setting) {
  if (!setting || setting.length < 12) return null;
  const id = setting.slice(0, 3);
  if (id !== '$P$' && id !== '$H$') return null;

  const countLog2 = ITOA64.indexOf(setting[3]);
  if (countLog2 < 7 || countLog2 > 30) return null;
  const count = 1 << countLog2;
  const salt = setting.slice(4, 12);

  let hash = md5Buffer(`${salt}${password}`);
  for (let i = 0; i < count; i += 1) {
    hash = md5Buffer(Buffer.concat([hash, Buffer.from(password)]));
  }

  return setting.slice(0, 12) + encode64(hash, 16);
}

async function verifyPassword(password, storedHash) {
  if (!storedHash) return { ok: false, needsRehash: false };
  if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$') || storedHash.startsWith('$2y$')) {
    const ok = await bcrypt.compare(password, storedHash);
    return { ok, needsRehash: ok && bcrypt.getRounds(storedHash) < 12 };
  }
  if (storedHash.startsWith('$P$') || storedHash.startsWith('$H$')) {
    const check = phpassHash(password, storedHash);
    // timingSafeEqual prevents timing attacks that enumerate the hash byte-by-byte.
    // phpassHash always produces a fixed-length string matching storedHash length.
    const ok = check.length === storedHash.length &&
      crypto.timingSafeEqual(Buffer.from(check), Buffer.from(storedHash));
    return { ok, needsRehash: ok };
  }
  if (isHex32(storedHash)) {
    // Legacy MD5 path — WordPress accounts migrated before bcrypt was adopted.
    // timingSafeEqual prevents timing attacks; md5() always returns 32 hex chars
    // matching storedHash length, so buffers are always the same length.
    const computed = md5(password);
    const ok = crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(storedHash));
    return { ok, needsRehash: ok };
  }
  // Legacy plaintext fallback — absolute last resort for very old accounts.
  // Pad both sides to 256 bytes so length itself does not leak whether the
  // password matched (prevents timing oracle on password length).
  const a = Buffer.alloc(256, 0);
  const b = Buffer.alloc(256, 0);
  Buffer.from(storedHash).copy(a);
  Buffer.from(password).copy(b);
  const ok = crypto.timingSafeEqual(a, b);
  return { ok, needsRehash: ok };
}

function setSessionUser(req, user) {
  const slug = user.user_type_slug || roleSlugFromType(user.user_type);
  req.sessionData.user = {
    id: user.ID,
    userType: user.user_type,
    userTypeSlug: slug,
    email: user.user_email,
    name: user.display_name,
    username: user.user_login,
  };
  req.sessionData.isLoggedIn = true;
  req.touchSession();
}

async function setUserMetaEntries(userId, entries) {
  const normalizedEntries = (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry && entry.metaKey)
    .map((entry) => ({
      metaKey: String(entry.metaKey),
      metaValue: String(entry.metaValue ?? ''),
    }));

  if (!normalizedEntries.length) {
    return;
  }

  const conn = await db.getConnection();
  const lockKey = `usermeta:${userId}`;

  try {
    const [[lockRow]] = await conn.query('SELECT GET_LOCK(?, 5) AS got_lock', [lockKey]);
    if (!lockRow || Number(lockRow.got_lock) !== 1) {
      throw new Error('Could not acquire user meta lock.');
    }

    await conn.beginTransaction();
    const metaKeys = [...new Set(normalizedEntries.map((entry) => entry.metaKey))];
    await conn.query(
      'DELETE FROM tbl_usermeta WHERE user_id = ? AND meta_key IN (?)',
      [userId, metaKeys]
    );
    const rows = normalizedEntries.map((entry) => [userId, entry.metaKey, entry.metaValue]);
    await conn.query(
      'INSERT INTO tbl_usermeta (user_id, meta_key, meta_value) VALUES ?',
      [rows]
    );
    await conn.commit();
  } catch (err) {
    try {
      await conn.rollback();
    } catch {}
    throw err;
  } finally {
    try {
      await conn.query('SELECT RELEASE_LOCK(?)', [lockKey]);
    } catch {}
    conn.release();
  }
}

async function setUserMeta(userId, metaKey, metaValue) {
  await setUserMetaEntries(userId, [{ metaKey, metaValue }]);
}

async function deleteUserMeta(userId, metaKey) {
  await db.query('DELETE FROM tbl_usermeta WHERE user_id = ? AND meta_key = ?', [userId, metaKey]);
}

function validateBcryptPasswordLength(password) {
  const bytes = Buffer.byteLength(String(password ?? ''), 'utf8');
  if (bytes > MAX_BCRYPT_PASSWORD_BYTES) {
    return 'Password is too long - please shorten it.';
  }
  return null;
}

async function clearPasswordResetToken(userId) {
  await deleteUserMeta(userId, RESET_TOKEN_HASH_META);
  await deleteUserMeta(userId, RESET_TOKEN_EXPIRES_META);
}

async function clearPasswordResetTokenInConn(conn, userId) {
  await conn.query(
    'DELETE FROM tbl_usermeta WHERE user_id = ? AND meta_key IN (?)',
    [userId, [RESET_TOKEN_HASH_META, RESET_TOKEN_EXPIRES_META]]
  );
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getFrontendBaseUrl() {
  const rawBase = (
    process.env.FRONTEND_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'http://localhost:3001'
  ).replace(/\/+$/, '');

  try {
    const url = new URL(rawBase);
    const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);

    if (process.env.NODE_ENV === 'production' && isLocalhost) {
      throw new Error(
        `Invalid FRONTEND_URL/NEXT_PUBLIC_SITE_URL for production: ${rawBase}. Set it to your public domain.`,
      );
    }

    if (url.pathname === '/store' || url.pathname === '/store/') {
      url.pathname = '';
    }
    if (!isLocalhost && url.port === '3001') {
      url.port = '';
    }
    return url.toString().replace(/\/+$/, '');
  } catch {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        `Unable to determine a production frontend URL from FRONTEND_URL/NEXT_PUBLIC_SITE_URL: ${rawBase}`,
      );
    }
    return rawBase;
  }
}

function getResetCheckoutBaseUrl() {
  const rawResetUrl = (process.env.RESET_URL || '').replace(/\/+$/, '');

  if (rawResetUrl) {
    let url;
    try {
      url = new URL(rawResetUrl);
    } catch {
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          `Invalid RESET_URL for production: ${rawResetUrl}. Set it to your public checkout URL, for example https://gaffis.org/store/checkout.`,
        );
      }
      return rawResetUrl;
    }

    const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
    if (process.env.NODE_ENV === 'production') {
      if (isLocalhost) {
        throw new Error(
          `Invalid RESET_URL for production: ${rawResetUrl}. Set it to your public checkout URL, for example https://gaffis.org/store/checkout.`,
        );
      }
      if (url.pathname === '/' || url.pathname === '') {
        throw new Error(
          `RESET_URL must point to the checkout page in production. Example: https://gaffis.org/store/checkout.`,
        );
      }
    }

    return url.toString().replace(/\/+$/, '');
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'RESET_URL is not configured. Set RESET_URL to your public checkout URL, for example https://gaffis.org/store/checkout.',
    );
  }

  return `${getFrontendBaseUrl()}/store/checkout`;
}

async function sendBrevoEmail({ toEmail, toName, subject, html }) {
  if (!BREVO_API_KEY) {
    console.warn('Brevo API key missing. Set BREVO_API_KEY in environment.');
    return false;
  }

  const payload = JSON.stringify({
    sender: { name: BREVO_SENDER_NAME, email: BREVO_SENDER_EMAIL },
    to: [{ email: toEmail, name: toName || toEmail }],
    subject,
    htmlContent: html,
  });

  return new Promise((resolve) => {
    const req = https.request(
      {
        method: 'POST',
        hostname: 'api.brevo.com',
        path: '/v3/smtp/email',
        headers: {
          'api-key': BREVO_API_KEY,
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(true);
          } else {
            console.error('Brevo send failed:', res.statusCode, body);
            resolve(false);
          }
        });
      },
    );

    req.on('error', (err) => {
      console.error('Brevo send error:', err);
      resolve(false);
    });

    req.write(payload);
    req.end();
  });
}

async function findUserByIdentifier(identifier) {
  const value = String(identifier ?? '').trim();
  if (!value) return null;

  const [[user]] = await db.query(
    `SELECT u.ID, u.user_login, u.user_email, u.display_name, u.user_type,
            ut.user_type_slug
     FROM tbl_users u
     LEFT JOIN tbl_user_types ut ON ut.user_type_id = u.user_type
     WHERE u.user_login = ? OR LOWER(u.user_email) = LOWER(?)
     LIMIT 1`,
    [value, value],
  );

  return user || null;
}

async function getAuthUserById(userId) {
  const [[user]] = await db.query(
    `SELECT u.ID, u.user_login, u.user_email, u.display_name, u.user_type,
            ut.user_type_slug
     FROM tbl_users u
     LEFT JOIN tbl_user_types ut ON ut.user_type_id = u.user_type
     WHERE u.ID = ?
     LIMIT 1`,
    [userId]
  );
  return user || null;
}

async function findGoogleAccount(googleSub, googleEmail) {
  const [[subMatch]] = await db.query(
    `SELECT u.ID, u.user_login, u.user_email, u.display_name, u.user_type,
            ut.user_type_slug
     FROM tbl_usermeta um
     INNER JOIN tbl_users u ON u.ID = um.user_id
     LEFT JOIN tbl_user_types ut ON ut.user_type_id = u.user_type
     WHERE um.meta_key = 'google_sub'
       AND um.meta_value = ?
     LIMIT 1`,
    [googleSub]
  );
  if (subMatch) {
    return { user: subMatch, matchedBy: 'sub' };
  }

  const [[emailMatch]] = await db.query(
    `SELECT u.ID, u.user_login, u.user_email, u.display_name, u.user_type,
            ut.user_type_slug
     FROM tbl_users u
     LEFT JOIN tbl_user_types ut ON ut.user_type_id = u.user_type
     WHERE u.user_email = ?
     LIMIT 1`,
    [googleEmail]
  );

  if (emailMatch) {
    return { user: emailMatch, matchedBy: 'email' };
  }

  return { user: null, matchedBy: 'new' };
}

async function verifyGoogleCredential(credential) {
  if (!credential) {
    throw new Error('Missing Google credential.');
  }

  const clientId = requireGoogleClientId();
  const res = await fetch(`${GOOGLE_TOKENINFO_URL}${encodeURIComponent(credential)}`);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || 'Google token verification failed.');
  }

  const payload = await res.json();
  if (String(payload.aud || '') !== clientId) {
    throw new Error('Google account does not match this app.');
  }

  const issuer = String(payload.iss || '');
  if (issuer !== 'accounts.google.com' && issuer !== 'https://accounts.google.com') {
    throw new Error('Google token issuer is invalid.');
  }

  if (!payload.sub || !payload.email) {
    throw new Error('Google account data is incomplete.');
  }

  return {
    sub: String(payload.sub),
    email: String(payload.email),
    emailVerified: String(payload.email_verified ?? '').toLowerCase() === 'true',
    name: String(payload.name || payload.email),
    givenName: String(payload.given_name || ''),
    familyName: String(payload.family_name || ''),
    picture: String(payload.picture || ''),
    hd: String(payload.hd || ''),
  };
}

// POST /store/api/auth/register
const register = async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ success: false, message: 'Username, email and password are required.' });
  }
  if (!VALID_EMAIL_RE.test(String(email).trim())) {
    return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
  }

  try {
    const [[existing]] = await db.query(
      'SELECT ID FROM tbl_users WHERE user_login = ? OR user_email = ? LIMIT 1',
      [username, email]
    );
    if (existing) {
      return res.status(409).json({ success: false, message: 'Username or email already exists.' });
    }

    const passwordLengthError = validateBcryptPasswordLength(password);
    if (passwordLengthError) {
      return res.status(400).json({ success: false, message: passwordLengthError });
    }

    const hashed = await bcrypt.hash(password, 12);
    const nicename = toSlug(username);

    const [result] = await db.query(
      `INSERT INTO tbl_users
       (user_type, user_login, user_email, user_pass, user_nicename, display_name, user_registered)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [3, username, email, hashed, nicename, username]
    );

    const newUserId = result.insertId;

    const oldSessionId = req.sessionId;
    const guestCookieId = req.guestId || null;
    await req.rotateSession();

    await mergeGuestCart(newUserId, oldSessionId, guestCookieId);

    setSessionUser(req, {
      ID: newUserId,
      user_type: 3,
      user_type_slug: 'customers',
      user_email: email,
      display_name: username,
      user_login: username,
    });

    res.json({
      success: true,
      message: 'Account created successfully.',
      data: { userId: newUserId },
    });
  } catch (err) {
    console.error('register error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// POST /store/api/auth/login
const login = async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required.' });
  }

  try {
    const [[user]] = await db.query(
      `SELECT u.ID, u.user_login, u.user_email, u.display_name, u.user_pass, u.user_type,
              ut.user_type_slug
       FROM tbl_users u
       LEFT JOIN tbl_user_types ut ON ut.user_type_id = u.user_type
       WHERE u.user_login = ? OR u.user_email = ?
       LIMIT 1`,
      [username, username]
    );

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid username or password.' });
    }

    const { ok, needsRehash } = await verifyPassword(password, user.user_pass);
    if (!ok) {
      return res.status(401).json({ success: false, message: 'Invalid username or password.' });
    }

    if (needsRehash) {
      const newHash = await bcrypt.hash(password, 12);
      await db.query('UPDATE tbl_users SET user_pass = ? WHERE ID = ?', [newHash, user.ID]);
    }

    const oldSessionId = req.sessionId;
    const guestCookieId = req.guestId || null;
    await req.rotateSession();

    await mergeGuestCart(user.ID, oldSessionId, guestCookieId);
    setSessionUser(req, user);

    res.json({
      success: true,
      message: 'Login successful.',
      data: {
        user: {
          id: user.ID,
          username: user.user_login,
          email: user.user_email,
          displayName: user.display_name,
          role: user.user_type_slug || roleSlugFromType(user.user_type),
          userType: user.user_type,
        }
      }
    });
  } catch (err) {
    console.error('login error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// POST /store/api/auth/google
const googleLogin = async (req, res) => {
  const { credential } = req.body || {};
  if (!credential) {
    return res.status(400).json({ success: false, message: 'Google credential is required.' });
  }

  try {
    const googleUser = await verifyGoogleCredential(credential);
    const { user: matchedUser, matchedBy } = await findGoogleAccount(googleUser.sub, googleUser.email);

    let user = matchedUser;
    let userId = matchedUser ? matchedUser.ID : null;

    if (!userId) {
      const nicenameBase = googleUser.givenName || googleUser.name || googleUser.email.split('@')[0];
      const nicename = toSlug(nicenameBase) || toSlug(googleUser.email) || `google-${googleUser.sub.slice(0, 12)}`;
      const displayName = googleUser.name || googleUser.email;
      const randomPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);

      const [result] = await db.query(
        `INSERT INTO tbl_users
         (user_type, user_login, user_pass, user_nicename, user_email, user_url, user_registered, user_activation_key, user_status, display_name)
         VALUES (?, ?, ?, ?, ?, ?, NOW(), '', 0, ?)`,
        [3, googleUser.email, randomPassword, nicename, googleUser.email, googleUser.picture || '', displayName]
      );

      userId = result.insertId;
      user = await getAuthUserById(userId);
    } else {
      if (matchedBy === 'sub' && user.user_email !== googleUser.email) {
        await db.query('UPDATE tbl_users SET user_email = ? WHERE ID = ?', [googleUser.email, userId]);
        user.user_email = googleUser.email;
      }

      if (!user.display_name || !String(user.display_name).trim()) {
        const displayName = googleUser.name || googleUser.email;
        await db.query('UPDATE tbl_users SET display_name = ? WHERE ID = ?', [displayName, userId]);
        user.display_name = displayName;
      }
    }

    if (!user) {
      user = await getAuthUserById(userId);
    }

    if (!user) {
      throw new Error('Google account could not be loaded.');
    }

    await setUserMetaEntries(userId, [
      { metaKey: 'auth_provider', metaValue: 'google' },
      { metaKey: 'google_sub', metaValue: googleUser.sub },
      { metaKey: 'google_email', metaValue: googleUser.email },
      { metaKey: 'google_name', metaValue: googleUser.name },
      { metaKey: 'google_picture', metaValue: googleUser.picture },
      ...(googleUser.givenName ? [{ metaKey: 'first_name', metaValue: googleUser.givenName }] : []),
      ...(googleUser.familyName ? [{ metaKey: 'last_name', metaValue: googleUser.familyName }] : []),
      ...(googleUser.hd ? [{ metaKey: 'google_hd', metaValue: googleUser.hd }] : []),
    ]);

    const oldSessionId = req.sessionId;
    const guestCookieId = req.guestId || null;
    await req.rotateSession();

    await mergeGuestCart(userId, oldSessionId, guestCookieId);
    setSessionUser(req, user);

    return res.json({
      success: true,
      message: 'Google login successful.',
      data: {
        user: {
          id: user.ID,
          username: user.user_login,
          email: googleUser.email,
          displayName: user.display_name || googleUser.name,
          firstName: googleUser.givenName,
          lastName: googleUser.familyName,
          role: user.user_type_slug || roleSlugFromType(user.user_type),
          userType: user.user_type,
        },
      },
    });
  } catch (err) {
    console.error('googleLogin error:', err);
    return res.status(401).json({
      success: false,
      message: err instanceof Error ? err.message : 'Google sign-in failed.',
    });
  }
};

// POST /store/api/auth/logout
const logout = async (req, res) => {
  try {
    await req.destroySession();
    res.json({ success: true, message: 'Logged out.' });
  } catch (err) {
    console.error('logout error:', err);
    res.status(500).json({ success: false, message: 'Logout failed.' });
  }
};

// GET /store/api/auth/me
const me = async (req, res) => {
  const user = req.sessionData && req.sessionData.user;
  if (!user) {
    return res.json({
      success: true,
      data: { isLoggedIn: false, role: 'guest', sessionId: req.sessionId }
    });
  }

  // Fetch first_name and last_name from tbl_usermeta
  const [metaRows] = await db.query(
    `SELECT meta_key, meta_value FROM tbl_usermeta WHERE user_id = ? AND meta_key IN ('first_name','last_name')`,
    [user.id]
  );
  const meta = {};
  metaRows.forEach(r => { meta[r.meta_key] = r.meta_value; });

  res.json({
    success: true,
    data: {
      isLoggedIn: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.name,
        firstName: meta['first_name'] || '',
        lastName: meta['last_name'] || '',
        role: user.userTypeSlug,
        userType: user.userType,
      }
    }
  });
};

// PUT /store/api/auth/profile
const updateProfile = async (req, res) => {
  const sessionUser = req.sessionData && req.sessionData.user;
  if (!sessionUser) {
    return res.status(401).json({ success: false, message: 'Not logged in.' });
  }

  const { displayName, email, firstName, lastName, currentPassword, newPassword } = req.body;

  if (!displayName || !displayName.trim()) {
    return res.status(400).json({ success: false, message: 'Display name is required.' });
  }
  if (!email || !VALID_EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ success: false, message: 'A valid email is required.' });
  }

  try {
    const [[user]] = await db.query(
      'SELECT ID, user_pass, user_email FROM tbl_users WHERE ID = ? LIMIT 1',
      [sessionUser.id]
    );
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    // Check email uniqueness if changed
    if (email.trim().toLowerCase() !== user.user_email.toLowerCase()) {
      const [[taken]] = await db.query(
        'SELECT ID FROM tbl_users WHERE user_email = ? AND ID != ? LIMIT 1',
        [email.trim(), user.ID]
      );
      if (taken) return res.status(409).json({ success: false, message: 'Email already in use.' });
    }

    // Password reset
    let newHash = null;
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ success: false, message: 'Current password is required to set a new password.' });
      }
      const { ok } = await verifyPassword(currentPassword, user.user_pass);
      if (!ok) {
        return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
      }
      const passwordLengthError = validateBcryptPasswordLength(newPassword);
      if (passwordLengthError) {
        return res.status(400).json({ success: false, message: passwordLengthError });
      }
      newHash = await bcrypt.hash(newPassword, 12);
    }

    const updates = [
      'display_name = ?',
      'user_email = ?',
    ];
    const values = [displayName.trim(), email.trim()];

    if (newHash) {
      updates.push('user_pass = ?');
      values.push(newHash);
    }

    values.push(user.ID);
    await db.query(`UPDATE tbl_users SET ${updates.join(', ')} WHERE ID = ?`, values);

    // Save first/last name to tbl_usermeta
    if (firstName !== undefined || lastName !== undefined) {
      const upsertMeta = async (key, value) => {
        await db.query(
          `INSERT INTO tbl_usermeta (user_id, meta_key, meta_value)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE meta_value = VALUES(meta_value)`,
          [user.ID, key, String(value ?? '')]
        );
      };
      if (firstName !== undefined) await upsertMeta('first_name', firstName.trim());
      if (lastName  !== undefined) await upsertMeta('last_name',  lastName.trim());
    }

    // Update session
    req.sessionData.user.name  = displayName.trim();
    req.sessionData.user.email = email.trim();
    req.touchSession();

    return res.json({
      success: true,
      message: 'Profile updated successfully.',
      data: {
        id: user.ID,
        username: sessionUser.username,
        email: email.trim(),
        displayName: displayName.trim(),
        role: sessionUser.userTypeSlug,
        userType: sessionUser.userType,
      },
    });
  } catch (err) {
    console.error('updateProfile error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// POST /store/api/auth/forgot-password
const requestPasswordReset = async (req, res) => {
  const identifier = String((req.body && req.body.identifier) || '').trim();
  if (!identifier) {
    return res.status(400).json({ success: false, message: 'Username or email is required.' });
  }

  try {
    const user = await findUserByIdentifier(identifier);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = sha256(rawToken);
    const expiresAt = String(Date.now() + RESET_TOKEN_TTL_MS);

    await setUserMetaEntries(user.ID, [
      { metaKey: RESET_TOKEN_HASH_META, metaValue: tokenHash },
      { metaKey: RESET_TOKEN_EXPIRES_META, metaValue: expiresAt },
    ]);

    let resetBaseUrl;
    try {
      resetBaseUrl = getResetCheckoutBaseUrl();
    } catch (urlErr) {
      console.error('requestPasswordReset frontend URL error:', urlErr);
      return res.status(500).json({
        success: false,
        message: 'Password reset is not configured correctly. Set RESET_URL to your public checkout URL.',
      });
    }
    const resetUrl = `${resetBaseUrl}?login=1&reset=${encodeURIComponent(rawToken)}`;
    const displayName = user.display_name || user.user_login || 'there';
    const emailHtml = `
      <div style="margin:0; padding:0; background:#f5efe8;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f5efe8; padding:32px 0;">
          <tr>
            <td align="center">
              <table role="presentation" cellpadding="0" cellspacing="0" width="640" style="max-width:640px; background:#ffffff; border-radius:16px; overflow:hidden; border:1px solid #eadfce;">
                <tr>
                  <td style="background:#22311d; color:#ffffff; padding:24px 28px; font-family: Arial, sans-serif; font-size:22px; font-weight:700; letter-spacing:1px;">
                    NESTCASE
                  </td>
                </tr>
                <tr>
                  <td style="padding:28px; font-family: Arial, sans-serif; color:#1b1b1b;">
                    <h2 style="margin:0 0 12px; font-size:24px; color:#22311d;">Reset your password</h2>
                    <p style="margin:0 0 14px; color:#343434; font-size:15px; line-height:1.7;">Hi ${escapeHtml(displayName)},</p>
                    <p style="margin:0 0 18px; color:#343434; font-size:15px; line-height:1.7;">
                      We received a request to reset your password. Click the button below to open the password reset page and choose a new password.
                      This link will expire in 1 hour.
                    </p>
                    <p style="margin:0 0 24px;">
                      <a href="${resetUrl}" style="display:inline-block; background:#22311d; color:#ffffff; text-decoration:none; padding:14px 22px; border-radius:8px; font-size:14px; font-weight:700; letter-spacing:0.04em;">
                        Reset password
                      </a>
                    </p>
                    <p style="margin:0; color:#6f6459; font-size:13px; line-height:1.7;">
                      If you did not request this reset, you can safely ignore this email.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    `;

    const sent = await sendBrevoEmail({
      toEmail: user.user_email,
      toName: displayName,
      subject: 'Reset your Nestcase password',
      html: emailHtml,
    });

    if (!sent) {
      await clearPasswordResetToken(user.ID);
      return res.status(500).json({
        success: false,
        message: 'Unable to send the reset email right now. Please try again later.',
      });
    }

    return res.json({
      success: true,
      message: 'A password reset link has been sent to the registered email address.',
    });
  } catch (err) {
    console.error('requestPasswordReset error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// POST /store/api/auth/reset-password
const resetPassword = async (req, res) => {
  const token = String((req.body && req.body.token) || '').trim();
  const password = String((req.body && req.body.password) || '');
  const confirmPassword = String((req.body && req.body.confirmPassword) || '');

  if (!token || !password || !confirmPassword) {
    return res.status(400).json({
      success: false,
      message: 'Token, password and confirm password are required.',
    });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ success: false, message: 'Passwords do not match.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
  }

  try {
    const tokenHash = sha256(token);
    const [[record]] = await db.query(
      `SELECT u.ID, u.display_name, u.user_email,
              hash_meta.meta_value AS token_hash,
              expires_meta.meta_value AS token_expires
       FROM tbl_users u
       INNER JOIN tbl_usermeta hash_meta
         ON hash_meta.user_id = u.ID AND hash_meta.meta_key = ?
       INNER JOIN tbl_usermeta expires_meta
         ON expires_meta.user_id = u.ID AND expires_meta.meta_key = ?
       WHERE hash_meta.meta_value = ?
       LIMIT 1`,
      [RESET_TOKEN_HASH_META, RESET_TOKEN_EXPIRES_META, tokenHash],
    );

    if (!record) {
      return res.status(400).json({
        success: false,
        message: 'Reset link is invalid or has expired.',
      });
    }

    const expiresAt = Number(record.token_expires || 0);
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
      await clearPasswordResetToken(record.ID);
      return res.status(400).json({
        success: false,
        message: 'Reset link is invalid or has expired.',
      });
    }

    const passwordLengthError = validateBcryptPasswordLength(password);
    if (passwordLengthError) {
      return res.status(400).json({ success: false, message: passwordLengthError });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('UPDATE tbl_users SET user_pass = ? WHERE ID = ?', [hashedPassword, record.ID]);
      await clearPasswordResetTokenInConn(conn, record.ID);
      await conn.commit();
    } catch (txErr) {
      try {
        await conn.rollback();
      } catch {}
      throw txErr;
    } finally {
      conn.release();
    }

    return res.json({
      success: true,
      message: 'Password updated successfully. You can now log in with your new password.',
    });
  } catch (err) {
    console.error('resetPassword error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = {
  register,
  login,
  googleLogin,
  logout,
  me,
  updateProfile,
  requestPasswordReset,
  resetPassword,
};