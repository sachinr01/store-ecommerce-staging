const crypto = require('crypto');
const db = require('../config/db');

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'store_sid';
const SESSION_SECRET = process.env.SESSION_SECRET;
const TTL_DAYS = Number.parseInt(process.env.SESSION_TTL_DAYS || '7', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';
const DEFAULT_SAMESITE = NODE_ENV === 'production' ? 'none' : 'lax';
const SAME_SITE = String(process.env.SESSION_SAMESITE || DEFAULT_SAMESITE).toLowerCase();
const SECURE = process.env.SESSION_SECURE === 'true'
  || (NODE_ENV === 'production' && SAME_SITE === 'none');
const COOKIE_PATH = process.env.SESSION_COOKIE_PATH || '/';
const HTTP_ONLY = true;

const isSameSiteValue = (value) => ['lax', 'strict', 'none'].includes(value);

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx < 0) return;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) return;
    out[key] = decodeURIComponent(value);
  });
  return out;
}

function buildCookie(name, value, opts) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (opts.maxAge != null) parts.push(`Max-Age=${Math.floor(opts.maxAge / 1000)}`);
  if (opts.expires) parts.push(`Expires=${new Date(opts.expires).toUTCString()}`);
  parts.push(`Path=${opts.path || '/'}`);
  if (opts.httpOnly) parts.push('HttpOnly');
  if (opts.secure) parts.push('Secure');
  if (opts.sameSite && isSameSiteValue(opts.sameSite)) {
    const formatted = opts.sameSite[0].toUpperCase() + opts.sameSite.slice(1);
    parts.push(`SameSite=${formatted}`);
  }
  return parts.join('; ');
}

function setCookie(res, cookieName, cookieValue, opts) {
  const cookieStr = buildCookie(cookieName, cookieValue, opts);
  const prev = res.getHeader('Set-Cookie');
  const next = [];
  if (Array.isArray(prev)) {
    prev.forEach(item => {
      if (!String(item).startsWith(`${cookieName}=`)) next.push(item);
    });
  } else if (prev && !String(prev).startsWith(`${cookieName}=`)) {
    next.push(prev);
  }
  next.push(cookieStr);
  res.setHeader('Set-Cookie', next);
}

function sign(value) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('hex').slice(0, 32);
}

function packCookieValue(sessionId) {
  return `${sessionId}.${sign(sessionId)}`;
}

function unpackCookieValue(raw) {
  if (!raw) return null;
  const [sessionId, sig] = String(raw).split('.');
  if (!sessionId || !sig) return null;
  if (sign(sessionId) !== sig) return null;
  return sessionId;
}

function newSessionId() {
  return crypto.randomBytes(32).toString('hex');
}

async function loadSession(sessionId) {
  const [rows] = await db.query(
    'SELECT session_id, expires, data FROM sessions WHERE session_id = ? LIMIT 1',
    [sessionId]
  );
  return rows && rows.length ? rows[0] : null;
}

function parseSessionData(raw) {
  if (!raw) return {};
  try {
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

async function saveSession(sessionId, expiresAtMs, data) {
  const expires = Math.floor(expiresAtMs / 1000);
  const payload = JSON.stringify(data);
  await db.query(
    `INSERT INTO sessions (session_id, expires, data)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE expires = VALUES(expires), data = VALUES(data)`,
    [sessionId, expires, payload]
  );
}

async function deleteSession(sessionId) {
  await db.query('DELETE FROM sessions WHERE session_id = ?', [sessionId]);
}

function sessionMiddleware() {
  return async (req, res, next) => {
    const now = Date.now();
    const ttlMs = Math.max(TTL_DAYS, 1) * 24 * 60 * 60 * 1000;
    const cookies = parseCookies(req.headers.cookie || '');
    let sessionId = unpackCookieValue(cookies[COOKIE_NAME]);
    let sessionRow = null;
    let sessionData = {};
    let isNew = false;

    if (sessionId) {
      sessionRow = await loadSession(sessionId);
      if (sessionRow && sessionRow.expires * 1000 > now) {
        sessionData = parseSessionData(sessionRow.data);
      } else {
        sessionRow = null;
        sessionId = null;
      }
    }

    if (!sessionId) {
      sessionId = newSessionId();
      isNew = true;
    }

    const expiresAt = now + ttlMs;
    sessionData.cookie = {
      originalMaxAge: ttlMs,
      expires: new Date(expiresAt).toISOString(),
      secure: SECURE,
      httpOnly: HTTP_ONLY,
      path: COOKIE_PATH,
      sameSite: SAME_SITE,
    };

    req.sessionId = sessionId;
    req.sessionData = sessionData;
    req.sessionNew = isNew;
    req.sessionTouched = isNew;
    req.sessionExpiresAt = expiresAt;

    req.touchSession = () => { req.sessionTouched = true; };

    req.saveSession = async () => {
      await saveSession(req.sessionId, req.sessionExpiresAt, req.sessionData);
      req.sessionTouched = false;
    };

    req.rotateSession = async () => {
      const oldId = req.sessionId;
      const newId = newSessionId();
      req.sessionId = newId;
      req.sessionTouched = true;
      req.sessionExpiresAt = Date.now() + ttlMs;
      setCookie(res, COOKIE_NAME, packCookieValue(newId), {
        maxAge: ttlMs,
        expires: req.sessionExpiresAt,
        httpOnly: HTTP_ONLY,
        secure: SECURE,
        sameSite: SAME_SITE,
        path: COOKIE_PATH,
      });
      if (oldId) await deleteSession(oldId);
      return { oldId, newId };
    };

    req.destroySession = async () => {
      const oldId = req.sessionId;
      req.sessionData = {};
      req.sessionTouched = false;
      if (oldId) await deleteSession(oldId);
      setCookie(res, COOKIE_NAME, '', {
        maxAge: 0,
        expires: Date.now() - 1000,
        httpOnly: HTTP_ONLY,
        secure: SECURE,
        sameSite: SAME_SITE,
        path: COOKIE_PATH,
      });
    };

    setCookie(res, COOKIE_NAME, packCookieValue(sessionId), {
      maxAge: ttlMs,
      expires: expiresAt,
      httpOnly: HTTP_ONLY,
      secure: SECURE,
      sameSite: SAME_SITE,
      path: COOKIE_PATH,
    });

    res.on('finish', () => {
      if (req.sessionTouched) {
        saveSession(req.sessionId, req.sessionExpiresAt, req.sessionData)
          .catch(err => console.error('session save error:', err));
      }
    });

    next();
  };
}

function getSessionUser(req) {
  const user = req.sessionData && req.sessionData.user;
  if (!user || !user.id) return null;
  return user;
}

module.exports = {
  sessionMiddleware,
  getSessionUser,
  COOKIE_NAME,
};
