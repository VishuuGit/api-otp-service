const crypto = require("crypto");
const pool = require("../config/db");

function generateOtp() {
  return ("" + Math.floor(100000 + Math.random() * 900000));
}

// POST /otp/request
exports.requestOtp = async (req, res) => {
  const { user_id, purpose } = req.body;
  const ip = req.ip;
  const idempotencyKey = req.headers["idempotency-key"];

  if (!user_id || !purpose) {
    return res.status(400).json({ error: "user_id and purpose required" });
  }
  if (!idempotencyKey) {
    return res.status(400).json({ error: "Idempotency-Key required" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // -------- Per-User Throttle: 3 per 15 minutes --------
    const [userReqs] = await conn.query(
      "SELECT created_at FROM otp_requests WHERE user_id=? AND created_at > NOW() - INTERVAL 15 MINUTE ORDER BY created_at ASC",
      [user_id]
    );

    if (userReqs.length >= 3) {
      // oldest request in window → defines cooldown expiry
      const oldest = new Date(userReqs[0].created_at);
      const cooldownExpiry = new Date(oldest.getTime() + 15 * 60 * 1000);
      const remaining = Math.ceil((cooldownExpiry - Date.now()) / 1000);
      await conn.rollback();
      return res.status(429).json({
        error: "Too many requests for this user",
        retry_after: remaining > 0 ? remaining : 0
      });
    }

    // -------- Per-IP Throttle: 8 per 15 minutes --------
    const [ipReqs] = await conn.query(
      "SELECT created_at FROM otp_requests WHERE ip=? AND created_at > NOW() - INTERVAL 15 MINUTE ORDER BY created_at ASC",
      [ip]
    );

    if (ipReqs.length >= 8) {
      const oldest = new Date(ipReqs[0].created_at);
      const cooldownExpiry = new Date(oldest.getTime() + 15 * 60 * 1000);
      const remaining = Math.ceil((cooldownExpiry - Date.now()) / 1000);
      await conn.rollback();
      return res.status(429).json({
        error: "Too many requests from this IP",
        retry_after: remaining > 0 ? remaining : 0
      });
    }

    // check idempotency
    const [idemRows] = await conn.query(
      "SELECT * FROM idempotency WHERE idempotency_key=? AND created_at > NOW() - INTERVAL 10 MINUTE",
      [idempotencyKey]
    );
    if (idemRows.length > 0) {
      await conn.rollback();
      return res.status(200).json(JSON.parse(idemRows[0].response_json));
    }

    // enforce one active OTP
    await conn.query(
      "DELETE FROM otps WHERE user_id=? AND purpose=? AND expires_at > NOW()",
      [user_id, purpose]
    );

    const otpCode = generateOtp();
    const ttl = 300; // 5 minutes

    const [result] = await conn.query(
      "INSERT INTO otps (user_id, purpose, code, expires_at) VALUES (?, ?, ?, NOW() + INTERVAL 5 MINUTE)",
      [user_id, purpose, otpCode]
    );

    const response = { otp_id: result.insertId, ttl };
    await conn.query(
      "INSERT INTO idempotency (idempotency_key, response_json) VALUES (?, ?)",
      [idempotencyKey, JSON.stringify(response)]
    );

    await conn.commit();
    return res.status(201).json(response);
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: "Internal error" });
  } finally {
    conn.release();
  }
};

// POST /otp/verify
exports.verifyOtp = async (req, res) => {
  const { user_id, purpose, code } = req.body;
  if (!user_id || !purpose || !code) {
    return res.status(400).json({ error: "user_id, purpose, and code required" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      "SELECT * FROM otps WHERE user_id=? AND purpose=? AND expires_at > NOW() FOR UPDATE",
      [user_id, purpose]
    );

    if (rows.length === 0) {
      await conn.rollback();
      return res.status(400).json({ error: "No active OTP" });
    }

    const otp = rows[0];

    if (otp.used) {
      await conn.rollback();
      return res.status(410).json({ error: "code_used" });
    }

    if (otp.attempts >= 3) {
      await conn.rollback();
      return res.status(429).json({ error: "Too many attempts, locked for 10 min" });
    }

    if (otp.code === code) {
      await conn.query("UPDATE otps SET used=1 WHERE id=?", [otp.id]);
      await conn.commit();
      return res.status(200).json({ success: true });
    } else {
      await conn.query("UPDATE otps SET attempts=attempts+1 WHERE id=?", [otp.id]);
      await conn.commit();
      return res.status(401).json({ error: "Invalid code" });
    }
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: "Internal error" });
  } finally {
    conn.release();
  }
};
