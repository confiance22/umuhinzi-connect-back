const bcrypt = require('bcryptjs');
const db = require('../db');
const { asyncHandler, ok, ApiError } = require('../utils/http');
const { normalizePhone, phoneSearchVariants } = require('../utils/validate');

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ADMIN_USER_SELECT = `
  u.id,
  u.full_name,
  u.phone,
  u.email,
  u.role,
  u.province,
  u.district,
  u.sector,
  u.cell,
  u.village,
  u.village_code,
  u.enabled,
  u.account_non_locked,
  u.last_login_at,
  u.created_at,
  u.updated_at,
  r.id AS role_id,
  r.name AS role_name,
  r.description AS role_description
`;

const cleanOptional = (value) => {
  const trimmed = String(value || '').trim();
  return trimmed ? trimmed : null;
};

const userStatus = (row) => {
  if (!row.account_non_locked) return 'Locked';
  if (!row.enabled) return 'Inactive';
  return 'Active';
};

const toAdminUser = (row) => {
  const roleObject = row.role_id
    ? {
        id: row.role_id,
        key: row.role,
        name: row.role_name,
        description: row.role_description
      }
    : null;

  return {
    id: row.id,
    full_name: row.full_name,
    name: row.full_name,
    phone: row.phone,
    username: row.phone,
    email: row.email,
    role: row.role,
    roles: roleObject ? [roleObject] : [],
    roleId: row.role_id,
    roleName: row.role_name,
    province: row.province,
    district: row.district,
    sector: row.sector,
    cell: row.cell,
    village: row.village,
    village_code: row.village_code,
    enabled: row.enabled,
    account_non_locked: row.account_non_locked,
    accountNonLocked: row.account_non_locked,
    status: userStatus(row),
    last_login_at: row.last_login_at,
    lastLoginAt: row.last_login_at,
    created_at: row.created_at,
    createdAt: row.created_at,
    updated_at: row.updated_at,
    updatedAt: row.updated_at
  };
};

const toPermission = (row) => ({
  id: row.id,
  key: row.key,
  name: row.key,
  label: row.label,
  description: row.description,
  category: row.group_name,
  active: true,
  createdAt: row.created_at
});

async function findAdminUser(id) {
  const { rows } = await db.query(
    `SELECT ${ADMIN_USER_SELECT}
       FROM users u
       LEFT JOIN roles r ON r.key = u.role
      WHERE u.id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function countSuperAdmins(excludeId = null) {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS count
       FROM users
      WHERE role = 'super_admin'
        AND ($1::uuid IS NULL OR id <> $1)`,
    [excludeId]
  );
  return rows[0]?.count || 0;
}

async function assertUniqueContact({ phone, email, excludeId = null }) {
  const phoneVariants = phoneSearchVariants(phone);
  const { rows } = await db.query(
    `SELECT id, phone, email
       FROM users
      WHERE (phone = ANY($1::text[]) OR ($2::text IS NOT NULL AND LOWER(email) = $2))
        AND ($3::uuid IS NULL OR id <> $3)`,
    [phoneVariants, email, excludeId]
  );

  if (!rows.length) return;

  if (rows.some((row) => phoneVariants.includes(row.phone))) {
    throw new ApiError(409, 'This phone number is already registered.', {
      phone: 'This phone number is already registered.'
    });
  }
  throw new ApiError(409, 'This email address is already registered.', {
    email: 'This email address is already registered.'
  });
}

async function assertCanRemoveSuperAdmin(target, nextRole, nextEnabled, nextLocked) {
  if (target.role !== 'super_admin') return;

  const stillSuperAdmin = nextRole === 'super_admin';
  const staysActive = nextEnabled !== false && nextLocked !== false;
  if (stillSuperAdmin && staysActive) return;

  const remaining = await countSuperAdmins(target.id);
  if (remaining < 1) {
    throw new ApiError(
      409,
      'At least one active super admin account must remain on the platform.'
    );
  }
}

const getUsers = asyncHandler(async (req, res) => {
  const search = String(req.query.search || '').trim();
  const role = String(req.query.role || '').trim();
  const status = String(req.query.status || '').trim();

  const conditions = [];
  const params = [];

  if (search) {
    params.push(`%${search}%`);
    conditions.push(
      `(u.full_name ILIKE $${params.length}
        OR u.phone ILIKE $${params.length}
        OR COALESCE(u.email, '') ILIKE $${params.length})`
    );
  }

  if (['farmer', 'buyer', 'super_admin'].includes(role)) {
    params.push(role);
    conditions.push(`u.role = $${params.length}`);
  }

  if (status === 'Active') conditions.push('u.enabled = TRUE AND u.account_non_locked = TRUE');
  if (status === 'Inactive') conditions.push('u.enabled = FALSE');
  if (status === 'Locked') conditions.push('u.account_non_locked = FALSE');

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await db.query(
    `SELECT ${ADMIN_USER_SELECT}
       FROM users u
       LEFT JOIN roles r ON r.key = u.role
       ${where}
      ORDER BY u.created_at DESC`,
    params
  );

  return ok(res, rows.map(toAdminUser));
});

