const SENSITIVE_FIELDS = new Set(["password", "passwordHash"]);

const PARTIAL_MASK = {
  email: (v) => {
    if (!v || !v.includes("@")) return v;
    const [local, domain] = v.split("@");
    return local.slice(0, 2) + "***@" + domain;
  },
  phone: (v) => v ? v.slice(0, 3) + "****" + v.slice(-2) : v,
};

function maskObject(obj) {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(maskObject);

  const masked = { ...obj };
  for (const field of SENSITIVE_FIELDS) delete masked[field];
  for (const [field, fn] of Object.entries(PARTIAL_MASK)) {
    if (masked[field]) masked[field] = fn(masked[field]);
  }
  for (const [k, v] of Object.entries(masked)) {
    if (v && typeof v === "object") masked[k] = maskObject(v);
  }
  return masked;
}

function maskResponse(req, res, next) {
  const role = req.user?.role;

  // Non-operations roles: passwords are excluded by explicit `select` in queries.
  // Auth routes strip passwords explicitly. Nothing to mask — pass through.
  if (!role || role !== "operations") return next();

  const originalJson = res.json.bind(res);
  res.json = function (body) {
    return originalJson(maskObject(body));
  };
  next();
}

module.exports = { maskResponse };