const createUser = asyncHandler(async (req, res) => {
  const name = String(req.body.name || req.body.full_name || '').trim();
  const phone = normalizePhone(req.body.phone);
  const email = cleanOptional(req.body.email)?.toLowerCase() || null;
  const role = req.body.role;
  const district = cleanOptional(req.body.district);
  const sector = cleanOptional(req.body.sector);
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  await assertUniqueContact({ phone, email });

  const passwordHash = await bcrypt.hash(password, 10);
  const { rows } = await db.query(
    `INSERT INTO users (
       full_name, phone, email, password_hash, role, district, sector,
       enabled, account_non_locked
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, TRUE)
     RETURNING id`,
    [name, phone, email, passwordHash, role, district, sector]
  );

  const created = await findAdminUser(rows[0].id);
  return ok(res, toAdminUser(created), 201);
});

const updateUser = asyncHandler(async (req, res) => {
  const target = await findAdminUser(req.params.id);
  if (!target) throw new ApiError(404, 'User not found.');

  const name = String(req.body.name || req.body.full_name || '').trim();
  const phone = normalizePhone(req.body.phone);
  const email = cleanOptional(req.body.email)?.toLowerCase() || null;
  const role = req.body.role || target.role;
  const enabled =
    typeof req.body.enabled === 'boolean' ? req.body.enabled : target.enabled;
  const district =
    req.body.district !== undefined ? cleanOptional(req.body.district) : target.district;
  const sector =
    req.body.sector !== undefined ? cleanOptional(req.body.sector) : target.sector;
  const isSelf = target.id === req.user.id;

  if (isSelf && role !== target.role) {
    throw new ApiError(403, 'You cannot change your own role.');
  }
  if (isSelf && enabled === false) {
    throw new ApiError(403, 'You cannot disable your own account.');
  }

  await assertUniqueContact({ phone, email, excludeId: target.id });
  await assertCanRemoveSuperAdmin(target, role, enabled, target.account_non_locked);

  await db.query(
    `UPDATE users
        SET full_name = $1,
            phone = $2,
            email = $3,
            role = $4,
            district = $5,
            sector = $6,
            enabled = $7,
            updated_at = NOW()
      WHERE id = $8`,
    [name, phone, email, role, district, sector, enabled, target.id]
  );

  const updated = await findAdminUser(target.id);
  return ok(res, toAdminUser(updated));
});

const setUserStatus = async (req, res) => {
  const target = await findAdminUser(req.params.id);
  if (!target) throw new ApiError(404, 'User not found.');

  const hasEnabled = typeof req.body.enabled === 'boolean';
  const hasLocked =
    typeof req.body.accountNonLocked === 'boolean' ||
    typeof req.body.account_non_locked === 'boolean';

  if (!hasEnabled && !hasLocked) {
    throw new ApiError(422, 'Choose an account status to update.');
  }

  const enabled = hasEnabled ? req.body.enabled : target.enabled;
  const accountNonLocked = hasLocked
    ? Boolean(req.body.accountNonLocked ?? req.body.account_non_locked)
    : target.account_non_locked;

  if (target.id === req.user.id && (enabled === false || accountNonLocked === false)) {
    throw new ApiError(403, 'You cannot disable or lock your own account.');
  }

  await assertCanRemoveSuperAdmin(target, target.role, enabled, accountNonLocked);

  await db.query(
    `UPDATE users
        SET enabled = $1, account_non_locked = $2, updated_at = NOW()
      WHERE id = $3`,
    [enabled, accountNonLocked, target.id]
  );

  const updated = await findAdminUser(target.id);
  return ok(res, toAdminUser(updated));
};

const updateUserStatus = asyncHandler(setUserStatus);

const deleteUser = asyncHandler(async (req, res) => {
  const target = await findAdminUser(req.params.id);
  if (!target) throw new ApiError(404, 'User not found.');

  if (target.id === req.user.id) {
    throw new ApiError(403, 'You cannot delete your own account.');
  }

  if (target.role === 'super_admin') {
    const remaining = await countSuperAdmins(target.id);
    if (remaining < 1) {
      throw new ApiError(409, 'At least one super admin account must remain.');
    }
  }

  await db.query('DELETE FROM users WHERE id = $1', [target.id]);
  return ok(res, { id: target.id });
});

const blockUser = asyncHandler(async (req, res) => {
  req.body = { accountNonLocked: false };
  return setUserStatus(req, res);
});

const unblockUser = asyncHandler(async (req, res) => {
  req.body = { accountNonLocked: true };
  return setUserStatus(req, res);
});

const getRoles = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT
       r.id,
       r.key,
       r.name,
       r.description,
       r.created_at,
       (SELECT COUNT(*)::int FROM users u WHERE u.role = r.key) AS user_count,
       COALESCE((
         SELECT json_agg(
           json_build_object(
             'id', p.id,
             'key', p.key,
             'name', p.key,
             'label', p.label,
             'description', p.description,
             'category', p.group_name,
             'active', TRUE
           )
           ORDER BY p.group_name, p.key
         )
           FROM role_permissions rp
           JOIN permissions p ON p.id = rp.permission_id
          WHERE rp.role_id = r.id
       ), '[]'::json) AS permissions
     FROM roles r
     ORDER BY
       CASE r.key
         WHEN 'super_admin' THEN 1
         WHEN 'farmer' THEN 2
         WHEN 'buyer' THEN 3
         ELSE 4
       END,
       r.name`
  );

  return ok(
    res,
    rows.map((row) => ({
      id: row.id,
      key: row.key,
      name: row.name,
      description: row.description,
      active: true,
      createdAt: row.created_at,
      userCount: row.user_count,
      permissions: row.permissions || []
    }))
  );
});

const getPermissions = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, key, label, group_name, description, created_at
       FROM permissions
      ORDER BY group_name, key`
  );
  return ok(res, rows.map(toPermission));
});

const assignRolePermissions = asyncHandler(async (req, res) => {
  const { rows: roleRows } = await db.query(
    'SELECT id, key, name FROM roles WHERE id = $1',
    [req.params.id]
  );
  const role = roleRows[0];
  if (!role) throw new ApiError(404, 'Role not found.');

  if (role.key === 'super_admin') {
    throw new ApiError(403, 'Super Admin access is fixed and cannot be limited.');
  }

  const permissionIds = [...new Set((req.body.permissionIds || []).map(String))];
  if (permissionIds.some((id) => !UUID_RE.test(id))) {
    throw new ApiError(422, 'One or more permissions are invalid.');
  }

  if (permissionIds.length > 0) {
    const { rows } = await db.query(
      'SELECT COUNT(*)::int AS count FROM permissions WHERE id = ANY($1::uuid[])',
      [permissionIds]
    );
    if (rows[0].count !== permissionIds.length) {
      throw new ApiError(422, 'One or more permissions do not exist.');
    }
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM role_permissions WHERE role_id = $1', [role.id]);
    if (permissionIds.length > 0) {
      await client.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT $1, unnest($2::uuid[])
         ON CONFLICT (role_id, permission_id) DO NOTHING`,
        [role.id, permissionIds]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return ok(res, {
    message: `${role.name} permissions updated.`,
    permissionIds
  });
});

const updateSelf = asyncHandler(async (req, res) => {
  const name = String(req.body.name || req.body.full_name || '').trim();
  const phone = normalizePhone(req.body.phone);
  const email = cleanOptional(req.body.email)?.toLowerCase() || null;

  await assertUniqueContact({ phone, email, excludeId: req.user.id });

  const { rows } = await db.query(
    `UPDATE users
        SET full_name = $1, phone = $2, email = $3, updated_at = NOW()
      WHERE id = $4
      RETURNING id, full_name, phone, email, role, province, district, sector, cell, village, village_code,
                enabled, account_non_locked, last_login_at, created_at, updated_at`,
    [name, phone, email, req.user.id]
  );

  const user = rows[0];
  return ok(res, {
    ...user,
    name: user.full_name,
    username: user.phone,
    accountNonLocked: user.account_non_locked,
    createdAt: user.created_at
  });
});

const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const { rows } = await db.query(
    'SELECT password_hash FROM users WHERE id = $1',
    [req.user.id]
  );
  const user = rows[0];
  if (!user) throw new ApiError(404, 'Account not found.');

  const matches = await bcrypt.compare(currentPassword, user.password_hash);
  if (!matches) {
    throw new ApiError(422, 'Your current password is incorrect.', {
      currentPassword: 'Your current password is incorrect.'
    });
  }

  if (currentPassword === newPassword) {
    throw new ApiError(422, 'Choose a password you have not used before.');
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.query(
    `UPDATE users
        SET password_hash = $1, updated_at = NOW()
      WHERE id = $2`,
    [passwordHash, req.user.id]
  );

  return ok(res, { message: 'Password updated successfully.' });
});

module.exports = {
  getUsers,
  createUser,
  updateUser,
  updateUserStatus,
  deleteUser,
  blockUser,
  unblockUser,
  getRoles,
  getPermissions,
  assignRolePermissions,
  updateSelf,
  changePassword
};
